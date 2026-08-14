# Demo 1 — The data actually saves

**Date:** Thursday 6 August 2026 · **Covers:** T-1, T-4
**Promise from the demo plan:** *"I type a message in the chat, close the
browser completely, reopen it, and the message is still there."*

Also promised: *"whether the bug was a simple fix or a structural problem."*
The answer is neither, and that is the most interesting thing to say on this
call. See §4.

---

## 1. The five minutes on the call

Do it in this order. It builds.

**a. Show the hole first.**

Open Profile History on the QA account before doing anything. Empty.

> "This account signed up yesterday. It has no history, because nothing has
> been saving. Let me show you what was happening."

**b. Show the date the data stopped.**

```
2026-06-17 20:42   mood 40   sad
2026-06-16 05:53   mood 30   sad
2026-06-08 10:30   mood 60   anxious
```

> "The last check-in that reached the database was the 17th of June. Nothing
> for seven weeks. Three people signed up in that window — one of them
> yesterday — and none of them have a single saved session."

**c. Record a check-in, live.**

Let it finish. Then refresh Profile History. It appears.

> "That is the first check-in to save since June."

**d. The chat, and the browser close.**

Send two messages. Wait for replies. **Close the entire browser**, not the
tab. Reopen. The conversation is intact.

**e. End the session and show the record.**

Click *End session*. Profile History now shows the conversation with a
written summary, a mood value and topics — generated automatically.

> "That summary is what the therapist reads next time. That is how it starts
> remembering you, which is the whole of Feature 1."

**f. The one thing that does not work yet.**

The demo plan commits to showing a limitation every time. Use this one:

> "Crisis handling is built and working, but the support screen has no phone
> numbers in it. I would not put a guessed helpline number in front of someone
> in crisis. I need verified numbers for the UAE from you — that is question
> D-7."

---

## 2. Explaining it to the client, without jargon

### What was wrong

Think of the app as filling in a form and posting it.

The form had a field the office had never heard of. Rather than filing the
rest and ignoring that line, the office **rejected the whole form** and sent
back a rejection notice.

The app threw the rejection notice in the bin without reading it, and showed
the user a "thank you, submitted" page.

So the user saw their results, felt fine, and closed the app. Nothing had been
filed. Nothing anywhere said so.

### Why it went unnoticed for seven weeks

Three things had to line up, and they did:

1. The results screen is generated from the AI's response, **not** from what
   was saved. So it looked perfect whether or not the save worked.
2. The rejection was written to a server log nobody reads.
3. The people affected were mostly new users, who had no history to notice
   was missing. Someone who had been using it since April would have spotted
   it in a day.

### What changed

Two kinds of fix.

**The immediate one:** the mismatches between what the app sends and what the
database accepts are gone. Four separate ones, described below.

**The one that matters more:** the app no longer silently swallows a failure.
If a save fails now, it says so on screen and records the exact reason. The
original bug is fixed; the *class* of bug — failing quietly — is what has
actually been closed.

### The honest headline

> "It was not one bug. It was four, stacked on top of each other, each one
> individually enough to lose every check-in. I found the first, fixed it,
> and it still did not save — which is how the other three surfaced."

That is a better thing to say than "fixed it", and it is true.

---

## 3. The architecture

### 3.1 The write path — a voice check-in

```
Browser                          Server                        Supabase
───────                          ──────                        ────────
MediaRecorder
  captures ~60s
      │
      ▼
lib/audioFeatures.ts
  real signal processing:
  pitch, pitch variability,
  jitter/shimmer, speech rate,
  pause count, volume steadiness
      │
      │  POST /api/analyze-mood
      │  { audio_base64, mime_type,
      │    duration, acoustic_features,
      │    user_context }
      │  Authorization: Bearer <user JWT>
      ▼
                        route.ts
                          1. verify JWT ─────────────► auth.getUser()
                          2. build prompt =
                             SYSTEM_PROMPT
                             + SCHEMA_BLOCK
                             + SCORING_RUBRIC
                             + measured acoustics
                          3. call Gemini ──────────► gemini-2.5-flash
                          4. normalise the response
                             (normalisePace,
                              normaliseMode)
                          5. INSERT ────────────────► therapy_sessions
                             using the USER's JWT,
                             so RLS applies
                          6. return analysis
                             + saved: true|false
      │
      ▼
Results screen
  (+ console error if saved === false)
```

**Two design points worth knowing.**

The acoustic measurements are computed **in the browser, before** the AI is
called, and passed in alongside the audio. The model is not asked to guess how
fast someone spoke — it is told, and asked to interpret it. That is why the
insights reference specific vocal detail instead of generic sentiment.

The insert runs under **the user's own JWT**, not an admin key. Row Level
Security therefore applies to the app exactly as it applies to everyone else.
A bug in the API cannot write to another user's history, because the database
refuses it rather than trusting the code.

### 3.2 The write path — a chat conversation (T-1)

```
open /chat
  └─► startOrResumeCoachSession()
        resumes an unfinished session from the last 12 hours,
        otherwise creates one
        └─► coach_sessions row

user sends a message
  └─► saveChatMessage()  ─── written BEFORE the AI is called
        └─► chat_messages row
              └─ trigger ─► coach_sessions.message_count += 1

  └─► crisis screening  ─── runs BEFORE any reply is generated
        │
        ├─ flagged  ─► escalation text, no therapist call at all
        └─ clear    ─► Gemini reply
                        └─► saveChatMessage()

click "End session"
  └─► POST /api/summarise-session
        └─► Gemini, structured output
              { summary, mood_score, topics[] }
                └─► written to coach_sessions + ended_at   ← T-4
```

**The user's message is written before the AI is called.** If the model times
out, the network drops, or the process dies, what the person actually said is
already stored. Losing someone's own words to an infrastructure failure is
worse than failing to reply to them.

