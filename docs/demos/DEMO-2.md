# Demo 2 — Chat that remembers you

**Date:** Tuesday 11 August 2026 · **Covers:** T-2, T-3
**Promise from the demo plan:** *"two chats side by side, same user message. One
is the current behaviour, generic and cold. The other has the user's last five
check-ins loaded… the difference is obvious in about four seconds."*

Also promised: *"Decision I need at this demo: how much history is the right
amount."* That is §4, and it is the part of the call that actually matters.

---

## 1. The ten minutes on the call

### a. Show what goes into the prompt, before showing any reply

```
npm run demo:prompt
```

No API calls, so it cannot fail live and costs nothing. It prints the exact
block that gets appended to the system prompt.

> "T-2 in the PRD says this is confirmed by inspecting the payload sent to the
> model. So here is the payload. This is not a description of it — it is the
> same function the running app calls, printing the same string."

Point at three lines in the output and move on:

- `Mood, oldest to newest: 66, 60, 54, 47, 41`
- `Their mood is declining.`
- `2 days ago, mood 47: Talked about pressure at work and struggling to sleep.`

Then the part worth dwelling on for ten seconds — the block is **prose, not
data**. Every instinct says to send the model a JSON object. It uses a sentence
far more reliably than a nested structure, and T-3 asks for replies that
reference history naturally rather than accurately.

### b. The side by side

```
npm run demo:memory
```

Two columns. Same message, same model, same temperature, same persona. The
**only** difference between them is whether that block was appended.

Say that explicitly, because the obvious suspicion is that the control was
weakened to flatter the comparison:

> "The left column is not a strawman. It is literally the product before this
> work — same prompt, minus the memory. Nothing was taken out of it to make the
> right column look better."

Let the `topic_recurrence` case land on its own:

| Without memory | With memory |
|---|---|
| "Oh, another one? It sounds like those conversations with your boss have a way of leaving you with a particular feeling. What was it about this one that made it feel 'weird' to you today?" | "It sounds like your manager is still a recurring source of friction. **This is the third time we've talked about a difficult interaction with them**, and it makes me wonder what's really going on beneath the surface." |

Both are competent. Only one of them has been paying attention.

### c. The case that is easy to skip and shouldn't be

Scroll to `first_time_user`. No history at all.

> "This is the one I would have got wrong. When there is nothing to load, the
> block is empty — not filled with 'unknown' or 'no data'. A block full of
> blanks reads to the model as something worth remarking on, and you get a
> therapist opening with 'I don't seem to know much about you yet.' Which is a
> terrible first line."

And `irrelevant_history` — history exists, but she is talking about a broken
laptop, and the reply does not drag her holiday plans into it.

> "Memory that cannot stay quiet is not memory. It is a party trick."

### d. The decision (§4)

```
npm run demo:windows
```

Three columns: the same person and the same message at 3, 5 and 10 sessions of
loaded history. Talk them through it, then ask for a number. Detail in §4.

### e. The one thing that does not work yet

The demo plan commits to showing a limitation every time. Use this one, because
it is the honest edge of the exact feature being demoed:

> "There is no relevance filter. All five sessions go into the prompt every
> time, whether or not they have anything to do with what the person just said.
> Staying quiet about the irrelevant ones is an instruction in the prompt, not
> something the system enforces. It holds up in testing. It is not guaranteed,
> and I would rather you heard that from me than noticed it in month two."

That also sets up §4 rather than sitting apart from it — the smaller the
window, the less there is to be irrelevant about.

---

## 2. Explaining it to the client, without jargon

### What was there before

Every conversation started from nothing. The daily check-in captured a mood
score and put it in a table, and the chat never read that table. Two features
in the same product, not speaking to each other.

Someone could check in every morning for three weeks, watch their own mood
slide, open the chat, and be met by something that had never seen any of it.

### What happens now

Before the therapist is asked to say anything, the app fetches that person's
recent history and writes it into the instructions the model receives — in
plain English, the way you would brief a colleague before they walk into a
room. *She has been lower each time this fortnight. Two days ago it was work
pressure and sleep.*

The model is not searching a database mid-conversation. It is briefed before it
opens its mouth.

### Why that is harder than it sounds

The obvious version of this feature is bad, and it is bad in a specific way.
Give a model someone's history and it will read it back to them:

> "I see your mood scores were 62, 58, 55, 49 and 44, and that on Tuesday you
> discussed work and sleep."

That is not memory. That is a receptionist reading a file to your face. It is
also the version that most demos of this feature ship, because it looks
impressive in a screenshot and feels awful to receive.

The second version is worse, because it is harder to spot:

> "Your mood is showing a steady decline. I remember you mentioned struggling
> with sleep."

No numbers, so it passes a naive test. Same failure. It is narrating the record
instead of speaking to the person.

