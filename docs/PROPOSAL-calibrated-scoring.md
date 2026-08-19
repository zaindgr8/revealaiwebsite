# Proposal — calibrated, per-user scoring

**Status:** proposal. Not in the PRD, not in the three weeks. Needs a decision.
**Written:** 6 August 2026, following the reproducibility measurements in
[ARCHITECTURE-scoring.md](ARCHITECTURE-scoring.md).

---

## 1. The problem in one paragraph

`mood_score: 45` has no referent. It is not calibrated against the user's own
history, against other users, or against any external instrument. A 0–100 scale
implies you can distinguish 45 from 46; the underlying judgement has perhaps
four or five levels of real discrimination. Meanwhile the part that *is*
reliable — `detected_mode`, stable across six identical runs — is rendered as
a small label under the number that wobbles.

The failure mode is specific and permanent: a user has a genuinely good day and
scores 40, then a rough day and scores 45. Trust does not come back from that.

---

## 2. The insight that makes this worth doing

The product's entire pitch is *"your voice reveals what you don't say."*

Right now that is an assertion. There is no way to know whether it is true,
because nothing records what the user *did* say about how they felt.

Ask them — one tap — and the claim becomes **measurable**:

> "You said you were fine. Your voice sounds the way it does on the days you
> tell us you're struggling."

That is the product working, demonstrably, with the user's own words as the
evidence. It is a better version of what is already being sold, and the same
data is what makes the scores honest.

**Self-report is not a retreat from the voice analysis. It is what turns the
voice analysis into something that can be shown to be right.**

---

## 3. Design

### 3.1 The architectural change

Split the two layers by what each is actually good at:

| | Now | Proposed |
|---|---|---|
| `detected_mode`, `ai_insight`, `vocal_summary` | LLM | **LLM** — unchanged, it is reliable here |
| `mood_score`, `energy`, `stress`, `positivity`, `confidence` | LLM | **Computed** from acoustics + baseline + calibration |

Numbers become deterministic, explainable and calibrated. Language stays with
the model, where the six-run test showed it is stable.

This also removes LLM variance from the scores entirely — not reduced as
temperature 0 did, but structurally absent.

### 3.2 Schema

```sql
alter table public.therapy_sessions
  add column self_report      smallint
    check (self_report is null or self_report between 1 and 5),
  add column self_report_at   timestamptz,
  -- what the model would have said, kept during rollout so the two can be
  -- compared before the computed score replaces it in the UI
  add column llm_mood_score   smallint;
```

No separate baseline table initially. Baselines are computed from the user's
own `vocal_metrics` history on read — trivial at the volumes involved, and it
avoids a cache that can drift out of date.

### 3.3 Phase 1 — relative scoring (no self-report needed)

Works from session ~5. This alone is a large improvement and requires no new
user input at all.

For each acoustic feature, express the current session as a z-score against
that user's own history:

```
z = (current − user_mean) / user_stdev
```

Then present relatively:

| z | shown as |
|---|---|
| ≤ −1.5 | "much lower than your usual" |
| −1.5 … −0.5 | "a little lower than usual" |
| −0.5 … +0.5 | "about where you normally are" |
| +0.5 … +1.5 | "a little higher than usual" |
| ≥ +1.5 | "much higher than your usual" |

This fixes the structural problem that a naturally quiet person reads as
low-energy permanently. It also means the number finally answers the question
users actually have, which is *"is this normal for me?"* — not *"where do I sit
on an invented scale?"*

### 3.4 Phase 2 — calibration against self-report

After ~10 paired observations, fit a per-user linear model:

```
predicted_self_report =
    w₁·z(pitch_variability)
  + w₂·z(speech_rate)
  + w₃·z(volume_consistency)
  + w₄·z(jitter_shimmer)
  + w₅·z(avg_pitch)
  + b
```

Ordinary least squares over that user's history. Five features, ten-plus
points — small enough to solve in JavaScript, no library needed, and small
enough to refit on every check-in.

Now the score means something concrete: *"your voice looks the way it does when
you tell us you're a 2."*

