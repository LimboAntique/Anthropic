import { afterAll, expect, test, vi } from 'vitest'
import { DEFAULTS, randomSystem } from '../src/contract/inputs'
import { evaluate } from '../src/engine/model'
import { PRESETS } from '../src/engine/presets'
import { scaleForSim, simulate } from '../src/engine/sim'
import type { Params } from '../src/contract/types'

const worst = { grid: 0, validate: 0, age: 0 }
afterAll(() => console.log(`max |model - sim|: grid ${(worst.grid * 100).toFixed(2)}pp, Validate path ${(worst.validate * 100).toFixed(2)}pp; grid stale age within ${(worst.age * 100).toFixed(1)}%`))

// Largest gap between model and simulation over miss rate and stale rate
function gap(params: Params, requests: number, into: keyof typeof worst, seed = 1) {
  const m = evaluate(params), s = simulate({ id: 0, params, requests, seed })
  const d = Math.max(Math.abs(m.missRate - s.missRate), Math.abs(m.staleRate - s.staleRate))
  worst[into] = Math.max(worst[into], d)
  return { d, m, s, note: `model=${m.missRate.toFixed(4)}/${m.staleRate.toFixed(4)} sim=${s.missRate.toFixed(4)}/${s.staleRate.toFixed(4)}` }
}

// Grid: skew x cached fraction x write policy x TTL (none, just above the eviction age Tc, equal to it, far below it)
const [N, rps, wps] = [2e4, 1000, 200]
for (const alpha of [0, 0.8, 1.2, 2]) for (const frac of [0.01, 0.1]) for (const writePolicy of ['ttl-only', 'invalidate'] as const)
  test(`model matches simulation within 2pp: α=${alpha} C/N=${frac} ${writePolicy}`, () => {
    // objBytes 900 plus 100 B overhead makes capacity exactly memGB * 1e6 keys
    const base: Params = { sys: { ...DEFAULTS.sys, keys: N, objBytes: 900, alpha, rps, wps }, redis: { ...DEFAULTS.redis, memGB: (N * frac) / 1e6, ttlSec: Infinity, writePolicy } }
    const tc = evaluate(base).evictionAgeSec
    for (const ttlSec of [Infinity, 1.5 * tc, tc, tc / 10]) {
      // Long enough to fill the cache several times over, so the measured half is stationary
      const requests = Math.min(8e6, Math.max(5e5, 8 * (rps + wps) * tc))
      const g = gap({ ...base, redis: { ...base.redis, ttlSec } }, requests, 'grid')
      // Stale age is a duration, so it is compared relatively, where enough stale reads were sampled. Hot keys all start
      // their first TTL cycle at time zero, so the measured half must span many cycles or it samples cache ages unevenly.
      if (g.s.staleRate > 0.02 && requests / (rps + wps) > 40 * ttlSec) {
        const rel = Math.abs(g.m.staleAgeSec / g.s.staleAgeSec - 1)
        worst.age = Math.max(worst.age, rel)
        expect(rel, `ttl=${ttlSec} stale age model=${g.m.staleAgeSec} sim=${g.s.staleAgeSec}`).toBeLessThan(0.1)
      }
      expect(g.d, `ttl=${ttlSec} ${g.note}`).toBeLessThan(0.02)
    }
  }, 30_000)

test('worst deviation over the grid stays under 0.5pp', () => expect(worst.grid).toBeLessThan(0.005))

const vary = (sys: Partial<Params['sys']>, redis: Partial<Params['redis']>): Params => ({ sys: { ...DEFAULTS.sys, ...sys }, redis: { ...DEFAULTS.redis, ...redis } })

// Configurations whose cold start fades slowly: month-long or absent TTLs, memory that never fills, rare or dominant writes
const SLOW: [string, Params][] = [
  ...(['ttl-only', 'invalidate'] as const).flatMap((writePolicy) => [2592000, Infinity].map((ttlSec): [string, Params] => [`ttl=${ttlSec} ${writePolicy}`, vary({}, { ttlSec, writePolicy })])),
  ['holds everything, no TTL, no writes', vary({ wps: 0 }, { ttlSec: Infinity, memGB: 1024 })],
  ['holds everything, no TTL, writes', vary({}, { ttlSec: Infinity, memGB: 1024 })],
  ['holds everything, uniform keys, no TTL', vary({ alpha: 0, wps: 0 }, { ttlSec: Infinity, memGB: 1024 })],
  ['one write per second, no TTL', vary({ wps: 1 }, { ttlSec: Infinity })],
  ['as many writes as reads, no TTL', vary({ wps: 1e4 }, { ttlSec: Infinity })],
  ['ten writes per read, invalidate', vary({ rps: 1e3, wps: 1e4 }, { writePolicy: 'invalidate' })],
  ['steepest skew', vary({ alpha: 2.5 }, {})],
  ['largest system', vary({ keys: 1e9 }, { memGB: 1024 })],
  ['smallest system', vary({ keys: 1e3, rps: 1 }, { memGB: 0.01 })],
  ['one-second TTL', vary({}, { ttlSec: 1 })],
  ['a few cache slots per million keys', vary({ keys: 5.5e7, alpha: 1.7, rps: 140, wps: 1.1, objBytes: 2500 }, { memGB: 0.09, ttlSec: Infinity })],
]

