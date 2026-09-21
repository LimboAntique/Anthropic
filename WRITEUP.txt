# Does Redis help? — design note

**Live:** https://limboantique.github.io/does-redis-help/ · **Code:** https://github.com/LimboAntique/does-redis-help · **Theme 1: Exploration & Understanding** · about 3 hours, with three Claude Code agents working in parallel

## Approach, and what is novel

"Add Redis" is a reflex in system design. But a cache is three choices (how much memory, what TTL, what to do on a write), and chosen badly they leave the system no better off, or worse. I wanted to replace the reflex with a model you can drag.

Three things make it more than a calculator:

- **One unit for two knobs.** By Che's approximation, an LRU cache evicts a key once it has gone unread for a fixed *eviction age*. That puts memory and TTL in the same unit, seconds, and explains two common wastes: a TTL that eviction makes irrelevant, and memory that a short TTL leaves empty. Redis does not refresh a TTL on reads while Che's model does, so the two clocks are modelled separately and combined in closed form.
- **The honest comparison.** Not Redis versus the database, but *database only* versus *Redis + database*, because a miss pays for both. The page shows the break-even hit rate (Redis latency ÷ database latency), latency at every percentile for both setups, and the milliseconds Redis saves or costs at each one.
- **It checks itself.** An independent discrete-event simulator (a real LRU list, real timers, no shared formulas) runs in a Web Worker. Over a 64-case test grid the worst disagreement is 0.35 percentage points, and a reviewer can press a button and watch the points land on the diagonal.

## Key decisions and tradeoffs

- **Formulas for the sliders, a simulation as referee.** A formula answers in a millisecond but is an approximation; a simulation is slow but hard to argue with. Shipping both meant writing the cache twice, and it is what makes the numbers trustworthy.
- **Given versus chosen.** Inputs are split into the system you are handed and the Redis choices you make, and the dice randomises only the first. That turns a form into an exercise.
- **What I left out on purpose.** Key design, stampedes and multi-tier caches, replica lag, object-size variation. They matter in production, but they are per-system or operational; none of them changes how you choose the parameters.
- **Assumptions are stated, not hidden behind more knobs.** Stationary Zipf traffic, writes that follow read popularity, log-normal latencies, no database queueing. The write assumption drives the stale-read numbers, so the page says so. The cost metric counts latency only, not the database load Redis removes.
- **Static site, no backend, no LLM, no UI framework.** Nothing to install or keep running, at the price that everything must be computable in the browser.
- **Contract first, then parallel agents.** Types and module signatures were frozen before any logic existed, so three agents (model, simulator, UI) worked on disjoint files and merged without conflicts. The simulator agent was allowed to overrule the model; it never needed to.

## Iterations

- **The idea.** Claude's review found that one paper I cited (d-TTL) is about steering a TTL toward a target hit rate, not about staleness. It also found that my inputs could not produce my outputs: there was no database latency, and no staleness output, so the TTL had nothing to trade against.
- **The central figure** took six versions: a latency CDF; then database only versus Redis + database, with the three read paths and the break-even; then moved to the top of the page; then percentile across and milliseconds up; then a linear axis; then a separate "latency saved" chart, whose sign I flipped after I read a healthy cache as a loss.
- **Stale reads** said how often but not how bad, so I added *stale age*. Validating it showed a 13% disagreement, which turned out to be the simulator sampling synchronised TTL cycles, not an error in the model.
- **Two claims were too strong** and were corrected: "P99 only improves once misses fall below 1%" (it improves gradually, but remains a database read), and a "useless cache" preset that was in fact just above break-even.

## Learnings

- **Making the page understandable took longer than making it correct, and only I could do it.** Model, simulator and UI were merged and live in under two hours. Most of the remaining time went into calibration: which figure comes first, what goes on which axis, whether "below zero" reads as good or bad, what a tile is called. None of it was hard to build, and none of it was flagged by the AI; I found each problem by reading the page the way a newcomer would. Because the model was already validated, every "this chart looks wrong" turned out to be the picture and not the math.
- **I should have tested the core earlier.** A working page existed minutes after the contract was frozen, but I kept adding things (an exam, lessons, a second mascot) before I sat down and read the central figure with fresh eyes. Doing that first would have found the same problems sooner, and would probably have told me which extras to skip.
- **Freezing the interface first is what made parallel agents cheap.** The only later change to it was one added field.
- **Division of labour.** Claude was strongest at producing, checking, and catching my factual slips. Deciding what the page is about, that the miss penalty is the headline and what to leave out, had to come from me.
- **Scope.** The core is the model, the simulator and the first figure. The advisor, lessons, exam and mascots add delight rather than depth, and they are what I would cut first to fit two hours.
