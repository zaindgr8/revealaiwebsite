# Phase 2 — deferred work

Everything here is **out of the 26 August delivery** and priced separately.

Two sources feed this list. The first is PRD v0.3 §8, "What got cut to fit three
weeks" — the client has already seen those and agreed to them. The second is
work identified during the build itself. Anything in the second group that
arrived after **12 August** is bound by the scope freeze: it does not go into
this delivery, and raising it does not make it free.

The rule from the demo plan applies to this file. *"If something new comes up
during a demo I will note it and price it separately rather than absorbing it
and going late."* This is where noting it happens.

---

## Carried from PRD v0.3 §8

The client has seen and accepted these. They are out because three weeks does
not fit them, not because they are hard.

| | Note |
|---|---|
| Re-recording a voice sample from Settings | Enrol once. Support handles resets. |
| Automatic expiry of old recordings | Manual deletion ships (N-2). Scheduled expiry does not. |
| Search and filtering on analysis history | List view only. |
| More than three scenarios | Date, interview, general. |
| Multi-speaker recordings | Two people only. |
| Accuracy tuning past the 90% quiet-room threshold | I-4 is a floor, not a target. |

---

## Identified during the build

### P2-1 — Post-turn background summarisation

**What.** Write and refresh a session's summary in the background after each
turn, instead of only when the user clicks *End session*.

**Why it is worth doing.** The current design assumes the click happens. It
usually does not. `sweepAbandonedSessions` (`lib/ai.ts:433`) exists entirely to
paper over that, and it is the weakest thing in the Feature 1 write path:

- It is client-triggered, so it only runs when *somebody* opens a new chat.
- It is fire-and-forget (`void sweep(...).catch(() => {})`), so it dies if the
  user closes the tab.
- It is capped at 5 per invocation, so a backlog drains slowly.
- It fires up to five concurrent Gemini calls from a page load.

A user who walks away and never returns leaves a session open indefinitely:
invisible to T-2's memory, and a blank row in T-5's history. The sweep narrows
that window. It does not close it.

**What it replaces.** The sweep, the 12-hour `RESUME_WINDOW_HOURS` guess, and
the concurrent-summarise burst on chat open. This removes code rather than
adding it, which is the main argument for it.

**What it costs, honestly.** One summarisation call per turn instead of one per
session. That is a real token increase and it needs a guard — debounce, or only
re-summarise after N new turns. It also has to run after the reply is returned
to the user, so it needs `waitUntil` or a small queue rather than blocking the
response.

**The design consequence to think about first.** `summarise-session` is
currently idempotent because `ended_at` acts as the "already done" flag
(`app/api/summarise-session/route.ts:95`). If the summary is written repeatedly
*before* the session ends, that guard no longer means what it means today and
has to be reworked — probably a separate `summarised_through` marker, so an
in-progress summary and a final one stay distinguishable. Do not start this
without settling that, or the fix reintroduces the class of bug Demo 1 was
about.

**Origin.** The `sync_all(user_msg, assistant_response)` post-turn lifecycle in
`agent/memory_manager.py` of hermes-agent. Considered on 11 August 2026 and
deferred: correct idea, wrong week. The rest of that architecture — pluggable
memory providers, micro-compaction, self-authoring skills — was assessed and
rejected outright, not deferred. Notes in the 11 August discussion; the short
version is that provider-pluggable memory would move therapy content out of
Supabase and break the RLS guarantee every route currently relies on, and a
self-modifying prompt layer would make the T-8 test set meaningless.

---

### P2-2 — Durable facts about the person (semantic memory)

Larger than P2-1, and it is **gated on D-3**. Do not start it before the
privacy policy exists.

**What.** A record of what is true about a person, kept separately from what
happened in any one conversation. Their name, who is in their life, the
situation they are living through, and — the one nobody thinks of first —
anything they have asked the therapist not to raise.

**Why it is worth doing.** What ships on the 26th is *episodic* memory only:
five session summaries, which is a record of events. There is nowhere to store
a fact. The therapist can know that work came up three times and still not know
what the person does for a living.

This is also what the Demo 2 window decision is really about. Widening the
window from five sessions to ten is a blunt instrument for "remember more about
me" — it drags a two-month-old breakup into the prompt in order to retrieve one
durable fact that should never have been stored as an event in the first place.
A semantic layer would improve T-3 more than any window size, and it would make
five obviously correct rather than a compromise between shallow and intrusive.

And there is currently no way at all to honour *"please don't bring up my
father."* Nowhere to put it, so it survives exactly five sessions and then the
therapist raises it again. That is worse than never having been told.

