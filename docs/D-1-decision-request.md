# D-1 — percentages or observations

Send today. Scope froze 12 August, and this is the one open question that stops
work rather than slowing it.

The PRD already asked this and recommended observations. Asking the same way
again will get the same silence, so this version leads with evidence that did
not exist on 5 August: the system has now been measured, and it disagrees with
itself between runs.

---

## The message

> I need your answer on D-1 today — percentages or observations.
>
> I am not asking again for the sake of it. I have something now that I did not
> have when I wrote the PRD.
>
> I took one recording and ran it through the system five times. Same file, same
> settings, nothing changed between runs. It came back with a different number
> of speakers each time, and took anywhere from 99 seconds to 273 seconds to do
> it.
>
> That is the answer to your question, and it is why I recommend observations.
>
> If we show "Genuine Interest 92%", a user will run the same conversation twice
> — people do, it is the first thing anyone tries — and get 92% one time and 85%
> the next. At that point they stop believing the number, and then they stop
> believing everything else on the screen with it. A percentage is a promise of
> precision, and the analysis underneath is a judgement, not a measurement.
>
> An observation does not make that promise. "He gave short answers whenever
> work came up" is either recognisable or it is not, and if the wording shifts
> slightly between runs nobody minds, because nobody expected a sentence to be
> identical twice.
>
> I know percentages look stronger, and I know the site already shows them. Two
> things worth knowing about that:
>
> The 92% on the site is not a measurement. It is a number typed into the page
> when it was designed. Nothing produced it.
>
> And the previous developer had already built the percentage version into the
> database — columns for genuine, deceptive, manipulative, warmth, sincerity,
> dominance and engagement. They were never written to. I removed them, because
> shipping a schema that answers this question before you have is how it gets
> built twice.
>
> So the decision is genuinely open, and it is yours. I recommend observations.
> If you want percentages I will build them and say nothing more about it — but
> I need to know today.
>
> Why today: the analysis layer is the last unbuilt piece of the Intent
> Detector, and the choice changes what gets stored, not just what gets
> displayed. I cannot build one and convert it to the other later without
> redoing it. Demo 5 on the 20th is the full flow, start to finish, ending in a
> result. There is currently no result to show.

---

## If they ask for both

Reasonable question, and the answer is no — not because it is hard, but because
a percentage next to an observation is still a percentage, and it will be the
thing users read. The trust problem arrives unchanged.

If they push, the honest compromise is a confidence band rather than a point
number: "mostly guarded" instead of "78% guarded". It admits the imprecision
that the measurements show is real, while keeping the shape they want.

## If they do not answer today

Say the date moves, and by how much, before agreeing to anything. That is the
ground rule already in the demo plan, and this is the first time it has been
load-bearing.

One working day of delay is one day off the end. Delivery is 26 August, I-5 is
roughly a day of work once the answer lands, and it needs testing time behind
it.
