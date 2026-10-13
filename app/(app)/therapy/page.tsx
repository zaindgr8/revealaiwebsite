import { redirect } from 'next/navigation';

/**
 * Reflect (the recorded voice check-in) is retired. Its results — mood score,
 * Breakdown, Heart-to-Heart Reflection, Recommendations, Today's Action — now
 * follow every live call on /live. Old links and bookmarks land there.
 */
export default function TherapyPage() {
  redirect('/live');
}
