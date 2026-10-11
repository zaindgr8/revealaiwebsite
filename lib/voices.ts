/**
 * The voices Freya can speak with.
 *
 * These are Google's prebuilt Live API / TTS voice ids, with Google's own
 * one-word descriptor. They are ids, not characters: the therapist is always
 * Freya (prompts/elena.ts) whichever one of these is selected. That confusion
 * is exactly what went wrong before — the code introduced the companion as
 * "Despina" because that is the voice it happened to use.
 */
export type Voice = {
  /** The id sent to Google. Case-sensitive. Never shown to the user. */
  id: string;
  /** The human name the user sees when choosing a voice. */
  name: string;
  /** Google's descriptor for how it sounds. */
  tone: string;
};

export const VOICES: Voice[] = [
  { id: 'Despina', name: 'Freya', tone: 'Smooth' },
  { id: 'Achernar', name: 'Clara', tone: 'Soft' },
  { id: 'Aoede', name: 'Maya', tone: 'Breezy' },
  { id: 'Autonoe', name: 'Sophie', tone: 'Bright' },
  { id: 'Callirrhoe', name: 'Nora', tone: 'Easy-going' },
  { id: 'Enceladus', name: 'Elliot', tone: 'Breathy' },
  { id: 'Erinome', name: 'Hannah', tone: 'Clear' },
  { id: 'Gacrux', name: 'Margaret', tone: 'Mature' },
  { id: 'Kore', name: 'Rachel', tone: 'Firm' },
  { id: 'Laomedeia', name: 'Lily', tone: 'Upbeat' },
  { id: 'Leda', name: 'Zoe', tone: 'Youthful' },
  { id: 'Sulafat', name: 'Amelia', tone: 'Warm' },
  { id: 'Umbriel', name: 'Oliver', tone: 'Easy-going' },
  { id: 'Vindemiatrix', name: 'Grace', tone: 'Gentle' },
  { id: 'Zephyr', name: 'Isla', tone: 'Bright' },
  { id: 'Achird', name: 'Daniel', tone: 'Friendly' },
  { id: 'Algenib', name: 'Marcus', tone: 'Gravelly' },
  { id: 'Algieba', name: 'Julian', tone: 'Smooth' },
  { id: 'Alnilam', name: 'Thomas', tone: 'Firm' },
  { id: 'Charon', name: 'Henry', tone: 'Informative' },
  { id: 'Fenrir', name: 'Leo', tone: 'Excitable' },
  { id: 'Iapetus', name: 'Samuel', tone: 'Clear' },
  { id: 'Orus', name: 'Arthur', tone: 'Firm' },
  { id: 'Puck', name: 'Jamie', tone: 'Upbeat' },
  { id: 'Pulcherrima', name: 'Ava', tone: 'Forward' },
  { id: 'Rasalgethi', name: 'Edward', tone: 'Informative' },
  { id: 'Sadachbia', name: 'Noah', tone: 'Lively' },
  { id: 'Sadaltager', name: 'William', tone: 'Knowledgeable' },
  { id: 'Schedar', name: 'Adam', tone: 'Even' },
  { id: 'Zubenelgenubi', name: 'Sam', tone: 'Casual' },
];

/**
 * What a user gets before they choose. Kept as the previous hard-coded value
 * so nobody's Freya changes voice because this feature shipped.
 */
export const DEFAULT_VOICE = 'Despina';

/**
 * Guards the value on the way out of the database. A stored id that Google has
 * since retired would fail the call with an unhelpful socket close, so an
 * unknown value falls back rather than reaching the API.
 */
/** The human name for a stored voice id, for display. */
export function voiceName(id: string): string {
  return VOICES.find((v) => v.id === id)?.name ?? 'Freya';
}

export function resolveVoice(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_VOICE;
  return VOICES.some((v) => v.id === stored) ? stored : DEFAULT_VOICE;
}
