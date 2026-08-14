# How Elena knows who she is talking to

Memory, identity, and continuity across sessions. What actually gets sent to
the model, where it comes from, and what the model still cannot know.

Written 6 August 2026, against the code as it stands on `main`.

---

## 1. The short version

**The model has no memory.** Gemini is stateless. Every call to
`generativelanguage.googleapis.com` is a fresh, anonymous request that knows
nothing about the previous one, about this user, or about this product.

Everything that feels like memory is us. On every single message we:

1. Read the user's own rows out of Postgres, scoped by their JWT.
2. Compress them into a block of English prose.
3. Paste that block into the system prompt.
4. Send the whole thing to a model that has never seen it before.

> Memory is not a model capability in this product. It is a database read plus
> string concatenation, performed from scratch on every turn.

That is the single most important thing to understand here. There is no
fine-tuning, no vector store, no persistent model-side session, no
"conversation ID" held by Google. If the block we assemble does not contain a
fact, Elena does not know it — no matter how many times the user has said it.

The whole mechanism is three files:

| File | Job |
| --- | --- |
| `migrations/0002_chat_sessions_and_messages.sql` | Where the facts live |
| `app/api/summarise-session/route.ts` | Turns a finished conversation into a rememberable fact |
| `lib/chatMemory.ts` | Turns those facts into the prose we paste into the prompt |

And one place they meet: `app/api/chat-therapy/route.ts`.

---

## 2. How the user is identified

Before memory there has to be a "who". There is exactly one source of truth for
that, and it is not the browser.

The client sends a Supabase JWT in the `Authorization` header. The route
verifies it server-side:

```ts
// app/api/chat-therapy/route.ts:63
const { data: { user }, error: authError } = await supabase.auth.getUser(token);
if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

`user.id` is the identity. Every memory read then runs through a second client
built with that same token:

```ts
// app/api/chat-therapy/route.ts:124
const supabaseAuth = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${token}` } },
});
```

This matters more than it looks. Because the reads go through the user's own
JWT, **Row Level Security does the scoping, not our WHERE clauses.** The
queries in the route never say `.eq('user_id', ...)` — they don't have to. The
policies in `0002_chat_sessions_and_messages.sql` say `auth.uid() = user_id`,
so a bug in our query code cannot leak another person's therapy history into
this person's prompt. The worst a mistake can do is return nothing.

The other deliberate choice: **the memory block is assembled on the server, not
sent up from the browser.** The client could have posted its own history along
with the message — it already has it on screen. It doesn't, because then the
contents of the prompt would be whatever the client claimed, and a modified
client could inject arbitrary text into Elena's system prompt.

### What identity does *not* include

The user's name is never sent to the model. `profiles.full_name` exists and the
UI uses it, but nothing in `BASE_SYSTEM_PROMPT`, the memory block, or the
context note contains it. Elena can say "you sounded flatter last time" and
cannot say "Sam". That is currently an accident of the implementation rather
than a decision, and it is the cheapest possible thing to change if we want it.

---

## 3. The three timescales of memory

They are separate mechanisms with separate failure modes, and it is worth not
confusing them.

```
┌─ Timescale 1: within one reply ──────────────────────────────┐
│  The message array. React state → request body.              │
│  Lives: milliseconds. Lost on reload if not persisted.       │
└──────────────────────────────────────────────────────────────┘
┌─ Timescale 2: within one conversation ───────────────────────┐
│  chat_messages rows + the 12-hour resume window.             │
│  Lives: 12 hours. Survives reload, tab close, device change. │
└──────────────────────────────────────────────────────────────┘
┌─ Timescale 3: across conversations ──────────────────────────┐
│  coach_sessions summaries + therapy_sessions mood points,    │
│  compressed by buildMemoryBlock().                           │
│  Lives: indefinitely. This is the one people mean by memory. │
└──────────────────────────────────────────────────────────────┘
```

### Timescale 1 — the current exchange

Gemini's `contents` array is the only "memory" native to the model call. The
route builds it like this:

```ts
// app/api/chat-therapy/route.ts:180
const contents = [
  { role: 'user',  parts: [{ text: `${fullSystemPrompt}\n\n---\nNow begin the conversation.` }] },
  { role: 'model', parts: [{ text: "I'm here and ready to help. What's on your mind?" }] },
  ...messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
];
```

