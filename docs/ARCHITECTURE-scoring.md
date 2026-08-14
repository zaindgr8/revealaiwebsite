# How the check-in scores are calculated

The technical core of the product. What is measured, what is judged, and how
reliable each part actually is.

Written 6 August 2026, with measurements taken the same day.

---

## 1. The short version

There are two layers, and only one of them is an algorithm.

**Layer 1 — measurement.** Real digital signal processing in the browser,
on the raw audio. Pitch, pause structure, speech rate, volume steadiness.
Deterministic: the same recording always produces the same numbers.

**Layer 2 — scoring.** The five numbers the user actually sees —
`mood_score`, `energy`, `stress`, `positivity`, `confidence` — are **not
computed from Layer 1 by any formula.** They are produced by Gemini, which is
given the audio plus the Layer 1 measurements and asked to interpret them.

> **Measurement is deterministic. Scoring is judgment.**

That distinction is the single most important thing to understand about this
product, and it is not currently communicated to users anywhere.

---

## 2. Layer 1 — what is genuinely measured

`lib/audioFeatures.ts`. Web Audio API, 25ms frames, 10ms hop.

### Pitch — autocorrelation

```
for each lag in [sampleRate/400 .. sampleRate/70]:
    ac[lag] = Σ samples[i] * samples[i+lag]
pitch = sampleRate / argmax(ac)
rejected if ac[peak] / ac[0] < 0.25
```

Standard time-domain pitch detection over a 70–400 Hz search range, with a
confidence gate so unvoiced frames return null rather than noise.

### The rest

| Feature | Method |
|---|---|
| `pitch_variability` | Standard deviation of voiced pitches, scaled `/100`, clamped 0-100 |
| `pause_count` | RMS below 2% of peak, sustained ≥200ms |
| `speech_rate_wpm` | Syllable nuclei (RMS peaks above 15% of peak, ≥80ms apart) ÷ 1.5 = words, over speaking time |
| `volume_consistency` | `(1 − stdDev/mean)` of voiced RMS — inverted coefficient of variation |
| `jitter_shimmer_index` | Mean frame-to-frame ǀΔpitchǀ ÷ 20 and ǀΔRMSǀ ÷ 0.05, averaged |
| `signal_quality` | Proportion of frames that are voiced |

Plus a 500-point waveform envelope and per-2-second emotion segments for the
visualisations.

**This is real measurement.** Nothing here is invented, and it is competent
browser DSP. It was written by the previous developer and has been kept.

### Where Layer 1 is weak

1. **`syllables / 1.5`** assumes English-average syllables per word. That
   constant is the entire basis of "words per minute".
2. **`pitch_variability = stdDev / 100`** is arbitrary normalisation. A 100 Hz
   standard deviation maps to 100. Calibrated against nothing.
3. **`jitter_shimmer_index`** divides by `20` and `0.05` — magic numbers. It is
   correctly *named* a proxy. It is **not** clinical jitter/shimmer, which
   requires period-level analysis of consecutive glottal cycles.
4. **Autocorrelation is octave-error prone** and O(n²) per frame. Acceptable
   for 60 seconds in a browser; not robust.
5. **No per-user baseline.** Everything is absolute. A naturally quiet person
   reads as low energy permanently.

---

## 3. Layer 2 — how the scores are produced

```
POST /api/analyze-mood
  ├─ audio (base64)
  ├─ Layer 1 measurements, rendered as text
  └─ prompt = SYSTEM_PROMPT
            + SCHEMA_BLOCK
            + SCORING_RUBRIC          ← how measurements map to scores
            + VOCAL_SUMMARY_VS_AI_INSIGHT_RULE
            + ANCHOR_RULE
            + measured acoustics
        ↓
    gemini-2.5-flash, temperature 0, JSON out
        ↓
    { mood_score, energy_level, stress_level, positivity, confidence,
      detected_mode, narrative_type, vocal_summary, ai_insight, ... }
```

`SCORING_RUBRIC` is what connects the two layers:

> *energy_level scales UP with higher pitch variability, faster pace, higher
> avg pitch. stress_level scales UP with high jitter/shimmer, low volume
> consistency…*

### The bug: the rubric was never reaching the model

`SCORING_RUBRIC`, `ANCHOR_RULE` and `VOCAL_SUMMARY_VS_AI_INSIGHT_RULE` were
all defined in the route and **never referenced**. `fullPrompt` was built from
`SYSTEM_PROMPT + schema + acousticCtx` only.

So the app performed real signal processing, passed the results into the
prompt, and then **never told the model what any of it meant.** The
measurements were sitting in the context as decoration while the model scored
from its own impression of the audio.

