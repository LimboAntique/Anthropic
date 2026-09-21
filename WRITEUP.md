# Does Redis help? — design note

**Live:** https://limboantique.github.io/does-redis-help/ · **Code:** https://github.com/LimboAntique/does-redis-help · **Theme 1: Exploration & Understanding** · about 3 hours, with three Claude Code agents working in parallel

## Approach, and what is novel

"Add Redis" is a reflex in system design, but a cache is really three choices: memory, TTL and what to do on a write. Chosen badly, they buy nothing or make the system worse. I wanted a page that replaces the reflex with a model you can drag.

Three things make it more than a calculator:

- **One unit for two knobs.** Che's approximation says an LRU cache evicts a key once it has gone unread for a fixed *eviction age*. That puts memory and TTL in the same unit, seconds, and explains both classic wastes: a TTL the eviction age makes irrelevant, and memory a short TTL leaves empty. Redis does not refresh a TTL on reads while Che's model does, so I model the two clocks separately and combine them in closed form.
- **The honest comparison.** Not Redis versus the database, but *database only* versus *Redis + database*: a miss pays for both. The page shows the break-even hit rate (Redis latency ÷ database latency), latency at every percentile for both setups, and the milliseconds Redis saves or costs at each one.
- **It checks itself.** An independent discrete-event simulator (a real LRU list, real timers, no shared formulas) runs in a Web Worker. The worst disagreement over a 64-case grid is 0.35 percentage points, and a reviewer can press a button and watch the points land on the diagonal.

## Key decisions and tradeoffs

- **Closed form for the sliders, simulation as referee.** A formula answers in a millisecond but is an approximation; a simulation is slow but unarguable. Shipping both cost a second implementation and bought trust.
- **Given versus chosen.** Inputs are split into the system you are handed and the Redis choices you make; the dice randomises only the first. It turns a form into an exercise.
- **Static site, no backend, no LLM, no UI framework.** Opens instantly and cannot break for a reviewer. The price is that everything must be computable in the browser.
- **Stated assumptions rather than more knobs.** Stationary Zipf traffic, writes that follow read popularity, log-normal latencies, no database queueing. The write assumption drives the stale-read numbers, so it is stated on the page. The cost metric counts latency only, not database offload.
- **Contract first, then parallel agents.** Types and module signatures were frozen before any logic existed, so three agents (model, simulator, UI) worked on disjoint files with no merge conflicts. The simulator agent had authority to overrule the model; it never needed to.

## Iterations

- **The idea.** Claude's review found that one paper I cited (d-TTL) is about adapting TTLs to a target hit rate, not about staleness, and that my inputs could not produce my outputs: no database latency, and no staleness output, so the TTL had nothing to trade against.
- **The central figure** went through six versions: a latency CDF; relabelled as database only versus Redis + database with the three read paths and the break-even; moved to the top; axes flipped so percentile runs across and milliseconds run up; log axis to linear; then a separate difference chart, whose sign I flipped after reading a healthy cache as "all negative".
- **Stale reads** said how often but not how bad, so I added *stale age*. Validating it showed a 13% disagreement that turned out to be the simulator sampling synchronised TTL cycles, not the model.
- **Two claims were too strong** and were corrected: "P99 only improves below 1% misses" (it improves gradually, but stays a database read), and a "cache is useless" preset that was in fact slightly above break-even.
- **Housekeeping:** a wall-clock assertion that failed only on CI, and a mascot set cut from nine drawings to one consistent style.

## Learnings

- Nearly every real bug was in the **picture, not the math**. Because the model was validated, "this chart looks wrong" could be settled quickly, and each time the fix was an axis, a sign or a label. Conventions (up and green means better) mattered more than precision.
- **Calibrating the UI is where the time went, and I should have started it earlier.** The framework (contract, model, simulator, a working page) was done in about two hours. Most of what followed was adjusting the interface so that a person could actually understand it: which figure comes first, what goes on which axis, whether "below zero" reads as good or bad, what a tile should be called. None of it was hard to implement and the AI could not tell me it was needed; I only found each problem by looking at the page as a reader would. That is the part of the work AI currently replaces least. The lesson is about ordering: I reviewed the page after the three tracks were merged, but the agents had a clickable page against stub data within the first half hour. Looking at it then would have surfaced the same problems while they were cheaper to fix.
- **Freezing the interface first** is what made parallel agents cheap; the one later addition to it was additive.
- Claude was strongest at producing, checking and catching my factual slips. **Deciding what the page is about** (the miss penalty as the headline, what to leave out) had to come from me.
- On **scope**: the core is the model, the simulator and the first figure. The advisor, lessons, exam and mascots are delight rather than depth, and they are what I would cut first to fit two hours.