test('scaleForSim keeps ratios, whole keys and slots, and its bounds', () => {
  for (const [name, p] of [['defaults', DEFAULTS], ...PRESETS.map((x): [string, Params] => [x.name, x.params]), ...SLOW] as [string, Params][]) {
    const q = scaleForSim(p), f = q.sys.rps / p.sys.rps
    const slots = (x: Params) => (x.redis.memGB * 1e9) / (x.sys.objBytes + 100)
    expect(Number.isInteger(q.sys.keys), name).toBe(true)
    expect(q.sys.keys, name).toBeLessThanOrEqual(Math.min(1e6, p.sys.keys))
    expect(q.sys.keys, name).toBeGreaterThanOrEqual(100)
    expect(Math.floor(slots(q)), name).toBeGreaterThanOrEqual(Math.min(64, Math.floor(slots(p))))
    expect(slots(q) % 1, name).toBeLessThan(1e-3) // a whole number of keys, so model and simulator see one capacity
    expect(Math.abs(slots(q) - slots(p) * f), name).toBeLessThanOrEqual(0.5 + 1e-3)
    expect(q.sys.keys / p.sys.keys, name).toBeCloseTo(f, 3)
    expect(q.sys.wps, name).toBeCloseTo(p.sys.wps * f, 9)
    expect({ ...q.sys, keys: 0, rps: 0, wps: 0 }, name).toEqual({ ...p.sys, keys: 0, rps: 0, wps: 0 })
    expect({ ...q.redis, memGB: 0 }, name).toEqual({ ...p.redis, memGB: 0 })
  }
  const small = vary({ keys: 5e4, rps: 10, wps: 0, objBytes: 900 }, { ttlSec: 60, memGB: 0.01 })
  expect(scaleForSim(small).sys).toEqual(small.sys) // small systems run unscaled
  expect(scaleForSim(small).redis.memGB).toBeCloseTo(0.01, 9)
  expect(scaleForSim(DEFAULTS, 1e4).sys.keys).toBe(1e4)
  expect(scaleForSim(DEFAULTS, 1e6, 3e5).sys.keys).toBeLessThan(scaleForSim(DEFAULTS, 1e6, 3e6).sys.keys) // fewer events, smaller system
  const few = scaleForSim(vary({ keys: 1e8, wps: 1 }, { memGB: 0.05, ttlSec: Infinity })) // 44k slots, and rare writes ask for a 300x smaller system
  expect(Math.floor((few.redis.memGB * 1e9) / 1124)).toBe(64) // the slot floor wins over the warm-up budget
})

// The Validate button's path: scale with the default event budget, then compare model and simulation on the scaled system
const R = 3e6
for (const [name, p] of [['defaults', DEFAULTS], ...PRESETS.map((x): [string, Params] => [`preset ${x.name}`, x.params]), ...SLOW] as [string, Params][])
  test(`Validate path within 2pp: ${name}`, () => {
    const g = gap(scaleForSim(p, 1e6, R), R, 'validate')
    expect(g.d, g.note).toBeLessThan(0.02)
  }, 30_000)

test('Validate path within 2pp on 16 seeded random systems with random memory and TTL', () => {
  let s = 42
  const random = vi.spyOn(Math, 'random').mockImplementation(() => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 16; i++) {
    const redis = { ...DEFAULTS.redis, writePolicy: i % 2 ? ('invalidate' as const) : ('ttl-only' as const), memGB: 10 ** (Math.random() * 4 - 2), ttlSec: i % 3 ? 10 ** (Math.random() * 6) : Infinity }
    const p = { sys: randomSystem(), redis }
    const g = gap(scaleForSim(p, 1e6, R), R, 'validate', i + 1)
    expect(g.d, `${JSON.stringify(p)} ${g.note}`).toBeLessThan(0.02)
  }
  random.mockRestore()
}, 60_000)