**Sessions abandoned without ending get swept.** Opening a new chat closes any
conversation left open beyond the 12-hour window and summarises it. Without
that, walking away would leave a session permanently unsummarised — invisible
to memory, and a blank row in history forever.

### 3.3 The read path

```
Profile History  ─► getHistoryFeed()
                      ├─ therapy_sessions  (voice check-ins)
                      └─ coach_sessions    (conversations, source='chat')
                     merged, sorted, paged 30 at a time

Chat memory      ─► /api/chat-therapy reads server-side, under the user's JWT
                      ├─ last 5 finished coach_sessions summaries
                      └─ last 14 therapy_sessions for the mood trend
                     rendered as prose, injected into the system prompt
```

Both feeds select **named columns only**. The previous history query pulled
every full transcript into the browser to render a two-line preview, which is
what T-5's two-second target would have died on.

### 3.4 Security model

| Concern | How it is handled |
|---|---|
| Cross-user reads | RLS on every table: `auth.uid() = user_id` |
| API writing to the wrong user | Writes use the caller's JWT, never a service key |
| Transcript tampering | `chat_messages` has **no UPDATE policy** — append and delete only |
| Anonymous access | Verified: an unauthenticated key sees 0 rows and cannot insert |

---

## 4. What was actually broken

Four independent causes. **Each one alone lost every check-in.**

### Cause 1 — `pace` written in the wrong case

The database accepts `'Slow' | 'Normal' | 'Fast'`. The code wrote `'normal'`.

Worse: `pace` is not in the schema the AI is given, so the model never returns
it and the value was **always** the lowercase fallback. This failed on 100% of
check-ins, on its own, regardless of everything else.

*Client version:* "The app was writing the word in lower case where the
database expected a capital letter. Every single time."

### Cause 2 — `ai_provider` never written

The column is `NOT NULL`. The current code has **never** written it — a search
of the entire repository history finds no reference. The nine surviving rows
were written by a version of the app that predates this codebase.

*Client version:* "There is a required field the current app stopped filling
in. The database will not accept a record without it."

### Cause 3 — the AI told to return values the database rejects

The prompt instructed the model to return one of nine moods, including
`happy`, `reflective` and `motivated`. The database accepted seven, and
rejected exactly those three. It also accepted `hopeful`, which the model was
never told about.

*Client version:* "The AI was allowed to describe someone as 'happy', but the
database had never been told 'happy' was a valid mood, so it threw the record
away. **Whether a check-in saved depended on the user's mood.** Someone having
a good day was more likely to lose their session than someone anxious."

That last line is worth saying slowly. For a wellbeing product it is close to
the worst possible failure distribution.

### Cause 4 — three columns that did not exist

A feature added on 21 July started writing `narrative_type`,
`readiness_score` and `readiness_note`. Nobody added them to the database.
PostgreSQL rejects the entire row when a single column is unknown.

*Client version:* "A newer feature started sending three extra pieces of
information that the database had no place to put."

### The compounding failure

A comment in the code claimed unknown columns were "ignored by the DB". They
are not — the whole row is rejected. That belief is probably why nobody looked
further.

And the error handler:

```ts
if (dbError) {
  console.error('[analyze-mood] DB save error:', dbError.message);
  // Don't fail the request — return analysis even if DB save fails
}
```

Logged, discarded, HTTP 200. **That comment is the actual bug.** The four
schema mismatches were ordinary mistakes; the decision to hide them is what
turned a visible error into seven weeks of silent data loss.

---

## 5. Evidence to have open

**The gap, and the fix, in one query result:**

```
2026-08-06 14:16   mood 45   anxious   pace Normal   ai_provider gemini   ← first save since June
2026-06-17 20:42   mood 40   sad       pace Slow     ai_provider gemini
2026-06-16 05:53   mood 30   sad       pace Slow     ai_provider gemini
```

**T-4 producing a real summary, unedited:**

> "The user began by reporting feeling tired, and initially seemed to deflect
> by asking about previous conversations. As the discussion continued, a
> deeper underlying distress surfaced, culminating in the user expressing a
> desire not to be here anymore."

Scored mood 5, `crisis_flagged: true`. Useful for showing that T-4 is not
producing filler.

**Verified counts after testing:** 22 chat messages stored, exactly 1 message
carrying the crisis flag — and it is the escalation text, not a therapist
reply. The model was never called for that message.

---

## 6. Questions the client will ask

**"How do we know it will not happen again?"**

Three changes, and it is worth naming all three:

1. A failed save now returns `saved: false` with the reason, and surfaces in
   the console. It cannot be silent.
2. `migrations/` now exists and is version-controlled with the code. The root
   cause was code and database drifting apart with nothing tracking it.
3. Values from the AI are normalised before insert. An unexpected mood now
   costs a slightly less precise label rather than the user's entire check-in.

**"Can the lost data be recovered?"**

No. It was never written anywhere. The audio is discarded after analysis by
design, so there is nothing to reprocess. Seven weeks is gone and should be
stated plainly rather than softened.

**"Was this a simple fix or structural?"**

Neither, and that is the accurate answer. Structurally the design is sound —
the tables, RLS and API shape are all fine. The failures were four small
mismatches plus one bad decision about error handling. The fix took hours, not
weeks. But calling it "simple" would imply one thing was wrong, and four
things were.

---

## 7. Still open after this demo

| | |
|---|---|
| **D-7** crisis helpline numbers | Escalation screen is built and empty |
| **T-5** 2-second load at 100 sessions | Not yet measured with real volume |
| `/api/subscription/status` | Fires 4× per page load, ~2s wasted latency |

The first is a blocker for Demo 3 on 13 August.
