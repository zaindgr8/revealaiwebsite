# prompts/

Every prompt the product sends to a model. Nothing else lives here.

Created 11 August 2026, pulling them out of the six route and library files
they were scattered across.

## Why they are `.ts` and not `.txt` or `.md`

Tempting, and wrong. These are imported by Next.js route handlers, which are
bundled for serverless. A file read from disk at runtime is not guaranteed to
be in the deployment bundle, so `readFileSync('prompts/elena.txt')` works
locally and fails in production — the worst possible failure shape.

TypeScript constants are bundled with the code that imports them, are checked
at build time, and can be imported identically by the routes and by the `tsx`
test scripts. Editing them is still just editing text.

## What is where

| File | Used by | Requirement |
|---|---|---|
| `elena.ts` | `/api/chat-therapy`, `scripts/runMemoryTests.ts` | T-3 |
| `memory.ts` | `lib/chatMemory.ts` | T-2, T-3 |
| `crisis.ts` | `lib/crisis.ts` | T-7, T-8 |
| `summarise.ts` | `/api/summarise-session` | T-4 |
| `checkIn.ts` | `/api/analyze-mood` | the daily voice check-in |
| `deepQuestion.ts` | `/api/deep-question` | the follow-up question |
| `intent.ts` | `/api/intent/analyse`, `scripts/testIntentAnalysis.ts` | I-5 |

## Two rules

**Import, never paste.** `ELENA_PERSONA` used to exist twice — once in the
route, once in the test harness. That quietly voided the harness: an A/B run
is only evidence about production if it uses production's prompt, and two
copies means one edit makes the test pass against a persona nobody ships.
That is why `elena.ts` exists at all.

**Never write out the sentence you are banning.** Everything the model can
see, it can copy, and a bad example is still that text sitting in the context
window. The rule in `memory.ts` against announcing what you remember used to
carry a worked example of the violation; the model reproduced it nearly
verbatim in about one reply in three. Deleting the exhibit dropped that to
roughly one in twelve — measured 11 Aug 2026, and **not** to zero, so do not
treat it as solved. State a rule, or show a good line, but never spell out the
bad one.

## Testing a change

```
npm run demo:memory            # T-2 / T-3, with and without memory
npm run test:crisis            # T-8, all 35 phrases
npm run test:intent            # I-5 guards, offline
npm run test:intent -- --live  # plus one real analysis you can read
```

Run them **several times**. These failures are intermittent, and a single
clean run proves nothing — the bug above passed five consecutive runs before
failing twice more.

Editing `crisis.ts` is a safety change. It decides whether someone at risk
gets a support screen or a conversational reply, so `npm run test:crisis`
is not optional before shipping one.

Editing `intent.ts` is the other one. It is the only prompt here that writes
about somebody who is not the user and never agreed to be written about, so
run `npm run test:intent -- --live` and actually read the output. The guards in
`lib/intentAnalysis.ts` will catch a quote that was never said; nothing catches
a prompt that has quietly started finding manipulation in every conversation
it is given. The fixture is mixed on purpose — if a run comes back with no
positive signals in it, that is the signal.

## No output ceilings

None of these calls set `maxOutputTokens`, deliberately, and two separate
incidents are why. Gemini 2.5 Flash counts internal reasoning against the same
budget as the visible reply: a 100-token cap disabled the crisis classifier
outright, and a 1024-token cap silently truncated therapist replies while
reasoning consumed 979 of it. Both read as model quality problems for weeks.

The prompts bound the length. A token ceiling that reasoning also spends from
does not.