Two things to notice.

First, the system prompt is smuggled in as a fake first user turn followed by a
fake model acknowledgement. Gemini's `v1beta` `generateContent` supports a real
`systemInstruction` field and we are not using it. The prompt-as-first-turn
trick works, but it means the instructions are theoretically forgettable
context rather than privileged framing, and it wastes two turns of the window.

Second, `messages` comes from the **client**, out of React state
(`app/chat/page.tsx:160`). The full transcript is also in Postgres, but the
route trusts the client's copy for the live conversation. So within a single
turn, the conversation is whatever the browser says it is.

### Timescale 2 — the same conversation, later

Every message is written to `chat_messages` as it happens, including the
opener:

```ts
// app/chat/page.tsx:115
const savedOpener = await saveChatMessage({ sessionId: session.id, role: 'assistant', content: opener });
```

When the page loads it does not start fresh. It calls
`startOrResumeCoachSession()`, which looks for an unfinished `chat` session
created within the last 12 hours:

```ts
// lib/ai.ts:377
const cutoff = new Date(Date.now() - RESUME_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
// … .eq('source','chat').is('ended_at', null).gte('created_at', cutoff)
```

Found one → replay its messages verbatim and continue. Found none → create a
new session, and fire-and-forget a sweep that closes up to five abandoned older
sessions so they get summarised instead of rotting open
(`sweepAbandonedSessions`, `lib/ai.ts:433`).

The 12-hour window is a real tradeoff. Too short and someone who steps away for
an afternoon loses their thread. Too long and someone gets trapped resuming a
conversation from a completely different mood three days ago. Twelve hours
roughly means "the same day."

One consequence worth stating plainly: **the opener is persisted, so it is
never regenerated.** Reload the page and you see the same first line. That is
deliberate — a therapist who greets you differently every time you refresh does
not feel like the same person.

### Timescale 3 — across conversations

This is the interesting one, and the rest of the document is about it.

---

## 4. Where the durable facts live

Four tables. Only three feed memory.

**`therapy_sessions`** — one row per *voice check-in*. Holds
`mood_score`, `energy`, `stress`, plus the transcript, insight, and detected
mode. This is the numeric spine of the user's history and predates the chat
feature. Memory reads **only** `created_at, mood_score, energy, stress` from
it — the transcript and insight of past check-ins are never shown to Elena.

**`coach_sessions`** — one row per *conversation*. Extended by migration 0002
with the fields that make a conversation rememberable:

```sql
ended_at       timestamptz   -- null means still open / never summarised
summary        text          -- 2-3 sentences, third person, written by Gemini
mood_score     integer       -- 0-100, same scale as therapy_sessions
topics         text[]         -- 2-5 lowercase tags
message_count  integer       -- denormalised, kept by trigger
crisis_flagged boolean
source         text          -- 'chat' | 'checkin'  (migration 0003)
```

**`chat_messages`** — one row per message. The verbatim transcript. Note the
schema has **no UPDATE policy at all**, by design: a therapy transcript is
appended to and deleted, never rewritten. (Which is why flagging a crisis marks
the *session* rather than editing the offending message —
`flagSessionCrisis`, `lib/ai.ts:493`.)

**`profiles`** — `full_name`, avatar, subscription state. Currently invisible
to Elena, as noted above.

### The `summary` column is the whole trick

`chat_messages` holds everything, and Elena is never shown any of it from a
past session. She is shown `coach_sessions.summary`.

This is a compression decision, and it is the right one. Five full transcripts
would be thousands of tokens of mostly filler, they would blow past any prompt
budget after a few weeks of use, and the model would have to do the work of
finding the point on every single turn. Five summaries are ~150 tokens total
and each one already *is* the point.

The cost is equally real: **detail is destroyed at write time and cannot be
recovered.** If the summary of a conversation about a specific coworker doesn't
name them, no later turn can ever recover that name. The compression is
one-way, and it happens once, at session end, based on a single model call.

---

## 5. How a conversation becomes a memory

`app/api/summarise-session/route.ts`. Fired by `endCoachSession()`, which the
user triggers with the **End session** button (`app/chat/page.tsx:61`) — and
which the check-in flow triggers automatically (`app/therapy/page.tsx:321`).

