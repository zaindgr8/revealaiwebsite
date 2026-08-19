# Client requirements — source record

The client's requests as they were actually written, before any interpretation.

This file exists so there is one place to check what was literally asked for.
The PRD is an interpretation of these messages; where the two differ, this
document records what the client said and the PRD records what was agreed. If
a question ever comes up about whether something was in scope, start here.

**Client:** Zain (UAE)
**Received:** 3 August 2026, via WhatsApp, relayed through Ahmed
**PRD v0.1:** 4 August 2026 · **v0.3:** 5 August 2026 · **Delivery:** 26 August 2026

---

## 1. Verbatim

### Message 1 — 3 Aug, 11:43 PM

> AI Chat Therapist That Talks to you as per your past mood and talking
> AI Talk Therapist //
> Profile History Should be Showing There , now data not getting stored

### Message 2 — 3 Aug, 11:46 PM

> Intention Detector (Find Intention Of Person You Are Talking To)
>
> Flow:
> You first record your voice so AI knows that its you and other person has diff voice
> You need to tell either its date/ interview or other scenarios
> it gives stats based on tone and word

That is the entire brief. Everything in the PRD is derived from these two
messages.

### Later, on the PRD itself

> Can you give a detailed review on what is needed and what's not, any Improvement etc

> Can you tell if something is not mentioned in the document because everything
> will be developed from document

> That's all for now. If anything else needs to be added, we'll let you know

The client reviewed the PRD and approved it.

**The second quote is the important one.** The client has stated that the
document is the build specification. Anything not written into it either does
not get built, or becomes an argument later. It is also an explicit invitation
to add what is missing — which is the opening used for v0.2 and v0.3.

---

## 2. Line by line

### Message 1

| Client wrote | Means | PRD |
|---|---|---|
| "Talks to you as per your past mood and talking" | Chat draws on past mood **and** past conversations | T-2, T-3 |
| "AI Talk Therapist //" | **Ambiguous — see §4** | D-6 |
| "Profile History Should be Showing There" | A screen listing past sessions | T-5, T-6 |
| "now data not getting stored" | The reported bug | Persistence fix |

Note the client listed **two** things — "AI Chat Therapist" and "AI Talk
Therapist" — on separate lines. The PRD treats this as one feature.

### Message 2

| Client wrote | Means | PRD |
|---|---|---|
| "Find Intention Of Person You Are Talking To" | The feature's purpose | Feature 2 |
| "You first record your voice so AI knows that its you" | Voice enrolment | I-1 |
| "and other person has diff voice" | Speaker separation | I-4 |
| "either its date/ interview or other scenarios" | Scenario selection | I-2 |
| "it gives **stats** based on tone and word" | Scored output — **see §4** | I-5, D-1 |

---

## 3. What the client did not ask for

Everything below is in the PRD but was not requested. It was added because the
work is not defensible without it, and each should be understood as a
recommendation the client accepted rather than something they wanted.

- **Crisis detection and escalation** (T-7, T-8). Not mentioned by the client.
  Added on the grounds that a product built around emotional wellbeing with no
  crisis handling is a risk to users and to the business. The PRD states that
  removing it requires written instruction.
- **Consent screen for the second person** (I-3). Not mentioned. Added because
  recording someone without consent carries legal weight in the UAE.
- **Encryption, deletion, retention** (N-1, N-2). Not mentioned. Voice
  recordings are biometric data under GDPR and the UAE PDPL; deletion is a
  legal obligation, not a feature.
- **Withholding low-confidence results** (I-7). Not mentioned. A product
  position: better to decline than to answer confidently and wrongly.
- **Upload failure recovery** (N-3). Not mentioned. The recordings this product
  captures are usually unrepeatable.

---

## 4. Ambiguities

### 4.1 "AI Talk Therapist" — unresolved, and it affects the estimate

The client wrote two lines:

> AI Chat Therapist That Talks to you as per your past mood and talking
> AI Talk Therapist //

"Talk" may mean speaking aloud rather than typing. The PRD assumes **text
only** and lists voice output as out of scope, recorded as assumption D-6.

