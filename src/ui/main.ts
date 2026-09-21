import * as Plot from '@observablehq/plot'
import { DEFAULTS, INPUTS, randomSystem } from '../contract/inputs'
import type { InputSpec, Params, SimResult } from '../contract/types'
import { advise } from '../engine/advisor'
import { curves, evaluate } from '../engine/model'
import { PRESETS } from '../engine/presets'
import { scaleForSim } from '../engine/sim'
import './style.css'

const STEPS = 1000 // slider resolution
const SIM_REQUESTS = 3e6 // requests replayed per simulation run
const S1 = 'var(--s1)'
const S2 = 'var(--s2)'
// Labelled through the axis text channel because log scales hide tick labels that are not powers of ten
const TTL_TICKS = [1, 60, 3600, 86400, 2592000]

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
  label.innerHTML = `<span>${s.label}</span><output></output><input type="range" min="0" max="${STEPS + +(s.key === 'ttlSec')}">`
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
policy.innerHTML = `<span>On write</span><select><option value="ttl-only">Do nothing, wait for the TTL</option><option value="invalidate">Delete the cached key</option></select>`
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
  const { redis } = P
  const advice = advise(P, o)
  const head = advice[0] ?? { level: 'warn', title: `Redis serves ${pct(1 - o.missRate)} of reads`, detail: `P99 goes from ${ms(o.baseline.p99)} to ${ms(o.latency.p99)}.` }
  $('verdict').className = head.level
  $('verdict').innerHTML = `<b>${head.title}</b> ${head.detail}`
  $('advice').innerHTML = advice.map((a) => `<li class="${a.level}"><b>${a.title}</b><br>${a.detail}</li>`).join('') || '<li>No remarks.</li>'

  const load = (u: number) => pct(u) + (u >= 1 ? ' ⚠ overload' : '')
  const tiles = [
    ['Hit rate', pct(1 - o.missRate), `miss ${pct(o.missRate)}`],
    ['Stale reads', pct(o.staleRate), redis.writePolicy === 'invalidate' ? 'writes delete the key' : 'of all reads'],
    ['P50 latency', ms(o.latency.p50), `${ms(o.baseline.p50)} without Redis`],
    ['P99 latency', ms(o.latency.p99), `${ms(o.baseline.p99)} without Redis`],
    ['DB load', load(o.dbLoad.withCache), `no cache ${load(o.dbLoad.noCache)} · Redis down ${load(o.dbLoad.redisDown)}`],
    ['Memory used', bytes(o.memUsedGB * 1e9), `of ${bytes(redis.memGB * 1e9)} · $${si(o.costPerMonth)}/month`],
    ['Eviction age', dur(o.evictionAgeSec), o.evictionAgeSec === Infinity ? 'memory never fills, only the TTL removes keys' : o.binding === 'ttl' ? 'TTL expires keys before LRU evicts them' : 'LRU evicts keys before the TTL fires'],
  ]
  $('tiles').innerHTML = tiles.map(([k, v, sub]) => `<div class="card${v.includes('⚠') ? ' bad' : ''}"><small>${k}</small><strong>${v}</strong><small>${sub}</small></div>`).join('')

  draw('chart-mem', {
    marginTop: 34,
    x: { type: 'log' },
    y: { label: 'Miss rate (%)', percent: true, domain: [0, 100] },
    marks: [
      Plot.axisX({ anchor: 'top', label: 'Cost ($/month)', tickFormat: (d: number) => '$' + si(d * redis.pricePerGBMonth) }),
      Plot.axisX({ label: 'Redis memory (GB)', tickFormat: si }),
      Plot.lineY(c.missVsMem, { x: 'memGB', y: 'ideal', stroke: S2, strokeWidth: 2, strokeDasharray: '4 3' }),
      Plot.lineY(c.missVsMem, { x: 'memGB', y: 'miss', stroke: S1, strokeWidth: 2, tip: true }),
      Plot.dot([{ memGB: redis.memGB, miss: o.missRate }], { x: 'memGB', y: 'miss', r: 5, fill: S1, stroke: 'var(--surface)', strokeWidth: 2 }),
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
      Plot.text(marks, { x: 'x', text: 'text', frameAnchor: 'top', dy: -10 }),
      Plot.lineY(c.vsTtl, { x: 'ttlSec', y: 'stale', stroke: S2, strokeWidth: 2 }),
      Plot.lineY(c.vsTtl, { x: 'ttlSec', y: 'miss', stroke: S1, strokeWidth: 2, tip: true }),
    ],
  })

  draw('chart-cdf', {
    x: { type: 'log', label: 'Latency (ms)', tickFormat: si },
    y: { label: 'Reads faster than this (%)', percent: true, domain: [0, 100] },
    marks: [
      Plot.lineY(c.latencyCdf, { x: 'ms', y: 'baseline', stroke: S2, strokeWidth: 2 }),
      Plot.lineY(c.latencyCdf, { x: 'ms', y: 'withCache', stroke: S1, strokeWidth: 2, tip: true }),
    ],
  })
  const row = (name: string, q: typeof o.latency) => `<tr><th>${name}</th><td>${ms(q.p50)}</td><td>${ms(q.p75)}</td><td>${ms(q.p90)}</td><td>${ms(q.p99)}</td></tr>`
  $('latency').innerHTML = `<tr><th></th><th>P50</th><th>P75</th><th>P90</th><th>P99</th></tr>${row('With Redis', o.latency)}${row('Database only', o.baseline)}`

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
    color: { domain: ['miss', 'stale'], range: [S1, S2] },
    symbol: { domain: ['miss', 'stale'], range: ['circle', 'square'] },
    marks: [
      Plot.line([[0, 0], [1, 1]], { strokeDasharray: '4 3', strokeOpacity: 0.5 }),
      Plot.dot(pairs, { x: 'model', y: 'sim', fill: 'kind', symbol: 'kind', r: 5, stroke: 'var(--surface)' }),
      Plot.tip(pairs, Plot.pointer({ x: 'model', y: 'sim', title })),
    ],
  })
}

// Runs the current point plus four memory and four TTL variants through the simulator; model and simulator both see the scaled parameters
$('validate').onclick = () => {
  worker?.terminate()
  worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })
  const base = scaleForSim(P)
  const tc = evaluate(base).evictionAgeSec
  const ttl = [base.redis.ttlSec, tc, 3600].find(isFinite)!
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
    $('sim-status').textContent = `${n < runs.length ? `Simulating ${n}/${runs.length}… ` : ''}Largest model–simulation gap: ${gap.toFixed(2)} pp (${si(base.sys.keys)} keys, ${si(SIM_REQUESTS)} requests per run).`
    drawParity()
  }
  runs.forEach((r, id) => worker!.postMessage({ id, params: r.params, requests: SIM_REQUESTS, seed: id + 1 }))
}

addEventListener('resize', update)
update()