The flow:

1. Verify the JWT, build a caller-scoped client. RLS guarantees you can only
   summarise a session you own.
2. **If `ended_at` is already set, return immediately.** Idempotency is load-
   bearing: the abandoned-session sweep and an explicit end can both fire for
   the same row, and summarising twice would burn a model call and could
   overwrite a good summary with a worse one.
3. Read all messages in order, build a `User:` / `Elena:` transcript.
4. **If the user never spoke, close the session and stop.** No model call, no
   summary. Otherwise every abandoned tab becomes a blank row in history and a
   meaningless "memory".
5. Send the transcript with `SUMMARY_PROMPT` at `temperature: 0.2` and
   `responseMimeType: 'application/json'`.
6. Clamp and sanitise: `mood_score` to 0–100 integer, `topics` to at most five
   trimmed lowercase strings, `summary` trimmed or null.
7. Write `{summary, mood_score, topics, ended_at}` back to the row.

Step 7 is the one that is deliberately **not** error-swallowed:

```ts
// app/api/summarise-session/route.ts:176
if (updateErr) {
  console.error(`[summarise-session] write FAILED for session ${sessionId}: …`);
  return NextResponse.json({ error: … }, { status: 500 });
}
```

A silent failure here is the worst bug this system can have: the conversation
looks finished, nothing is recorded, and Elena has no memory of it next time
with no indication anything went wrong.

### The summary prompt is written for the user, not for the model

Worth reading `SUMMARY_PROMPT` (`route.ts:20`) in full, because it is doing
double duty. The summary is *also* what the user sees in Profile History, so it
is specified as third-person prose with "no advice, no diagnosis, no clinical
language, no numbers", and explicitly "never a sentence that could describe any
session."

That last constraint is the important one. A summary like "the user discussed
their feelings and explored some difficult emotions" is technically accurate,
survives every validation we do, and is completely worthless as memory — it
gives the next conversation nothing to connect to.

### Both surfaces feed memory

The memory query in `chat-therapy` does **not** filter on `source`:

```ts
// app/api/chat-therapy/route.ts:133
supabaseAuth.from('coach_sessions')
  .select('created_at, summary, mood_score, topics')
  .not('ended_at', 'is', null)
  .order('created_at', { ascending: false })
  .limit(5)
```

So the short conversations that happen *inside* the voice check-in flow
(`source = 'checkin'`) are remembered by the standalone chat too. Profile
History filters them out to avoid showing one check-in as two rows; memory
keeps them, because for continuity they are real things the person said.

This is correct behaviour but it is an *asymmetry between two queries*, held in
place by nothing but the absence of a filter. If someone later adds
`.eq('source','chat')` here to "match history", cross-surface memory silently
disappears with no test failing.

---

## 6. What actually gets pasted into the prompt

`lib/chatMemory.ts`. The final prompt is a four-part concatenation:

```ts
// app/api/chat-therapy/route.ts:170
const fullSystemPrompt = `${BASE_SYSTEM_PROMPT}${memoryBlock}${contextNote}${finalTurnInstruction}`;
```

- `BASE_SYSTEM_PROMPT` — who Elena is, how she writes. Constant.
- `memoryBlock` — the long-term memory. Built by `buildMemoryBlock()`.
- `contextNote` — the *current* check-in's scores, `JSON.stringify`'d raw from
  the client's `context` field.
- `finalTurnInstruction` — set on the third user turn, tells Elena to close out
  the session without asking another question.

A real assembled block looks like this:

```
━━ WHAT YOU ALREADY KNOW ABOUT THIS PERSON ━━
Their recent check-ins:
- Mood, oldest to newest: 62, 58, 60, 55, 49, 47, 44
- Averages this week: mood 52, energy 41, stress 68
- Their mood is declining.

What you have talked about before:
- yesterday, mood 45: Came in flattened after another week of unpaid overtime…  [work, sleep]
- 4 days ago, mood 51: Talked about avoiding a friend's calls…  [friendship, guilt]
━━ END ━━
```

Three design decisions inside that.

**It is prose, not JSON.** The file says why: the model uses "mood has fallen
from 62 to 44 across five check-ins" far more reliably than it uses a nested
object. We hand the model a sentence, not a structure to interpret.