Restored 6 August. This is the single largest quality change to the check-in,
and it is the honest answer to "did we write our own algorithm": the algorithm
existed and had been silently disconnected.

---

## 4. Reproducibility — measured, not assumed

Same audio file, same prompt, six runs at each temperature.

### At temperature 0.3 (what was shipped)

| metric | min | max | **range** | stdev |
|---|---|---|---|---|
| mood_score | 30 | 45 | **15** | 5.2 |
| energy_level | 40 | 65 | **25** | 10.2 |
| stress_level | 70 | 85 | **15** | 5.2 |
| positivity | 20 | 30 | **10** | 4.5 |
| confidence | 40 | 60 | **20** | 8.2 |

`detected_mode`: **anxious, 6 times out of 6.**

### At temperature 0 (now shipped)

| metric | range | stdev |
|---|---|---|
| mood_score | **5** | 2.0 |
| energy_level | **0** | 0.0 |
| stress_level | **0** | 0.0 |
| positivity | **5** | 2.0 |
| confidence | **5** | 2.0 |

Five of six runs were byte-identical.

### What this tells us

**The qualitative read is reliable. The precise number was not.**

`detected_mode` was stable at both settings. The model consistently understood
the recording as anxious. It simply could not agree with itself on whether that
was a 30 or a 45.

### The consequence nobody had noticed

`computeEarlyWarnings()` in `lib/ai.ts` fires on thresholds like:

- **Burnout:** energy non-increasing across 4 sessions AND total drop ≥15
- **Mood slump:** mood < 40 for 3 consecutive sessions
- **Stress spike:** stress > 70 for 3 consecutive sessions

At temperature 0.3, **energy had a 25-point spread on identical audio.** A
15-point "drop" was comfortably inside the noise. Mood's threshold of 40 sat in
the middle of its 30–45 band. Stress's threshold of 70 sat at the very bottom
of its 70–85 band.

**The burnout detection was operating at a finer resolution than the
measurement noise.** Alerts could fire on nothing at all — and the product
markets that feature as *"detects burnout 7–14 days before you feel it."*

Setting temperature to 0 is what makes those thresholds meaningful. It is not a
tuning preference; it is a precondition for the early-warning system working.

### Trade-off accepted

Temperature 0 also makes `ai_insight` and `vocal_summary` more deterministic,
so wording will vary less between sessions. Worth watching. If the prose
becomes repetitive, the fix is **two calls** — scores at 0, narrative at 0.6 —
not reintroducing variance into numbers the user is shown as a trend line.

---

## 5. Whose work is whose

| | |
|---|---|
| Layer 1 DSP | Previous developer. Kept unchanged. |
| LLM-scoring architecture | Previous developer. Kept. |
| Reconnecting `SCORING_RUBRIC` | This work — it had been severed |
| `temperature: 0` | This work, based on the measurements above |
| `normalisePace` / `normaliseMode` guards | This work |
| Trend and memory layer feeding the chat | This work |

No algorithm was replaced. The existing design is sound; it was misconfigured
in three ways that each degraded it silently.

---

## 6. What is still not true about these numbers

Stated plainly, because it will be asked eventually.

**They are not validated.** There is no ground truth, no reference dataset, no
clinical comparison. Nobody has ever checked whether a `mood_score` of 35
corresponds to anything.

**They are not calibrated between users.** A 60 for one person and a 60 for
another do not mean the same thing, because there is no per-person baseline.

**They are consistent, which is not the same as correct.** Temperature 0 means
the same recording gives the same score. It says nothing about whether that
score is right.

**The 7–14 day burnout claim is not backed by evidence.** It comes from six
hand-written threshold rules over these scores. They are reasonable heuristics.
They have never been tested against anyone actually burning out.

This is the same problem as PRD decision **D-1** — a judgement presented as a
measurement — except it applies to a feature that is already live and already
being charged for. D-1 asks the question for the Intent Detector. Nobody has
asked it for the check-in.

---

## 7. If this is to be strengthened

In order of value per effort:

1. **Per-user baselines.** Score relative to that person's own history rather
   than an absolute scale. The data is already there.
2. **Widen the noise measurement.** Six runs, one clip. Repeat across 20 varied
   recordings to get a real confidence interval per metric.
3. **Re-derive the early-warning thresholds** from that interval, so each rule
   fires outside noise by a known margin.
4. **Calibrate `pitch_variability` and `jitter_shimmer_index`** against a
   reference corpus instead of the current arbitrary divisors.
5. **Show uncertainty in the UI.** "Around 35" is more honest than "35" and
   costs nothing to say.