This matters more than it looks. There is a **partially built voice
conversation mode already in the codebase** — `components/LiveVoiceChat.tsx`, a
Gemini token route and a TTS route — which was switched off in a previous
commit. If the client meant voice, part of it may be recoverable rather than
built from scratch.

**Status: unanswered.** It should be settled before the contract is signed,
because it can change the scope after the fact.

### 4.2 "it gives stats" — the client asked for the thing the PRD recommends against

The client's words are explicit: *"it gives stats based on tone and word"*.
The live marketing site shows "Genuine Interest 92%" and "Guarded / Cautious
78%".

The PRD's D-1 recommends **observations instead of scores**, on the grounds
that the analysis is a judgement rather than a measurement and repeat runs can
differ.

That recommendation runs against both what the client asked for and what he is
already selling. It may well be the right call — but it should be understood as
pushing back on a stated requirement, not clarifying an ambiguous one, and
pushback should be expected.

**Status: answered 14 August 2026 — observations.** The client changed position
when shown that the same recording, run five times unchanged, came back
differently each time: *"we will need analysis there not percentage."*

He also added a shape the PRD had not asked for — findings pinned to specific
moments, *"it needs to tell that at 'this' point the other person was trying to
manipulate"* — which is what I-5 was built to on 15 August.

The site still advertises "Genuine Interest 92%". That is now a discrepancy
between the product and the marketing rather than an open question, and it
belongs to §5.

---

## 5. Sold but not requested

The live site markets three things absent from both the client's messages and
the PRD scope. All three are explicitly out of scope, but the client is taking
money against them today.

| On the site | Status |
|---|---|
| **Tone Coach** — "real-time vocal guidance for interviews, dates, and high-stakes moments" | Out of scope. The PRD excludes live analysis during a conversation. |
| **Team tier, $39/mo** — team health dashboard, manager insights, API access | Out of scope. Also the pattern the EU prohibition on workplace emotion recognition targets. |
| **Free tier** — $0 forever, 5 check-ins/month, "mobile app access" | No free tier exists in the product; billing is a paid subscription. Mobile is out of scope. |

The site also presents the Intent Detector with percentage scores. As of
14 August the client has decided against those, so the site now advertises an
output format the product deliberately does not produce. Someone should change
the copy before launch.

**This needs an explicit answer: is the PRD the source of truth, or the site?**
If the PRD, the site copy needs correcting. If the site, scope and timeline
both change.

---

## 6. Open questions

| | Status | Blocks |
|---|---|---|
| D-1 — percentages or observations | **answered 14 Aug: observations, pinned to moments.** Built. | — |
| D-2 — second-party consent reviewed by a lawyer | no need for the other person review as the user is uploading the conversation , this person is the one who is responsible for the consent | Consent wording |
| D-3 — who writes privacy policy and terms | they will , we dont need to add it ourself | Consent copy, launch |
| D-4 — retention period | **Closed 15 Aug: no automatic retention.** Removed at Shayan's direction — consent is taken from the uploader on behalf of both parties, and users can delete their own data (N-2). Recordings are now kept until deleted by hand. | — |
| D-5 — is the Team tier coming | Unanswered | Data model, risk profile |
| D-6 — voice or text therapist | text | Scope, estimate |
| Crisis helpline numbers | Not requested so we shouldnet bult that unless explicitly requested | Escalation screen is empty |
| Site vs PRD as source of truth | Not yet asked | Scope |

## 7. Client obligations

Stated in the PRD as assumptions. Both are currently unmet, and the schedule
depends on them.

1. **Access to the codebase, database and deployment environment on day 1.**
   Supabase dashboard access has not been granted; seven migrations are written
   and none can be applied.
2. **Third-party API costs billed to the client.** The PRD covers who pays but
   does not state that the client must *supply the keys*. `GEMINI_API_KEY` is
   missing, which leaves every AI feature non-functional locally.

Also needed and not yet listed anywhere: `SUPABASE_SERVICE_ROLE_KEY`.
`CRON_SECRET` is no longer required — automatic retention was removed on
15 August 2026, see D-4 below.
