/**
 * Real Gemini Live smoke test.
 *
 * Provisions the same constrained ephemeral credential as /api/gemini-token,
 * opens the constrained WebSocket, sends harmless synthetic text and verifies
 * that the native-audio model returns audio. Secrets and token values are
 * deliberately never printed.
 */
import { readFileSync } from 'node:fs';
import { GEMINI_LIVE_MODEL } from '../lib/geminiModel';

function loadApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const key = /^GEMINI_API_KEY=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('GEMINI_API_KEY is missing');
  return key;
}

async function main() {
  const apiKey = loadApiKey();
  const expireTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();
  const tokenResponse = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
        bidiGenerateContentSetup: {
          model: `models/${GEMINI_LIVE_MODEL}`,
          generationConfig: { responseModalities: ['AUDIO'] },
        },
        fieldMask:
          'model,generationConfig.responseModalities',
      }),
    }
  );

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    throw new Error(
      `Ephemeral token provisioning failed: HTTP ${tokenResponse.status}: ${detail}`
    );
  }
  const issued = (await tokenResponse.json()) as { name?: unknown };
  if (typeof issued.name !== 'string' || !issued.name) {
    throw new Error('Ephemeral token response contained no token');
  }

  const url =
    'wss://generativelanguage.googleapis.com/ws/' +
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained' +
    `?access_token=${encodeURIComponent(issued.name)}`;

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    let setupComplete = false;
    let receivedAudio = false;
    let receivedTranscript = false;
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Gemini Live smoke test timed out'));
    }, 25_000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        setup: {
          model: `models/${GEMINI_LIVE_MODEL}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Despina' } },
            },
          },
          systemInstruction: {
            parts: [{ text: 'This is a synthetic QA call. Reply briefly and safely.' }],
          },
          outputAudioTranscription: {},
          sessionResumption: {},
          contextWindowCompression: { slidingWindow: {} },
        },
      }));
    });

    socket.addEventListener('message', async (event) => {
      const raw = event.data instanceof Blob ? await event.data.text() : String(event.data);
      const message = JSON.parse(raw);
      if (message.setupComplete && !setupComplete) {
        setupComplete = true;
        socket.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: 'Say only: The live call is working.' }],
            }],
            turnComplete: true,
          },
        }));
      }

      if (message.serverContent?.outputTranscription?.text) receivedTranscript = true;
      const parts = message.serverContent?.modelTurn?.parts ?? [];
      if (parts.some((part: { inlineData?: { data?: string } }) => part.inlineData?.data)) {
        receivedAudio = true;
      }

      if (message.serverContent?.turnComplete) {
        clearTimeout(timeout);
        socket.close(1000, 'complete');
        if (!setupComplete || !receivedAudio) {
          reject(new Error('Gemini completed without the expected setup/audio events'));
          return;
        }
        console.log(JSON.stringify({
          model: GEMINI_LIVE_MODEL,
          ephemeralToken: 'PASS',
          constrainedWebSocket: 'PASS',
          audioResponse: 'PASS',
          outputTranscription: receivedTranscript ? 'PASS' : 'NOT_OBSERVED',
        }, null, 2));
        resolve();
      }
    });

    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Gemini Live WebSocket error'));
    });
  });
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