Most of the work in this feature is in stopping both. The instructions carry
worked examples of each failure, labelled as things never to do — which is
noticeably more effective than telling a model to "be natural".

---

## 3. The architecture

### 3.1 The read path

```
user sends a message in /chat
      │
      ▼
POST /api/chat-therapy        Authorization: Bearer <user JWT>
      │
      ├─ 1. crisis screening                                     ← T-7
      │       runs FIRST, before history is even fetched
      │       flagged ─► escalation text, no model call at all   ← T-8
      │
      ├─ 2. load history, under the caller's own JWT so RLS applies
      │       ├─ coach_sessions    ended_at not null, newest 5   ← T-2
      │       └─ therapy_sessions  newest 14
      │
      ├─ 3. buildMemoryBlock()  →  prose, not JSON
      │       ├─ mood, oldest to newest
      │       ├─ averages this week (mood, energy, stress)
      │       ├─ the mood word from the newest check-in
      │       ├─ direction — only when it has moved 8+ points
      │       ├─ what they said in their last 3 check-ins
      │       └─ one line per conversation: when, mood, summary, topics
      │
      ├─ 4. BASE_SYSTEM_PROMPT + memory block
      │       CHAT_DEBUG_PROMPT=1 prints exactly this            ← T-2 acceptance
      │
      └─ 5. Gemini 2.5 Flash, temperature 0.6
```

**Three decisions worth defending if asked.**

**Assembled on the server, not the browser.** The route already verifies the
JWT, so it reads the user's own rows directly rather than trusting a payload
sent up from the client. Two reasons: a client-supplied history block is a
client-controlled prompt, and T-2 is verified by inspecting one place rather
than reconstructing it from four.

**Read with the user's JWT, never a service key.** Row Level Security applies
to this feature exactly as it applies to everyone else. A bug in the route
cannot load someone else's history, because the database refuses it rather than
trusting the code.

**Missing history is not an error.** If either read fails the user still gets a
therapist, just one without memory, and the failure is logged loudly. A
wellbeing chat that shows an error screen because a secondary query timed out
is worse than one that is briefly forgetful.

### 3.2 Where the summaries come from

The memory block is only as good as what T-4 writes. Ending a session posts to
`/api/summarise-session`, which returns `{ summary, mood_score, topics[] }` and
writes it to `coach_sessions`. That row is what the *next* conversation reads.

Demo 1 showed that write happening. This demo shows what it was for. Worth
saying out loud — it connects the two calls and makes the first one look less
like plumbing.

### 3.3 One number that is not arbitrary

`moodTrendDirection` calls it a decline at **8 points** between the older and
newer half of the window. That threshold is not new here — it is the same one
the existing burnout early-warning rules use.

If they disagreed, the chat could open by saying someone sounds steadier while
the warnings panel two screens away flagged them as declining. Same product,
two contradictory opinions about the same person, both technically working.

---

## 4. The decision I need on this call

**How much history is the right amount.** Five is where it is set now.

The demo plan states the trade-off, and `npm run demo:windows` shows it rather
than arguing it. One person, one message — *"Work has been relentless this week.
I barely slept."* — at three window sizes. Her history is deliberately not
uniform:

| Sessions | What they contain |
|---|---|
| 1–4 | The last two weeks. Work, a new manager, not sleeping. |
| 5 | A good weekend with friends. |
| 6–10 | A breakup, three weeks to two months old, worked through and no longer raised by her. |

What to watch for in each column:

**3 sessions** — connects, but only to the surface. It knows about the
deadlines. It does not know the new manager is where this started, because that
session is four back.

**5 sessions** — reaches the cause without reaching the breakup. On the last
run: *"the pressure from your new manager hasn't eased up at all since we last
spoke."*

**10 sessions** — a two-month-old breakup is now sitting in the prompt while she
talks about work. It did not come back out on the run I captured. The point is
that it *could*, and that the model is the only thing standing between it and
her screen. That is the intrusiveness the demo plan warned about, and it is not
a bug you can fix later — it is a choice about how far back the product is
allowed to reach.

**My recommendation: stay at 5.** Three is shallow enough that the feature
stops being worth the complexity. Ten buys very little and puts material in
front of people that they have finished with.

Two things to be straight about when they answer:

- The replies vary between runs. Run it two or three times before deciding, and
  do not read too much into one column being warmer than another once.
- This decision is about **session summaries only**. The mood window is separate
  and stays at 14 check-ins either way. Nobody has ever objected to a product
  remembering a number they entered themselves; the sensitivity is entirely in
  the written summaries.

It is a one-line change either way (`.limit(5)` in the route), so this is cheap
to answer and cheap to change. Get the number on the call.

---

## 5. Evidence to have open

Three terminals, in this order. Everything below is real output from 11 August.

**`npm run demo:prompt`** — the T-2 payload, zero API calls.

**`npm run demo:memory`** — the A/B. The four fixtures are:

