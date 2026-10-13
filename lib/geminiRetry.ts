import { geminiGenerateContentUrl } from './geminiModel';

/**
 * generateContent that survives Gemini having a bad minute.
 *
 * Seen in practice while building /live's analysis: the primary model
 * answering 503 "high demand", then 404 for a model that exists, then 200,
 * within seconds of each other — and one request that sent no headers for
 * five minutes. A post-call analysis lost to that costs the user the results
 * of a conversation they cannot repeat. So:
 *
 *  - every attempt has a deadline, so a hung request fails instead of
 *    outliving the route;
 *  - a transient failure (429, 404, 5xx, timeout, network) is retried once on
 *    the same model, then once on a stable fallback model;
 *  - the caller learns which model answered, so a stored result says what
 *    actually produced it.
 *
 * A 400 is not retried: that is our request, and another model will reject it
 * the same way.
 */

/** Generally available, accepts audio and responseJsonSchema. */
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';

const TRANSIENT = new Set([404, 408, 429, 500, 502, 503, 504]);

export class GeminiUnavailableError extends Error {}

type Attempt = { model: string; delayMs: number };

export async function generateWithFallback(
  apiKey: string,
  primaryModel: string,
  body: Record<string, unknown>,
  { timeoutMs = 45_000 }: { timeoutMs?: number } = {}
): Promise<{ json: Record<string, unknown>; model: string }> {
  const attempts: Attempt[] = [
    { model: primaryModel, delayMs: 0 },
    { model: primaryModel, delayMs: 1200 },
    ...(primaryModel !== GEMINI_FALLBACK_MODEL ? [{ model: GEMINI_FALLBACK_MODEL, delayMs: 0 }] : []),
  ];

  let lastError = 'no attempt made';
  for (const { model, delayMs } of attempts) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));

    // thinkingLevel is a 3.x setting; 2.5 rejects it with a 400.
    const requestBody =
      model === GEMINI_FALLBACK_MODEL ? withoutThinkingLevel(body) : body;

    try {
      const res = await fetch(`${geminiGenerateContentUrl(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { json: await res.json(), model };

      const text = await res.text().catch(() => res.statusText);
      lastError = `${model} ${res.status}: ${text.slice(0, 300)}`;
      if (!TRANSIENT.has(res.status)) throw new Error(`Gemini API error ${lastError}`);
      console.warn(`[gemini] transient failure, trying again — ${lastError}`);
    } catch (err) {
      if ((err as Error).message.startsWith('Gemini API error')) throw err;
      lastError = `${model}: ${(err as Error).name} ${(err as Error).message}`;
      console.warn(`[gemini] request failed, trying again — ${lastError}`);
    }
  }
  throw new GeminiUnavailableError(`Gemini unavailable after retries — ${lastError}`);
}

function withoutThinkingLevel(body: Record<string, unknown>): Record<string, unknown> {
  const config = body.generationConfig as Record<string, unknown> | undefined;
  if (!config?.thinkingConfig) return body;
  const { thinkingConfig, ...rest } = config;
  void thinkingConfig;
  return { ...body, generationConfig: rest };
}

/** The first candidate's text, as the routes all read it. */
export function candidateText(json: Record<string, unknown>): string {
  const candidates = json.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
  return candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text ?? '';
}