**Dates are relative.** `relativeDay()` (`chatMemory.ts:42`) turns timestamps
into "today" / "yesterday" / "3 days ago" / "about a week ago". Models reason
about elapsed time badly and about ISO timestamps worse. "Yesterday" is
directly usable in a reply; `2026-08-05T18:22:07Z` requires arithmetic the
model will sometimes get wrong.

**An empty history produces an empty string, not a block of "unknown".**

```ts
// lib/chatMemory.ts:145
if (lines.length === 0) return '';
```

The comment is the explanation: a block full of "unknown" reads to the model as
*something worth remarking on*, and you get a first-time user greeted with
observations about the absence of their data.

### The trend calculation

`moodTrendDirection()` (`chatMemory.ts:75`) compares the average of the older
half of the window against the newer half:

```ts
if (scores.length < 3) return 'unknown';
if (newer <= older - 8) return 'declining';
if (newer >= older + 8) return 'improving';
return 'steady';
```

The 8-point threshold is deliberately the same threshold the burnout rules in
`lib/ai.ts` use, so the chat and the early-warning system never disagree about
whether someone is declining. Two systems with two thresholds would eventually
produce a session where Elena reassures someone the same day the app warns
them.

Note that `'steady'` and `'unknown'` are both omitted from the block entirely
(`chatMemory.ts:127`) — only a direction worth mentioning gets mentioned.

### Half the file is telling the model how *not* to use it

Everything after `HOW TO USE THIS` is prompt engineering, and it is three
negative examples before one positive. This is the part that determines whether
memory feels like memory:

- ❌ `"I see your mood scores were 62, 58, 55, 49 and 44…"` — reading a file
  back at someone.
- ❌ `"Your mood is showing a steady decline. I remember you mentioned…"` — the
  same mistake without numbers. Narrating their data to them.
- ❌ `"That sounds really hard. Tell me more."` — generic *when context was
  available*, which is worse than having no context.
- ✅ `"This is the third time work has come up, and each time you sound a
  little flatter than the last. What has been shifting there?"`

The instruction "do not say 'your mood', do not announce what you remember, do
not describe trends as trends" exists because the untuned default behaviour is
for the model to recite the block. It has the data, the data is clearly about
the user, so it reports it. Suppressing that is most of the work.

There is also an explicit escape hatch: *"If nothing above is relevant to what
they just said, ignore it entirely."* Without it, a model given memory will
force a callback into every reply.

---

## 7. Memory is an enhancement, never a precondition

Both history reads are allowed to fail:

```ts
// app/api/chat-therapy/route.ts:149
if (sessionsRes.error) console.error('[chat-therapy] session history unavailable:', …);
if (moodRes.error)     console.error('[chat-therapy] mood history unavailable:', …);
```

Logged loudly, then execution continues with `?? []`. The user gets a
therapist without history rather than an error screen. Amnesia degrades the
experience; a 500 ends it.

Note that memory loading happens **after** crisis screening, and that ordering
is not incidental. `screenMessage()` runs before the history reads and before
the therapist call (`route.ts:82`), so a person at risk cannot receive a
conversational reply even if the memory layer is throwing. If it escalates, the
route returns `CRISIS_MESSAGE` and **no model call is made at all**.

---

## 8. What Elena cannot know

This is the honest list. Everything here is a current limitation, not a bug.

**Her name for you.** No name, no pronouns, no age, no location, nothing from
`profiles`. Elena has never been told who she is speaking to, only how they
have been feeling.

**Anything not in a summary.** No facts are extracted and stored across
sessions. There is no table of "things we know about this person" — no
partner's name, no job title, no diagnosis, no stated goal. If someone
introduces their brother by name in five separate conversations, Elena still
cannot use it, because names never survive the summarisation step.

**Anything past the fifth session.** Hard `limit(5)` on summaries, `limit(14)`
on mood points. Session six is gone forever. There is no consolidation step
that rolls older sessions into a longer-lived profile before they fall off — the
window simply slides and the past drops off the end.

**Any conversation that was never ended.** Memory reads
`.not('ended_at','is',null)`. An open session contributes nothing, no matter
how much was said in it. Abandoned sessions are only swept when the user next
opens a *new* chat, so a user who never returns has a permanent gap.

