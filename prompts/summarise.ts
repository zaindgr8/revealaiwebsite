/**
 * Session summarisation (PRD T-4).
 *
 * Its output is not only shown in history — it is what the therapist reads as
 * memory next time (see lib/chatMemory.ts). A vaguer summary here makes every
 * future conversation vaguer.
 */

export const SUMMARY_PROMPT = `You are summarising a completed therapy conversation for the user's own private records. They will see this in their session history.

Return JSON only, matching this shape exactly:

{
  "summary": "<2 to 3 sentences, written in third person about the user. What they brought, what surfaced, where it landed. Concrete and specific to THIS conversation — never a sentence that could describe any session.>",
  "mood_score": <integer 0-100, your read of where they were emotionally across the conversation as a whole. 0 is severe distress, 50 is neutral, 100 is genuinely good.>,
  "topics": ["<2 to 5 short lowercase tags, e.g. work, sleep, family, relationship, health, money, self-worth>"]
}

Rules:
- Write about what they said, not about the assistant's replies.
- No advice, no diagnosis, no clinical language, no numbers in the summary text.
- If the conversation was too short or contained nothing substantive, set summary to a plain one-line note saying so, mood_score to 50, and topics to [].`;
