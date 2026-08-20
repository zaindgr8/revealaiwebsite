/**
 * The Gemini text model, in one place.
 *
 * SINGLE SOURCE. The id was pasted into six files and a test script, so
 * "upgrade the model" meant finding all seven and getting all seven right.
 * One of them (the live-call component) was left on gemini-2.0-flash-exp long
 * after that model was shut down, and nobody noticed because nothing rendered
 * it. Import this. Do not paste the id.
 *
 * gemini-3.7-flash went generally available on 13 August 2026 and replaces
 * gemini-2.5-flash. Two things changed with the 3.x line and both matter here:
 *
 *  - temperature, topP and topK are ignored. Not rejected — ignored, silently,
 *    with no warning, and a future model will reject them with a 400. Steer
 *    determinism from the system instruction and the response schema instead.
 *    lib/crisis.ts relied on temperature: 0 for a safety classifier, so that
 *    file needs its accuracy re-measured, not just its id swapped.
 *  - thinkingBudget is gone. thinkingLevel takes 'low', 'medium' or 'high',
 *    and the default is 'medium'. Anything that used to disable thinking for
 *    latency now has to ask for 'low'.
 */
export const GEMINI_TEXT_MODEL = 'gemini-3.7-flash';

/** Current low-latency native-audio model used by /live. */
export const GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

/** Current single-speaker model used for voice previews. */
export const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';

/** REST endpoint for a single, non-streaming generation. */
export function geminiGenerateContentUrl(model: string = GEMINI_TEXT_MODEL): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}