**Anything from the voice check-ins beyond three numbers.** The `transcript`,
`insight`, and `emotional_mirror` on `therapy_sessions` are never read into
memory. Elena knows a user's mood was 44 last Tuesday and has no idea what they
said about it. Only the *current* check-in's scores reach her, via
`contextNote`.

**Anything from the other features.** Intent processing, voice enrollment,
conversation uploads, streaks — none of it is wired into the memory block.

**That the user was ever in crisis.** `crisis_flagged` is written on both the
message and the session, has its own partial index, and renders as a badge in
Profile History (`app/history/page.tsx:291`) — and the memory query does not
select it. Someone escalated to a hotline on Tuesday is greeted on Wednesday by
a therapist who has no idea it happened. Of every durable fact in this schema
this is the only one with a safety argument behind it, and it is the only one
that is stored, indexed, displayed, and never read back into the conversation.

**And on the check-in surface, nothing at all.** `/api/deep-question` generates
the follow-up question after a voice memo — the most emotionally targeted prompt
in the product. It verifies the user's JWT, holds a Supabase client, and never
calls `buildMemoryBlock`. It sees the audio and whatever `user_context` the
client chose to hand it (`lib/ai.ts:238`). Memory was built into `/chat` and not
into the surface people actually open every day.

**Which specific past conversation is relevant right now.** There is no
retrieval step. It's always the most recent five, whether or not any of them
relate to what the user just typed. A conversation from three months ago about
exactly this problem is invisible; a chat from yesterday about something
unrelated is front and centre.

**Corrections.** There is no way for the user to say "that's wrong, that isn't
what happened" and have it stick. Summaries are model output written once and
never revised, and the user cannot see or edit them beyond deleting the whole
session (`deleteHistoryItem`, `lib/ai.ts:615`). A bad summary poisons up to
five subsequent conversations and then ages out on its own.

And the flip side, which is a feature: **deleting a session deletes the
memory.** `chat_messages` cascades on session delete, and a deleted
`coach_sessions` row stops appearing in the memory query on the very next turn.
There is no copy of it in a model, an embedding index, or a cache. The user's
delete button is real.

---

## 9. Is this the right architecture?

An earlier draft of this document answered that with a ranked list: send the
name, roll up a profile, add a facts table, add `pgvector`. That list was a
generic LLM-memory checklist scoped like an open-ended product roadmap. This is
fixed-scope client work with a delivery date of 26 August 2026, against a PRD
the client has stated is the build specification. Two of those five items cannot
be built, tuned and defended in the time available, and neither is in the PRD.

So: rescoped, and re-argued from what this product is rather than from what
memory systems usually look like.

### The mechanism is right. Don't rearchitect it.

Worth saying clearly before criticising anything, because the temptation with a
memory layer is always to replace it with a fashionable one. The existing design
gets an unusual number of things right:

- **Server-side assembly.** The prompt cannot be forged by a modified client
  (ADR-004). Most implementations of this feature get it wrong.
- **Prose, not JSON.** Correct, for the reason ADR-004 gives.
- **Empty for new users, not `null`-filled.** Subtle, and almost always got
  wrong on the first attempt.
- **Summaries, not transcripts.** The right compression, at the right boundary.
- **Degrade, don't break** (ADR-005). Amnesia beats an error screen.
- **Deletion is real.** No embedding index, no vendor cache, no fine-tune to
  invalidate. Delete the row and the memory is gone on the next turn. For a
  mental-health product this is worth more than any retrieval feature, and it is
  a property that most of the "better" architectures below would destroy.

Read → compress → paste is the correct shape and should survive. **What's wrong
is not how memory is assembled. It's what we chose to remember.**

### Elena has exactly one memory move

Look at what the block can actually support. Mood numbers, topic tags, and a
third-person recap of the last five sessions. Every reply that uses memory is
therefore some variation of the same sentence:

> "This is the third time work has come up, and each time you sound a little
> flatter than the last."

That is a good move. It is also the *only* move, and a user meets it for the
third time in week two. The trend callback is the entire repertoire, which is
why memory here can feel impressive on day 3 and thin by day 30. The customer
experience the client is selling — *"talks to you as per your past mood and
talking"* — needs more than one gesture.

### What a companion is actually asked to remember