**What it costs.** A table with RLS, an extraction step, a merge policy, a
user-facing view with edit and delete, and consent copy. This is not a week.

**Four things to settle before writing any of it.**

1. **Erasure has to propagate, and this is the one that can actually hurt you.**
   A fact derived from a session must not outlive deletion of that session. If
   someone deletes the conversation where they mentioned a diagnosis and the
   fact layer keeps it, N-2 is broken — and broken in the worst way, because
   the product told them it was gone. Either store provenance per fact and
   cascade, or derive the layer on read and never persist it. Decide before the
   schema, not after.

2. **Extraction writes inferred claims, not a summary.** A wrong session
   summary is a bad paragraph in a list. A wrong durable fact compounds: the
   therapist refers warmly to a partner who left months ago, in every
   conversation, forever. Needs a correction path the user can reach, and
   probably decay on facts nothing has reconfirmed.

3. **Consent and D-3.** The consent screen currently covers recordings and
   check-ins. A persistent profile of inferred psychological facts is a
   different processing purpose under both GDPR and the UAE PDPL, and has to be
   disclosed as one. Blocked on D-3 regardless of engineering readiness.

4. **It is a permanent prompt-injection target.** A session summary ages out
   after five conversations. Anything written here is in every system prompt
   from then on. The bar for what is allowed to be written has to be higher
   than it is for `summarise-session`.

**Sequencing.** If P2-1 lands first, extraction belongs in the same post-turn
pass rather than as its own job. Worth doing them in that order for that reason
alone.

**Origin.** `MEMORY.md` / `USER.md` as first-class nodes in hermes-agent's
`agent/learning_graph.py`, which keeps durable user facts separate from the
transcript. The separation is the idea worth taking. The graph, the skill
mutation, and the rest of it are not.

---

### P2-3 — Speech enhancement before diarization

**Status: tested 15 August 2026 and rejected for now.** Recorded here because
the headline numbers say ship it and they are wrong, so anyone who reads the
LavaSR paper and reaches for it again should see the measurements first.

The idea is sound on its face: run a speech-enhancement model over the audio
before transcription so the diarizer gets a clean signal. LavaSR is a good
candidate — 50MB, Vocos-based, Interspeech 2026, and genuinely fast, measured
here at 6.8s (denoise only) and 10.7s (with bandwidth extension) for six
minutes of audio on CPU, no GPU needed.

Measured on the 12 August recording, 180s chunks, everything else held fixed:

| | voices | stray | attributed to the user | I-4 mirror |
|---|---|---|---|---|
| baseline, no enhancement | 5 | 7% | **60%** | **91.7%** |
| denoiser only | 3 | 12% | 7% | — |
| full, recording enhanced only | 2 | **0%** | **0%** | — |
| full, recording and reference both enhanced | 2 | **0%** | 31% | could not run |

**Read the last two columns, not the first two.**

Enhancement makes separation look perfect. Five voices become two, stray goes
to zero. Every metric the pipeline had before today improves, and one of them
improves to a clean sweep.

Attribution gets worse at the same time. The true split on this recording is
about 58/42 by turn duration; baseline reports 60% and the enhanced version
reports 31%, so roughly a quarter of the conversation changes hands. The output
is cleaner and more wrong, which is the single most dangerous shape a change
can have here — it would have looked like a win on every number being watched.

Two further findings worth keeping:

**Enhancing one side breaks matching completely.** The stored enrolment clip is
raw and the recording was processed, so they no longer sounded like the same
person and the enrolled share fell to zero. Any preprocessing has to be applied
to the enrolment reference too, or I-7 rejects every session with "we could not
find your voice".

**On enhanced audio, a reference clip of pure silence matched a real speaker.**
That is why the I-4 mirror test could not run — `testAttribution.ts` needs two
non-enrolled voices in the first chunk and only found one. A silent reference
matching a person means voiceprint discrimination has collapsed, which is the
mechanism behind the attribution loss: generative restoration rebuilds fine
spectral detail from a prior trained on VCTK, a single-speaker corpus, so both
speakers come back partly wearing the same voice.

**When to revisit.** The noisy-recording case, which still has no measurements
against it. If a noisy two-person recording fails I-7 outright, trading
attribution accuracy for any result at all may be the right trade — but that is
a judgement to make against a measurement, and the measurement does not exist
yet. Test the denoiser alone before the full model; the bandwidth extension is
the half that does the damage, and the pipeline resamples to 16kHz immediately,
which discards most of what it produces anyway.

**One thing this did establish.** Baseline attribution on real product audio
measures **91.7% against I-4's 90% bar** — the first time that requirement has
been checked on a recording the product actually failed on, and it passes.
