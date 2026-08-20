/**
 * The voices Elena can speak with.
 *
 * These are Google's prebuilt Live API / TTS voice ids, with Google's own
 * one-word descriptor. They are ids, not characters: the therapist is always
 * Elena (prompts/elena.ts) whichever one of these is selected. That confusion
 * is exactly what went wrong before — the code introduced the companion as
 * "Despina" because that is the voice it happened to use.
 */
export type Voice = {
  /** The id sent to Google. Case-sensitive. */
  id: string;
  /** Google's descriptor for how it sounds. */
  tone: string;
};

export const VOICES: Voice[] = [
  { id: 'Despina', tone: 'Smooth' },
  { id: 'Achernar', tone: 'Soft' },
  { id: 'Aoede', tone: 'Breezy' },
  { id: 'Autonoe', tone: 'Bright' },
  { id: 'Callirrhoe', tone: 'Easy-going' },
  { id: 'Enceladus', tone: 'Breathy' },
  { id: 'Erinome', tone: 'Clear' },
  { id: 'Gacrux', tone: 'Mature' },
  { id: 'Kore', tone: 'Firm' },
  { id: 'Laomedeia', tone: 'Upbeat' },
  { id: 'Leda', tone: 'Youthful' },
  { id: 'Sulafat', tone: 'Warm' },
  { id: 'Umbriel', tone: 'Easy-going' },
  { id: 'Vindemiatrix', tone: 'Gentle' },
  { id: 'Zephyr', tone: 'Bright' },
  { id: 'Achird', tone: 'Friendly' },
  { id: 'Algenib', tone: 'Gravelly' },
  { id: 'Algieba', tone: 'Smooth' },
  { id: 'Alnilam', tone: 'Firm' },
  { id: 'Charon', tone: 'Informative' },
  { id: 'Fenrir', tone: 'Excitable' },
  { id: 'Iapetus', tone: 'Clear' },
  { id: 'Orus', tone: 'Firm' },
  { id: 'Puck', tone: 'Upbeat' },
  { id: 'Pulcherrima', tone: 'Forward' },
  { id: 'Rasalgethi', tone: 'Informative' },
  { id: 'Sadachbia', tone: 'Lively' },
  { id: 'Sadaltager', tone: 'Knowledgeable' },
  { id: 'Schedar', tone: 'Even' },
  { id: 'Zubenelgenubi', tone: 'Casual' },
];

/**
 * What a user gets before they choose. Kept as the previous hard-coded value
 * so nobody's Elena changes voice because this feature shipped.
 */
export const DEFAULT_VOICE = 'Despina';

/**
 * Guards the value on the way out of the database. A stored id that Google has
 * since retired would fail the call with an unhelpful socket close, so an
 * unknown value falls back rather than reaching the API.
 */
export function resolveVoice(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_VOICE;
  return VOICES.some((v) => v.id === stored) ? stored : DEFAULT_VOICE;
}