Set aside the technology and ask what makes anyone feel known. The useful
answer, roughly in order of emotional impact per unit of work:

| | What it is | Status |
|---|---|---|
| **Commitments** | "You were going to ask about the Friday deadline. Did you?" | Missing. Cheapest thing on this list. |
| **Crisis history** | "Last week was frightening. Where are you today?" | Stored, indexed, never read. |
| **Their own words** | "You said you felt like a machine that has to be told it's working." | Destroyed at write time. |
| **Disposition** | How this person works — withdraws rather than reaches out, deflects with humour, Sunday nights are worst. | Missing entirely. |
| **Episodes** | What happened last session. | The only thing we have. |

The ranking is the argument. **Episodic memory — the thing we built — is the
least valuable kind here**, and the two most valuable are nearly free.

A useful frame from the analogy this product invites: a therapist's continuity
comes from a *working understanding* of you, revised session over session, not
from a stack of session notes. The notes are the raw material; the understanding
is the thing that makes the fourth session different from the first. We shipped
the notes.

To be careful about the analogy: this is a design frame for what makes
continuity feel real, not a claim that the product performs clinical work. The
existing bans on diagnosis and clinical language (in `BASE_SYSTEM_PROMPT` and
`SUMMARY_PROMPT`, and the `MedicalDisclaimer` on every surface) apply to
everything proposed below, and the hazards section says where that gets sharp.

### The largest single gap is a surface, not a feature

`/api/deep-question` has no memory. The follow-up question after a voice memo —
the most emotionally loaded output this product generates, on the surface people
open daily — is written by a model that knows nothing about the person.

`buildMemoryBlock()` is a pure function of `{recentSessions, moodPoints}`.
Nothing needs designing; it needs importing. This is the best value-to-effort
ratio anywhere in the codebase, and it is arguably not new scope at all: the
client asked for a therapist that talks to you as per your past mood and
talking, and did not say "only in the chat tab."

---

## 10. The recommendation

Split by whether it needs the client's signature, because the PRD is the build
spec and the delivery date is three weeks out.

### Inside existing scope — these make T-2/T-3 true

**1. Wire memory into the check-in.** Import `buildMemoryBlock` into
`/api/deep-question`; move the history read into a shared helper so both routes
use one code path and cannot drift. Highest impact of anything here. *Half a
day.*

**2. Make memory crisis-aware.** Add `crisis_flagged` to the memory select;
render one line in the block when a recent session carries it, with explicit
instruction on how to hold it — *acknowledge, do not interrogate, do not
re-open it unprompted*. This completes a decision the team already made and
defended (ADR-006 through ADR-008, which the PRD says may only be removed in
writing); it is inconsistent to screen every message for crisis and then forget
that it happened. Consider also whether a flagged history should lower the
escalation threshold — that is a judgement call to put in front of the client
rather than one to make quietly. *Half a day, plus wording care.*

**3. Two columns on the summariser.** Extend `SUMMARY_PROMPT`'s JSON with:

```
"open_threads": ["<0-3 things left unresolved or that they said they would do>"],
"quote":        "<one short line in their own words, verbatim, or null>"
```

Then two lines in the memory block. This is the commitments and own-words rows
of the table above, and it is a prompt edit plus a migration. It also directly
strengthens T-3, whose acceptance is about referencing the past *naturally* —
a quote does that in a way a third-person recap structurally cannot. *One day.*

**4. Correctness cleanups.** Move the prompt into Gemini's real
`systemInstruction` field instead of the fake-first-turn; send
`profiles.full_name`; add prompt caching on the constant prefix. *Half a day,
no behaviour risk.*

Everything above fits in a week, needs no new architecture, and is defensible as
delivering what was already specified rather than as scope growth.

### Change requests worth putting to the client

The client explicitly asked *"can you tell if something is not mentioned in the
document"* — so these belong in front of them, priced, not built silently.

**5. A maintained understanding, not an accumulating log.** One `text` column on
`profiles`, rewritten at each session end from *(current understanding + the
session that just closed)*. One extra model call at a boundary where nobody is
waiting.

The word **rewritten** carries the whole design. An append-only facts table
accumulates and therefore cannot correct itself; a rewritten field is a revision
by construction, which is what you need in a domain where session twelve
reinterprets session three and where someone's job, relationship and living
situation all change under you. It also retires the "session six is gone
forever" limit without touching a single query limit.