Store `weights` and the fit quality alongside. If a user's voice genuinely does
not predict their self-report, the correlation will say so — and that is
information worth having rather than hiding.

### 3.5 Phase 3 — the gap becomes the product

Once both numbers exist, the interesting signal is the **difference**:

```
gap = predicted_from_voice − self_reported
```

- Gap near zero → voice and words agree
- Voice notably lower than self-report → *"you said fine, you don't sound it"*

That is the actual product promise, finally computable. It is also a far
stronger version of "hidden fatigue" than the current hand-written rule, which
infers the same idea from mood staying flat while energy drops.

### 3.6 Cold start

| Sessions | What the user sees |
|---|---|
| 1–4 | Qualitative only — mode, insight, vocal observations. No number. "Still learning your voice." |
| 5–9 | Relative scoring (Phase 1) |
| 10+ | Calibrated scoring (Phase 2), with the voice/words gap |

Withholding the number early is not a limitation to apologise for. It is more
honest than showing an uncalibrated one, and "we are still learning your voice"
gives a new user a reason to come back tomorrow — which is the retention
problem this product has anyway.

### 3.7 Asking without undercutting the pitch

The self-report must not read as *"we can't tell, so you tell us."* Frame it as
teaching:

> **How did that actually feel?**
> This is how we learn what your voice does. 😞 😕 😐 🙂 😄

Required for roughly the first fifteen sessions, then optional and sampled — a
prompt every few sessions to catch drift. And once Phase 3 is live it becomes
the most interesting screen in the product, because the answer is immediately
compared against the voice.

---

## 4. What this makes possible that is impossible today

**A validation number.** Correlation between predicted and self-reported, per
user and in aggregate. Right now, if the client asks "how accurate is this?",
there is no answer. With this, there is one.

**Defensible early warnings.** The current thresholds — energy drop ≥15, mood
below 40 — were compared against measurement noise in
[ARCHITECTURE-scoring.md](ARCHITECTURE-scoring.md) and found to be operating
inside it at the shipped settings. Z-scores against a personal baseline are
noise-relative by construction, so a rule can be written to fire at a known
number of standard deviations rather than an arbitrary point value.

**An honest claim.** "Detects burnout 7–14 days before you feel it" is
currently unevidenced. With self-report history, it is a testable statement —
and if it turns out to be true, that is worth far more than asserting it.

---

## 5. Effort

| | |
|---|---|
| Migration | 1 hour |
| Self-report UI after check-in | half a day |
| Baseline / z-score computation | half a day |
| Relative presentation in results + history | half a day |
| **Phase 1 subtotal** | **~1.5 days** |
| Least-squares fit and storage | 1 day |
| Calibrated scoring + cold-start gating | half a day |
| Voice-vs-words gap | half a day |
| Validation view | half a day |
| **Full total** | **~4 days** |

Phase 1 delivers most of the benefit for a third of the cost, and is worth
doing on its own even if the rest is declined.

---

## 6. Why timing matters

**This gets harder every day it is not done.**

Every check-in recorded without a self-report is an observation that can never
be calibrated. The paired data can only be collected going forward — there is
no way to ask someone how they felt on a Tuesday in June.

There are nine sessions of history in the database. Starting now means the
first calibrated users appear in roughly two weeks. Starting after launch means
starting from zero with a larger, more impatient user base.

---

## 7. The honest caveats

**Self-report is not truth either.** People under-report distress, and mood is
hard to rate on a five-point scale. But it is *the user's own account*, which
is a defensible target in a way that an invented number is not — and if the
voice model disagrees with it, that disagreement is the product.

**Some users will not be predictable.** Voice will not predict self-report for
everyone. The correlation will show it, and those users should see qualitative
output rather than a number. That is a feature: knowing when not to claim
something.

**This is new scope.** Not in the client's brief, not in the PRD, not in the
three weeks. It should be raised as a recommendation with a cost, decided on,
and scheduled — not absorbed quietly.

**It is adjacent to D-1.** Both come down to the same question: is this product
willing to say "this is our read" rather than "this is a measurement"?
Calibration is what would let it say the second one honestly.
