import * as Plot from '@observablehq/plot'
import { DEFAULTS, INPUTS, randomSystem } from '../contract/inputs'
import type { InputSpec, Params, SimResult } from '../contract/types'
import { advise } from '../engine/advisor'
import { byRank, curves, evaluate, meanLatency } from '../engine/model'
import { PRESETS } from '../engine/presets'
import { scaleForSim } from '../engine/sim'
import './style.css'

const STEPS = 1000 // slider resolution
const SIM_REQUESTS = 4e6 // requests replayed per simulation run
const CHOICE = 'var(--choice)'
const MUTED = 'var(--muted)'
// Labelled through the axis text channel because log scales hide tick labels that are not powers of ten
const TTL_TICKS = [1, 60, 3600, 86400, 2592000]

const FACES = import.meta.glob('../../cat_teacher/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const $ = (id: string) => document.getElementById(id)!
let P: Params = structuredClone(DEFAULTS)
const group = (s: InputSpec) => (s.group === 'system' ? P.sys : P.redis) as unknown as Record<string, number>

// Formatters
const si = (v: number) => (v === Infinity ? '∞' : Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(v))
const pct = (v: number) => (v * 100).toFixed(v < 0.1 ? 2 : 1) + '%'
const ms = (v: number) => si(v) + ' ms'
const dur = (s: number) => (s === Infinity ? '∞' : s < 60 ? si(s) + ' s' : s < 3600 ? si(s / 60) + ' min' : s < 86400 ? si(s / 3600) + ' h' : si(s / 86400) + ' d')
const bytes = (b: number) => {
  const i = Math.min(4, Math.floor(Math.log10(Math.max(b, 1)) / 3))
  return `${+(b / 1e3 ** i).toPrecision(3)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`
}
const show = (s: InputSpec, v: number) =>
  s.key === 'availability' ? +(v * 100).toFixed(4) + '%' : s.key === 'ttlSec' ? dur(v) : s.key === 'objBytes' ? bytes(v) : s.key === 'memGB' ? bytes(v * 1e9) : `${si(v)} ${s.unit}`

// Plain-language explanation behind every "!" mark, keyed by input key, tile title or data-help attribute
const HELP: Record<string, string> = {
  system: 'The application you are designing for: its data, its traffic and its database. Treat it as given; the dice draws a new one to practise on.',
  redis: 'The decisions you make when you add Redis. Change these and watch whether the cache actually helps.',
  advisor: 'Every remark the rule-based advisor has about your current Redis choices, most serious first. ✗ is a problem, △ is worth a look, ✓ is fine.',
  keys: 'How many different items the application can ask for, for example one per user or per product.',
  objBytes: 'Size of one cached value. Keys × size is the dataset: the memory you would need to cache everything.',
  alpha: 'How unevenly popular the keys are. 0 means every key is equally likely, so caching barely helps. Around 1 is typical web traffic. At 2 a handful of keys get almost all the reads.',
  rps: 'Read requests per second, summed over all keys.',
  wps: 'Updates per second. Writes go to the same popular keys as reads, and every write makes the cached copy out of date.',
  dbP50Ms: 'Median time the database needs for one read: half of all reads are faster than this.',
  dbP99Ms: 'The slow tail of the database: 1 read in 100 takes longer than this.',
  dbCapacityQps: 'The most queries per second the database can serve before it is overloaded.',
  memGB: 'How much RAM you buy for Redis. When it is full, the least recently used key is evicted to make room.',
  ttlSec: 'Time to live: how long a cached value is kept before it is dropped and read from the database again. Longer means more hits but older data. The last slider step is ∞, never expire.',
  writePolicy: 'What happens to the cached copy when the value changes in the database. Do nothing: readers can get the old value until the TTL runs out. Delete: no stale reads, but the next read is a miss.',
  pricePerGBMonth: 'Cost of one GB of Redis memory per month. The default is roughly AWS ElastiCache.',
  availability: 'Share of the time Redis is reachable. 99.9% is about 43 minutes of downtime a month, during which every read waits for the timeout and then goes to the database.',
  p50Ms: 'Median Redis response time including the network: half of all lookups are faster than this.',
  p99Ms: 'The slow tail of Redis: 1 lookup in 100 takes longer than this.',
  timeoutMs: 'How long the application waits for Redis before giving up and asking the database. It is only paid while Redis is down.',
  'Hit rate': 'Share of reads answered by Redis without touching the database. The rest are misses, which pay for Redis and the database.',
  'Stale reads': 'Share of reads that return an old value, because the key was updated in the database after it was cached.',
  'P50 latency': 'The typical read: half of all reads finish faster than this. Compare it with the database-only figure underneath.',
  'P99 latency': 'The slow tail: 1 read in 100 is slower than this. While more than 1% of reads miss, the slowest 1% are all misses, and a miss costs Redis plus a database read.',
  'Cost per ms saved': 'Value for money: the monthly Redis bill divided by the milliseconds it takes off the average read (database only minus Redis + database). Lower is better. The second figure is the same ratio for the next doubling of memory: when it is much higher than the first, you are past the point where more memory pays. If Redis makes the average read slower there is nothing to divide by, and you are paying for a slowdown.',
  'DB load': 'Traffic that reaches the database, as a share of its capacity. 100% or more is overload. Redis down is what the database sees when the cache fails and every read falls through.',
  'Memory used': 'Memory actually occupied in steady state. If it is far below what you bought, the TTL empties the cache before it fills and you pay for idle RAM.',
  'Eviction age': 'How long an untouched key survives before memory pressure pushes it out. It works like a hidden TTL: whichever is shorter, this or your TTL, decides what stays cached.',
  chartMem: 'How the miss rate would change if you bought more or less memory with everything else fixed. The dot is your current choice and the top axis is the monthly cost. The dashed line is a perfect cache that always holds the hottest keys. Where the curve is flat, more memory buys nothing.',
  chartTtl: 'How misses (solid) and stale reads (dotted) change with the TTL. The vertical lines mark your TTL and the eviction age. Right of the eviction age a longer TTL no longer removes misses, it only adds stale reads.',
  chartRank: 'Keys lined up from the most popular (left) to the least. Orange is the chance that a read of that key is a hit. Grey is the share of all reads that go to keys up to that rank, so you can see how much traffic the well-cached keys carry. The green line is where a perfect cache, one that pins the hottest keys as ideal LFU would, runs out of memory: it would hit 100% to the left and 0% to the right. LRU fades out instead, because it also spends slots on cold keys that were read a moment ago. A short TTL pulls the whole orange curve down, even for the hottest keys.',
  chartCdf: 'Grey is every read going straight to the database. Orange is the same traffic with Redis in front: a hit is answered by Redis alone, but a miss pays for Redis and then the database, so it is slower than having no cache. Read across at any height: where orange is left of grey that share of reads got faster, where it is right of grey they got slower. The dashed line is the hit rate, where the orange curve switches from hits to misses. The table reads off four heights.',
  chartParity: 'A check that the formulas can be trusted. The button replays a scaled-down copy of your workload through a real LRU + TTL cache, for your settings and eight variations. Each point compares the predicted value (x) with the measured one (y); points on the diagonal agree.',
}
const info = (key: string) => `<span class="info" role="img" aria-label="${HELP[key]}" data-tip="${HELP[key]}">!</span>`
for (const el of document.querySelectorAll<HTMLElement>('[data-help]')) el.outerHTML = info(el.dataset.help!)

// Slider position t in 0..1 to value: availability is linear in its number of nines, a log slider with min 0 snaps to 0 at the left end
function toValue(s: InputSpec, t: number): number {
  if (s.key === 'availability') return t >= 1 ? 1 : 1 - 10 ** -(1 + 4 * t)
  if (t > 1) return Infinity
  if (!s.log) return +(s.min + t * (s.max - s.min)).toPrecision(3)
  const lo = s.min || 0.1
  return s.min === 0 && t === 0 ? 0 : +(lo * (s.max / lo) ** t).toPrecision(3)
}
function toPos(s: InputSpec, v: number): number {
  if (s.key === 'availability') return v >= 1 ? 1 : (-Math.log10(1 - v) - 1) / 4
  if (v === Infinity) return 2
  if (!s.log) return (v - s.min) / (s.max - s.min)
  const lo = s.min || 0.1
  return v <= 0 ? 0 : Math.log(v / lo) / Math.log(s.max / lo)
}

// Builds one slider per InputSpec inside its group's card; the TTL slider gets one extra step meaning "no TTL"
const sliders = INPUTS.map((s) => {
  const label = document.createElement('label')
  label.innerHTML = `<span>${s.label}${info(s.key)}</span><output></output><input type="range" min="0" max="${STEPS + +(s.key === 'ttlSec')}">`
  const input = label.querySelector('input')!
  input.oninput = () => {
    group(s)[s.key] = toValue(s, +input.value / STEPS)
    $('blurb').textContent = ''
    update()
  }
  $(s.group).append(label)
  return { s, input, out: label.querySelector('output')! }
})

const policy = document.createElement('label')
policy.innerHTML = `<span>On write${info('writePolicy')}</span><select><option value="ttl-only">Do nothing, wait for the TTL</option><option value="invalidate">Delete the cached key</option></select>`
const policySelect = policy.querySelector('select')!
policySelect.onchange = () => {
  P.redis.writePolicy = policySelect.value as Params['redis']['writePolicy']
  update()
}
sliders.find((x) => x.s.key === 'ttlSec')!.input.parentElement!.after(policy)

$('dice').onclick = () => {
  P.sys = Object.fromEntries(Object.entries(randomSystem()).map(([k, v]) => [k, +v.toPrecision(3)])) as unknown as Params['sys']
  $('blurb').textContent = ''
  update()
}

for (const preset of PRESETS) {
  const b = document.createElement('button')
  b.textContent = preset.name
  b.onclick = () => {
    P = structuredClone(preset.params)
    update()
    $('blurb').textContent = preset.blurb
  }
  $('presets').append(b)
}

// "Try it" buttons inside the lessons load the preset of the same name and return to the verdict
for (const b of document.querySelectorAll<HTMLElement>('[data-preset]'))
  b.onclick = () => {
    ;([...$('presets').children] as HTMLElement[]).find((x) => x.textContent === b.dataset.preset)!.click()
    scrollTo({ top: 0, behavior: 'smooth' })
  }

// Enforces P99 >= P50, writes the state back into every control and schedules one render per frame
let frame = 0
function update() {
  P.sys.dbP99Ms = Math.max(P.sys.dbP99Ms, P.sys.dbP50Ms)
  P.redis.p99Ms = Math.max(P.redis.p99Ms, P.redis.p50Ms)
  for (const { s, input, out } of sliders) {
    input.value = String(Math.round(toPos(s, group(s)[s.key]) * STEPS))
    out.textContent = show(s, group(s)[s.key])
  }
  policySelect.value = P.redis.writePolicy
  $('dataset').textContent = `Dataset: ${bytes(P.sys.keys * P.sys.objBytes)}`
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(render)
}

// Replaces the content of a chart container with a plot sized to it
function draw(id: string, options: Plot.PlotOptions) {
  const el = $(id)
  el.replaceChildren(Plot.plot({ width: el.clientWidth, height: 240, marginLeft: 44, grid: true, style: { background: 'none', overflow: 'visible' }, ...options }))
}

function render() {
  const o = evaluate(P)
  const c = curves(P)
  const { sys, redis } = P
  const advice = advise(P, o)
  const head = advice[0] ?? { level: 'warn', title: `Redis serves ${pct(1 - o.missRate)} of reads`, detail: `P99 goes from ${ms(o.baseline.p99)} to ${ms(o.latency.p99)}.` }
  $('verdict').className = head.level
  const chosen = (text: string) => `<span class="choice">${text}</span>`
  const ttl = redis.ttlSec === Infinity ? chosen('no TTL') : `a ${chosen(dur(redis.ttlSec))} TTL`
  $('verdict').innerHTML = `<b>${head.title}</b> with ${chosen(bytes(redis.memGB * 1e9))} and ${ttl}<p>${head.detail.replace(`${redis.memGB} GB`, chosen)}</p>`
  $('advice').innerHTML = advice.map((a) => `<li class="${a.level}"><b>${a.title}</b><br>${a.detail}</li>`).join('') || '<li>No remarks.</li>'

  // The mascot grades the configuration: surprised by an overloadable database, otherwise by how many remarks are not praise
  const flaws = advice.filter((x) => x.level !== 'good').length
  const face = Math.max(o.dbLoad.withCache, o.dbLoad.redisDown) >= 1 ? 'face_surprised' : head.level === 'bad' ? 'face_stern' : flaws > 1 ? 'face_thinking' : flaws ? 'face_happy' : 'face_full_marks'
  ;($('amber') as HTMLImageElement).src = FACES[`../../cat_teacher/${face}.svg`]

  const load = (u: number) => pct(u) + (u >= 1 ? ' ⚠ overload' : '')
  // Value for money: monthly bill per millisecond taken off the average read, now and for the next doubling of memory
  const mean = meanLatency(P, o.missRate)
  const saved = mean.db - mean.withCache
  const twice = { sys, redis: { ...redis, memGB: redis.memGB * 2 } }
  const extra = mean.withCache - meanLatency(twice, evaluate(twice).missRate).withCache
  const next = extra > saved / 1000 ? `2× memory: $${si(o.costPerMonth / extra)} per extra ms` : '2× memory buys nothing more'
  const tiles = [
    ['Hit rate', pct(1 - o.missRate), `miss ${pct(o.missRate)}`],
    ['Stale reads', pct(o.staleRate), redis.writePolicy === 'invalidate' ? 'writes delete the key' : 'of all reads'],
    ['P50 latency', ms(o.latency.p50), `${ms(o.baseline.p50)} without Redis`],
    ['P99 latency', ms(o.latency.p99), `${ms(o.baseline.p99)} without Redis`],
    ['Cost per ms saved', saved > 0 ? `$${si(o.costPerMonth / saved)}` : '⚠ slower', saved > 0 ? `avg read ${ms(mean.db)} → ${ms(mean.withCache)} · ${next}` : `$${si(o.costPerMonth)}/month to make the average read ${ms(-saved)} slower`],
    ['DB load', load(o.dbLoad.withCache), `no cache ${load(o.dbLoad.noCache)} · Redis down ${load(o.dbLoad.redisDown)}`],
    ['Memory used', bytes(o.memUsedGB * 1e9), `of ${bytes(redis.memGB * 1e9)} · $${si(o.costPerMonth)}/month`],
    ['Eviction age', dur(o.evictionAgeSec), o.evictionAgeSec === Infinity ? 'memory never fills, only the TTL removes keys' : o.binding === 'ttl' ? 'TTL expires keys before LRU evicts them' : 'LRU evicts keys before the TTL fires'],
  ]
  $('tiles').innerHTML = tiles.map(([k, v, sub]) => `<div class="card${v.includes('⚠') ? ' bad' : ''}"><small>${k}${info(k)}</small><strong>${v}</strong><small>${sub}</small></div>`).join('')

  draw('chart-mem', {
    marginTop: 34,
    x: { type: 'log' },
    y: { label: 'Miss rate (%)', percent: true, domain: [0, 100] },
    marks: [
      Plot.axisX({ anchor: 'top', label: 'Cost ($/month)', tickFormat: (d: number) => '$' + si(d * redis.pricePerGBMonth) }),
      Plot.axisX({ label: 'Redis memory (GB)', tickFormat: si }),
      Plot.lineY(c.missVsMem, { x: 'memGB', y: 'ideal', stroke: 'var(--good)', strokeWidth: 2, strokeDasharray: '4 3' }),
      Plot.lineY(c.missVsMem, { x: 'memGB', y: 'miss', stroke: CHOICE, strokeWidth: 2, tip: true }),
      Plot.dot([{ memGB: redis.memGB, miss: o.missRate }], { x: 'memGB', y: 'miss', r: 5, fill: CHOICE, stroke: 'var(--ink)', strokeWidth: 1.5 }),
    ],
  })

  const marks = [
    { x: redis.ttlSec, text: 'your TTL' },
    { x: o.evictionAgeSec, text: 'eviction age' },
  ].filter((m) => m.x >= 1 && m.x <= 2592000)
  draw('chart-ttl', {
    x: { type: 'log' },
    y: { label: 'Share of reads (%)', percent: true, domain: [0, 100] },
    marks: [
      Plot.axisX(TTL_TICKS, { label: 'TTL', text: dur }),
      Plot.ruleX(marks, { x: 'x', strokeDasharray: '2 3' }),
      ...marks.map((m, i) => Plot.text([m], { x: 'x', text: 'text', frameAnchor: 'top', dy: i ? 8 : -10, stroke: 'var(--paper)', fill: 'var(--ink)' })),
      Plot.lineY(c.vsTtl, { x: 'ttlSec', y: 'stale', stroke: CHOICE, strokeWidth: 2, strokeDasharray: '2 4' }),
      Plot.lineY(c.vsTtl, { x: 'ttlSec', y: 'miss', stroke: CHOICE, strokeWidth: 2, tip: true }),
    ],
  })

  // Keys from hottest to coldest: LRU fades out gradually where an ideal cache would cut off sharply at its capacity
  const ranks = byRank(P)
  draw('chart-rank', {
    x: { type: 'log', label: 'Key rank (1 = hottest)', tickFormat: si },
    y: { label: 'Share (%)', percent: true, domain: [0, 100] },
    marks: [
      Plot.ruleX([ranks.capacity], { stroke: 'var(--good)', strokeWidth: 2, strokeDasharray: '4 3' }),
      Plot.lineY(ranks.points, { x: 'rank', y: 'traffic', stroke: MUTED, strokeWidth: 2 }),
      Plot.lineY(ranks.points, { x: 'rank', y: 'hit', stroke: CHOICE, strokeWidth: 2, tip: true }),
    ],
  })

  // Three paths a read can take; a miss pays Redis and then the database, which is what makes a poor hit rate a net loss
  const hit = 1 - o.missRate
  const loss = hit < mean.breakEvenHit
  $('paths').innerHTML =
    `<b>Hit</b> ${pct(hit * redis.availability)}: Redis only, ${ms(redis.p50Ms)}. ` +
    `<b class="worse">Miss</b> ${pct(o.missRate * redis.availability)}: Redis, then the database, ${ms(redis.p50Ms)} + ${ms(sys.dbP50Ms)}, slower than having no cache. ` +
    (redis.availability < 1 ? `<b class="worse">Redis down</b> ${pct(1 - redis.availability)}: timeout, then the database, ${ms(redis.timeoutMs)} + ${ms(sys.dbP50Ms)}. ` : '') +
    `<br>Average read: ${ms(mean.db)} database only, <b class="${loss ? 'worse' : 'better'}">${ms(mean.withCache)}</b> with Redis. ` +
    `Misses waste a Redis round trip, so the cache only pays off above a hit rate of Redis ÷ database latency = ${pct(mean.breakEvenHit)}; you are at <b class="${loss ? 'worse' : 'better'}">${pct(hit)}</b>.`

  draw('chart-cdf', {
    x: { type: 'log', label: 'Latency (ms)', tickFormat: si, domain: [redis.p50Ms / 4, 2 * Math.max(o.latency.p99, o.baseline.p99)] },
    y: { label: 'Reads at least this fast (%)', percent: true, domain: [0, 100] },
    marks: [
      Plot.ruleY([hit * redis.availability], { strokeDasharray: '2 3' }),
      Plot.text([{ y: hit * redis.availability }], { y: 'y', text: () => 'hit rate: below this line Redis alone, above it Redis + database', frameAnchor: 'right', dy: -7, stroke: 'var(--paper)', fill: 'var(--ink)' }),
      Plot.lineY(c.latencyCdf, { x: 'ms', y: 'baseline', stroke: MUTED, strokeWidth: 2, clip: true }),
      Plot.lineY(c.latencyCdf, { x: 'ms', y: 'withCache', stroke: CHOICE, strokeWidth: 2, tip: true, clip: true }),
    ],
  })
  const Q = ['p50', 'p75', 'p90', 'p99'] as const
  const row = (name: string, q: typeof o.latency) => `<tr><th>${name}</th>${Q.map((k) => `<td>${ms(q[k])}</td>`).join('')}</tr>`
  const change = Q.map((k) => o.latency[k] / o.baseline[k] - 1).map((d) => `<td class="${d > 0 ? 'worse' : 'better'}">${d > 0 ? '+' : ''}${(d * 100).toFixed(0)}%</td>`)
  $('latency').innerHTML = `<tr><th></th>${Q.map((k) => `<th>${k.toUpperCase()}</th>`).join('')}</tr>${row('Database only', o.baseline)}${row('Redis + database', o.latency)}<tr><th>Change</th>${change.join('')}</tr>`

  drawParity()
}

// Model-vs-simulation pairs from the last Validate run
let pairs: { run: string; kind: string; model: number; sim: number }[] = []
let worker: Worker | undefined

function drawParity() {
  const title = (d: (typeof pairs)[0]) => `${d.run} · ${d.kind}\nmodel ${pct(d.model)} · simulation ${pct(d.sim)}`
  draw('chart-parity', {
    height: 280,
    x: { label: 'Model (%)', percent: true, domain: [0, 100] },
    y: { label: 'Simulation (%)', percent: true, domain: [0, 100] },
    symbol: { domain: ['miss', 'stale'], range: ['circle', 'square'] },
    marks: [
      Plot.line([[0, 0], [1, 1]], { stroke: MUTED, strokeDasharray: '4 3' }),
      Plot.dot(pairs, { x: 'model', y: 'sim', symbol: 'kind', r: 5, fill: (d) => (d.kind === 'miss' ? CHOICE : 'var(--paper)'), stroke: CHOICE, strokeWidth: 1.5 }),
      Plot.tip(pairs, Plot.pointer({ x: 'model', y: 'sim', title })),
    ],
  })
}

// Runs the current point plus four memory and four TTL variants through the simulator; model and simulator both see the scaled parameters
$('validate').onclick = () => {
  worker?.terminate()
  worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })
  const ttl = [P.redis.ttlSec, evaluate(P).evictionAgeSec, 3600].find(isFinite)!
  // Shrinks the key space until three times the longest simulated TTL fits into the discarded warm-up half of a run
  const maxKeys = (P.sys.keys * SIM_REQUESTS) / (6 * 10 * ttl * (P.sys.rps + P.sys.wps))
  const base = scaleForSim(P, Math.min(1e6, Math.max(1e4, maxKeys)))
  const vary = (run: string, redis: Partial<Params['redis']>) => ({ run, params: { sys: base.sys, redis: { ...base.redis, ...redis } } })
  const runs = [
    vary('current', {}),
    ...[0.25, 0.5, 2, 4].map((f) => vary(`memory ×${f}`, { memGB: base.redis.memGB * f })),
    ...[0.1, 0.3, 3, 10].map((f) => vary(`TTL ${dur(ttl * f)}`, { ttlSec: ttl * f })),
  ]
  pairs = []
  $('sim-status').textContent = `Simulating 0/${runs.length}…`
  worker.onmessage = (e: MessageEvent<SimResult>) => {
    const { run, params } = runs[e.data.id]
    const m = evaluate(params)
    pairs.push({ run, kind: 'miss', model: m.missRate, sim: e.data.missRate }, { run, kind: 'stale', model: m.staleRate, sim: e.data.staleRate })
    const gap = Math.max(...pairs.map((d) => Math.abs(d.model - d.sim))) * 100
    const n = pairs.length / 2
    $('sim-status').textContent = `${n < runs.length ? `Simulating ${n}/${runs.length}… ` : ''}Largest model–simulation gap: ${gap.toFixed(2)} pp (${si(base.sys.keys)} keys, ${si(SIM_REQUESTS)} requests per run${maxKeys < 1e4 && gap > 2 ? '; this TTL is too long for the simulation to warm up' : ''}).`
    drawParity()
  }
  runs.forEach((r, id) => worker!.postMessage({ id, params: r.params, requests: SIM_REQUESTS, seed: id + 1 }))
}

addEventListener('resize', update)
update()