This is the item that decides whether month six feels better than month one.

**6. Show it to the user, and let them edit it.** The differentiator, and the
one I would market.

In a category where trust *is* the purchase decision, a model-written
psychological profile the user cannot see is a file on them; the same text,
readable and editable, is notes they share. It is also the only ground-truth
correction mechanism that exists — the user is the sole oracle for whether a
summary is right — and it is the only implementation of a rectification right
(GDPR Art. 16, and PDPL equivalently) in a product where D-3 has not yet
established who even writes the privacy policy. Today the sole remedy for a
wrong summary is deleting the whole session.

The data already sits in one row per session plus one field on the profile. This
is a screen, not an architecture.

**7. A retention period for transcripts.** See §12 — it folds into D-4, which is
already open.

### Order I would ship it

```
Week 1   1 → 2 → 4 → 3        in-scope, no client sign-off needed
Week 2   5, then 6            only if the change request lands
Later    revisit §11          only against evidence from real usage
```

One caveat that outranks the whole plan: **none of the migrations are applied
and `GEMINI_API_KEY` is missing** (DECISIONS.md §Environment — which still says
`0001`–`0006`, while `migrations/` now holds nine). Every item above is small,
and not one of them is testable until the client meets the two obligations in
CLIENT-REQUIREMENTS.md §7. The schedule risk here is access, not design.

Items 3, 5 and 6 each need a migration, so they queue behind that same blocker.
Items 1, 2 and 4 do not — they are code and prompt changes against columns that
already exist in `0002`, which is the other reason to run them first.

---

## 11. What I would deliberately not build

Recorded with reasons, so it doesn't get re-proposed every quarter.

**Semantic retrieval over past sessions (`pgvector`, top-k by similarity).**
Four reasons, and the third is the one that decides it.

1. *The corpus is tiny.* A heavy user at five sessions a week reaches ~250 rows
   in a year. That is not a retrieval problem, it is a `WHERE` clause.
2. *Recency is usually correct here.* Emotional state is autocorrelated —
   yesterday genuinely does matter more than a similar Tuesday in March. The
   naive ordering is a strong baseline in this domain in a way it isn't in
   document search.
3. *Similarity retrieval reliably surfaces the wrong memory.* Ask for the
   session most similar to "I've been thinking about my mother" and you get the
   most emotionally loaded mother session on record. A companion that dependably
   drags up your darkest matching moment is not empathetic; it is an unwelcome
   search engine with a warm voice. That is a harm argument, not a cost one.
4. *Retrieval quality is bounded by write quality.* Better search over summaries
   that already discarded the specifics still returns nothing specific.

Fix the write path (items 3 and 5) first. It is entirely possible retrieval is
never needed. Revisit only with evidence: users past ~150 sessions, plus real
transcripts showing Elena missing a callback that recency ordering hid.

**An append-only facts table with confidence scores.** Staleness and
contradiction are not edge cases in this domain, they are the normal case.
`{fact: "works at Acme", confidence: 0.9}` will confidently brief Elena on a job
the user left in March. Item 5 subsumes this and gets revision for free.

**Any hosted memory service** (Mem0, Zep, and the rest). This is
mental-health data under UAE PDPL and GDPR, with voice recordings already
identified as biometric data and D-2/D-3 unresolved with a lawyer. Adding a
third-party processor to the data map needs its own DPA, and it destroys the
"delete is real" property from §8 — the strongest privacy claim the product
currently has. The memory layer being ~200 lines of our own code in our own
Postgres is an asset here, not a shortcoming.

**Per-message memory model calls, or a memory "agent" with tools.** Every turn
already costs a crisis screen plus a therapist call. Adding a retrieval-decision
call per turn doubles latency at precisely the worst moment — someone waiting
for a reply after saying something hard. Memory work belongs at session
boundaries, where nobody is watching a spinner.

### Hazards of what I *am* recommending

Item 5 is the one that can go wrong. A maintained understanding of a person,
written by a model, drifts toward the clinical: "avoids conflict, withdraws when
overwhelmed, low self-worth contingent on productivity" is exactly what an
unconstrained summariser produces, and it reads as a diagnosis whether or not it
is one. Two mitigations, and both are required rather than optional:

- Specify it in the same register as `SUMMARY_PROMPT` — plain language, no
  clinical terms, no diagnosis, no trait labels. It should read like notes a
  perceptive friend keeps, and it must survive being read by the person it's
  about.
- Ship it *with* item 6, not before it. The visible-and-editable screen is the
  safety valve for the field's contents, which is why these two are one change
  request and not two.

The second-order risk is over-anchoring: a model handed a confident description
of someone will interpret everything they say through it, including the day they
have genuinely changed. The prompt's existing escape hatch — *"if nothing above
is relevant, ignore it entirely"* — needs to extend explicitly to the
understanding field.

---

## 12. Retention is part of the memory architecture

Currently: `RETENTION_DAYS` is 30 and applies to **audio recordings only**
(`app/api/cron/purge-recordings/route.ts`, N-5). `chat_messages` has no
retention at all. Full verbatim therapy transcripts persist indefinitely.

That is an unbounded liability in a jurisdiction the requirements doc already
flags, on a product whose privacy policy has no author yet (D-3).

It is also a memory-architecture decision, not just a policy one. The design
I would propose:

- **Transcripts expire** on the D-4 period. They exist to be summarised, to let
  a user re-read a recent session, and for crisis auditing — all short-horizon
  uses.
- **Summaries, quotes, open threads and the understanding persist.** They are
  small, they are what continuity actually runs on, and they are the things the
  user can see and correct under item 6.

The consequence is worth stating plainly, because it cuts against §11's
sequencing advice being merely a preference: **once transcripts expire, the
write path is the only path.** There is no re-summarising an old session with a
better prompt later. That makes the summariser load-bearing, and it is a third
independent argument for spending the effort there rather than on retrieval.

The upside is a sentence the client can put on a landing page and mean: *Elena
keeps a page of notes about you, not a recording of everything you have ever
said.* That is both more defensible and more comfortable than the truth today.

Folds into D-4, which is already open and already blocking the retention job.

---

## 13. Inspecting and testing it

### See the exact prompt

The route has a purpose-built switch. In `.env.local`:

```
CHAT_DEBUG_PROMPT=1
```

Every chat request then prints the fully assembled system prompt to the server
console — memory block, context note and all. This is the only reliable way to
answer "does Elena actually know X", and it beats reconstructing the string by
reading the code.

### Read the memory back out of the database

```sql
-- what Elena will be told about this user, in the order she'll see it
select created_at, mood_score, topics, summary
  from coach_sessions
 where user_id = '<uuid>'
   and ended_at is not null
 order by created_at desc
 limit 5;

-- the mood spine
select created_at, mood_score, energy, stress
  from therapy_sessions
 where user_id = '<uuid>'
 order by created_at desc
 limit 14;

-- sessions that will never be remembered because they were never closed
select id, created_at, message_count
  from coach_sessions
 where user_id = '<uuid>' and ended_at is null;
```

### Manual test: does memory actually work end to end

1. Set `CHAT_DEBUG_PROMPT=1`, restart the dev server, watch the server console
   for the rest of this.
2. Log in as a user with **no** history. Open `/chat`. Confirm the printed
   prompt contains **no** `WHAT YOU ALREADY KNOW` block at all — not an empty
   one.
3. Send two or three messages about something specific and recognisable ("my
   manager keeps adding work on Fridays"). Click **End session**.
4. Check `coach_sessions` for that row: `ended_at` set, `summary` non-null and
   specifically about Friday overtime rather than generic, `topics` populated.
5. Open `/chat` again. The printed prompt should now contain the block, with
   your summary under `What you have talked about before` and the relative day
   reading `today`.
6. Send a message that connects to it. Elena's reply should reference the
   earlier conversation *without* quoting numbers or saying "your mood" — that
   is what the negative examples in `chatMemory.ts` are enforcing.
7. Reload mid-conversation. The same opener and the same transcript should come
   back, not a fresh greeting — that is Timescale 2 working.

### Testing the trend line

The trend needs at least three `therapy_sessions` mood points to say anything,
and a difference of 8+ between the older and newer halves to say anything other
than "steady". To see `Their mood is declining.` appear, you need three or more
check-ins trending down by more than 8 points across the window — which is
faster to arrange with direct inserts than with real recordings.