| Fixture | What it proves |
|---|---|
| `declining_three_sessions` | The literal T-3 acceptance case — five check-ins, 66 down to 41 |
| `first_time_user` | No history invented where none exists |
| `topic_recurrence` | Same topic three times gets connected |
| `irrelevant_history` | History that does not apply stays out of the way |

The harness scores the two failure modes automatically. **Recitation** — any
number from the block appearing in the reply. **Report language** — narrating
the record without digits, which is the one that got through the first version
of this test. It also flags a **weak control**: when the no-memory column
happens to match a continuity word like "lately", the contrast on screen is less
sharp than the pass/fail suggests. Better to know that before showing it than
during.

**`npm run demo:windows`** — the three window sizes for §4.

If a single fixture needs re-running live: `npx tsx scripts/runMemoryTests.ts
--only=topic_recurrence`. Add `--stacked` if the screen share is narrow.

---

## 6. Questions the client will ask

**"Is it actually reading the history, or just being vague enough to sound like
it is?"**

The best answer is the `first_time_user` and `irrelevant_history` columns, not
the impressive one. A model bluffing continuity bluffs it everywhere — it would
imply shared history with a brand-new user too. It doesn't. The behaviour tracks
what is in the prompt, which is the only real evidence that it is reading it.

**"How far back does it go? Does it forget things?"**

Five conversations and fourteen check-ins. Beyond that it does not forget so
much as stop being told — the older rows are still in the database and still
visible to the user in Profile History. §4 is exactly this question, which is
why it is the decision on this call.

**"Can it see things the user deleted?"**

No. Both reads run under Row Level Security against live rows. A deleted
session is gone from the query, so it is gone from the memory on the very next
message.

**"What does this cost per message?"**

At five sessions the block is about 2,400 characters, so roughly 600 tokens
added to each request. On Gemini 2.5 Flash that is a fraction of a cent per
message and not worth optimising yet. The real cost is latency, and that is in
§7. `npm run demo:windows` prints the exact block size for each window.

**"Why not just give it everything?"**

Two reasons, and only the first is technical. Cost and latency scale with the
prompt. But the one that matters is §4 — a product that brings up everything it
knows is not attentive, it is invasive.

---

## 7. Still open after this demo

| | |
|---|---|
| ~~**D-1** percentages or observations~~ | **Answered 14 August: observations.** I-5 built on the 15th. See below. |
| **D-7** crisis helpline numbers | Still empty. Blocker for Demo 3 on the 13th. |
| No relevance filter | The limitation shown in §1e. Prompt-level, not enforced. |
| **T-5** 2-second load at 100 sessions | Still not measured with real volume. |
| ~~Reply truncation~~ | **Fixed** on 11 August, before this demo. See below. |

### D-1 is now urgent, not procedural

Scope freezes tomorrow, 12 August. The Intent Detector's analysis layer is not
built, and it is not late — it is blocked. Percentages versus observations
changes the output schema, not the wording, so it cannot be built ahead of the
answer and rewritten after. Sessions currently run to a stored transcript and
stop.

Raise it on this call even though it belongs to a different feature. It is the
last call before the freeze.

**Resolved 14 August.** Raising it here did not land it; what landed it was the
stability measurement, sent on the 13th — the same recording run five times,
coming back with a different speaker count and anywhere from 99 to 273 seconds
each time. The client answered within a day: *"we will need analysis there not
percentage."* Two days lost against the freeze, and the lesson is that the
argument only worked once it had a number behind it.

### Reply truncation — found and fixed on the morning of the demo

Worth telling them about even though it is fixed, because how it was found is
the point.

Gemini 2.5 Flash counts its internal reasoning against the same ceiling as the
visible reply, and the route capped that ceiling at 1024. Measured on this exact
prompt: **reasoning 979 tokens, reply 41.** The reasoning was consuming 96% of
the budget, replies were being cut mid-sentence, and the route's repair then
trimmed them back to the last full stop — which is where the closing question
the persona is told to end on was going.

Two things made it hard to see. It was intermittent, because reasoning length
varies run to run, so it read as the model occasionally being terse rather than
as a config bug. And it got *worse* as the memory block grew, so the feature
meant to improve replies was quietly truncating them.

It surfaced because the A/B harness prints the raw `finishReason` instead of
trusting the text it gets back. The caps are now removed from both the route and
the harness, and the harness still checks for `MAX_TOKENS` — not because it
expects it, but so that anyone reintroducing a cap sees it in a test run rather
than in blunt replies three weeks later. This is the second time a token cap has
broken something here; the first disabled the crisis classifier outright, and
that comment is still in `lib/crisis.ts`.

**The honest version for the call:** "I built a test harness to prove the memory
feature worked, and it found a bug in something else — one that had been
silently shortening every reply in the product, including the ones I would have
demoed to you today."
