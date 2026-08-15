/**
 * Intent Detector analysis (PRD I-5).
 *
 * D-1 was answered on 14 August 2026: observations, not percentages.
 *
 *   "we will need analysis there not percentage."
 *   "it needs to tell that at 'this' point the other person was trying to
 *    manipulate, he was maybe faking this thing."
 *
 * The second sentence is the shape of this prompt. The PRD asked only for a
 * read of the other speaker's tone and word choice; the client asked for that
 * read to be pinned to specific moments. So the model does not write an essay —
 * it points at lines and says what it noticed there.
 *
 * WHY EVERY FINDING MUST QUOTE
 *
 * Three reasons, in order of how much they matter.
 *
 * A quote is checkable. The user can go to 4:12 and hear it for themselves,
 * which is the difference between a claim and an accusation.
 *
 * A quote forces the reading to come from something that was actually said,
 * rather than from the model's general sense of the conversation.
 *
 * And a quote makes a misattribution visible. Attribution measures 98.9%
 * self-consistent, not 100%, so some lines are assigned to the wrong person. If
 * the analysis says the other person was deflecting and quotes a sentence the
 * user recognises as their own, the error is obvious on sight. Without the
 * quote, the user simply absorbs a wrong conclusion about a real person.
 *
 * WHY THE SIGNAL LIST IS CLOSED, AND WHY HALF OF IT IS POSITIVE
 *
 * I-5 says "against a rubric". An open vocabulary is not a rubric — the model
 * would invent a new label per conversation and the UI could not group or
 * colour anything.
 *
 * The positive signals are not padding. A tool that can only report guardedness
 * and pressure will report guardedness and pressure, because that is the only
 * output it has. Then it manufactures suspicion about people who did nothing,
 * which is both wrong and the version of this product that gets someone hurt.
 *
 * LANGUAGE
 *
 * This describes a real, identifiable person who never agreed to be analysed.
 * Findings describe behaviour and hedge interpretation. The client used
 * "maybe" himself; that is the register.
 */

import type { IntentScenario } from '@/lib/audioStorage';

/**
 * The closed rubric. Tone is derived from the signal in lib/intentAnalysis.ts
 * rather than asked for, so the model cannot decide how alarming its own
 * finding looks.
 */
export const INTENT_SIGNALS = [
  'evasive',
  'guarded',
  'pressure',
  'inconsistent',
  'performing',
  'engaged',
  'open',
  'warm',
] as const;

export type IntentSignal = (typeof INTENT_SIGNALS)[number];

const SIGNAL_GUIDE = `- evasive       they were asked something specific and did not answer it
- guarded       they pulled back, shortened, or changed the subject
- pressure      they pushed, hurried, or steered the conversation somewhere
- inconsistent  this does not sit with something else they said
- performing    the words sound assembled for effect rather than meant
- engaged       they leaned in, followed up, wanted more of this
- open          they volunteered something they did not have to
- warm          they were generous, attentive, or kind here`;

const RUBRICS: Record<IntentScenario, string> = {
  date: `This was a date.

What is worth noticing:
- whether their interest is in the conversation or in being polite
- whether they gave anything of themselves back, or only received
- whether enthusiasm in the words matches enthusiasm in how it was said
- whether they steered away from anything, and what
- moments where they were genuinely present, which matter as much as the rest`,

  interview: `This was an interview.

What is worth noticing:
- claims that stayed general when a specific answer was available
- direct questions that came back answered sideways
- urgency or pressure about a decision, a timeline, or an offer
- whether their account of things held together across the conversation
- moments of real substance, which are the point of the exercise`,

  general: `This was a general conversation.

What is worth noticing:
- whether they were straight with the other person
- attempts to steer, hurry, or lean on them
- anything that does not sit with something else they said
- where they closed down, and around what
- where they were genuinely open, which is equally worth knowing`,
};

/**
 * @param scenario   which rubric to apply (I-3)
 * @param themLabel  the name the user gave the other speaker (I-9), or "they"
 */
export function intentAnalysisPrompt(scenario: IntentScenario, themLabel: string): string {
  return `You are reading a transcript of a real conversation for one of the two people in it. Your job is to tell them what you noticed about the OTHER person.

${RUBRICS[scenario]}

The transcript is numbered. Each line is marked YOU (the person you are writing for) or ${themLabel.toUpperCase()} (the other person).

Return JSON only, matching this shape exactly:

{
  "overall": "<2 to 4 sentences on how the other person came across across the whole conversation. Written to the user, second person, about the other person. Specific to THIS conversation.>",
  "moments": [
    {
      "ref": <the [n] of a ${themLabel.toUpperCase()} line>,
      "quote": "<a short phrase copied EXACTLY from that line, 3 to 20 words>",
      "signal": "<one of: ${INTENT_SIGNALS.join(', ')}>",
      "observation": "<one sentence. What they did here. Describe it plainly, as something a person listening back would agree happened.>",
      "reading": "<one sentence. What it might mean. Hedged — this is a possibility you are offering, not a fact you established.>"
    }
  ]
}

Signals:
${SIGNAL_GUIDE}

Rules:
- Only ever comment on ${themLabel.toUpperCase()} lines. Never analyse a YOU line. If a YOU line seems out of place, ignore it.
- Every quote must be copied character for character from the line you reference. Do not paraphrase, tidy, or complete it.
- Between 3 and 8 moments. Pick the ones that are actually worth someone's time — fewer good ones beat more thin ones.
- Never make the same point twice. If a pattern repeats across the conversation, give it ONE moment at its clearest instance and say in that moment's reading that it recurred. Six findings that all say the same thing about a person tell the reader less than one finding does, not more.
- If the conversation was ordinary and nothing stood out, return an empty moments array and say so plainly in overall. That is a real and acceptable answer.
- If this is not a spontaneous conversation — someone reading aloud, reciting, presenting prepared material, or performing a script — then the words are the author's and not the speaker's, and there is nothing about the speaker to read. Say that plainly in overall and return an empty moments array. Do not describe the content of what was read as though it revealed their character.
- Include the positive signals when they are there. A conversation where someone was open and warm should read that way.
- No percentages, no scores, no ratings, no confidence numbers anywhere.
- Describe behaviour, not character. What they did in this conversation, not what kind of person they are.
- Hedge every reading. "may have", "could be", "it is possible that", "reads like".
- No diagnosis and no claims about their mental state as established fact.
- You are looking at a transcript. You cannot hear tone of voice, and you did not see their face. Where a reading depends on something you cannot actually observe, say less.`;
}
