import { expect, test } from 'vitest'
import { DEFAULTS } from '../src/contract/inputs'
import { simulate } from '../src/engine/sim'
import type { Params, SimRequest, SimResult } from '../src/contract/types'

// Every expectation in this file comes from a closed form or a naive reference, never from the analytical model.

// objBytes 900 plus 100 B overhead makes capacity exactly memGB * 1e6 keys
const params = (sys: Partial<Params['sys']>, redis: Partial<Params['redis']>): Params => ({
  sys: { ...DEFAULTS.sys, objBytes: 900, wps: 0, ...sys },
  redis: { ...DEFAULTS.redis, ttlSec: Infinity, ...redis },
})
const run = (p: Params, requests = 4e5, seed = 1) => simulate({ id: 7, params: p, requests, seed })
const zipf = (n: number, alpha: number) => {
  const w = Array.from({ length: n }, (_, i) => (i + 1) ** -alpha)
  const h = w.reduce((a, b) => a + b)
  return w.map((x) => x / h)
}

test('uniform popularity without TTL hits with probability C/N', () => {
  const r = run(params({ keys: 1e4, alpha: 0 }, { memGB: 1e-3 }))
  expect(r.missRate).toBeCloseTo(0.9, 2)
  expect(r.staleRate).toBe(0)
  expect(r.id).toBe(7)
})

test('a cache that holds every key stops missing once the unmeasured warm-up half has touched them all', () => {
  expect(run(params({ keys: 1e3, alpha: 1 }, { memGB: 1e-3 })).missRate).toBe(0)
})

test('no memory means every read misses', () => {
  expect(run(params({ keys: 1e3 }, { memGB: 1e-7 }), 1e4).missRate).toBe(1)
})

test('a one-slot cache hits when a key repeats: Σp²', () => {
  const hit = zipf(100, 1.2).reduce((s, p) => s + p * p, 0)
  expect(run(params({ keys: 100, alpha: 1.2 }, { memGB: 1e-6 })).missRate).toBeCloseTo(1 - hit, 2)
})

// King's exact LRU result for 3 keys and 2 slots: the cache holds the last two distinct keys (i, j) with probability
// p_i p_j / (1 - p_i), and the third key misses. FIFO would give 0.157 here instead of 0.134.
test('eviction order is LRU: exact miss rate for 3 keys in 2 slots', () => {
  const p = zipf(3, 2)
  let miss = 0
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) miss += ((p[i] * p[j]) / (1 - p[i])) * p[3 - i - j]
  expect(miss).toBeCloseTo(0.134, 3)
  expect(run(params({ keys: 3, alpha: 2 }, { memGB: 2e-6 })).missRate).toBeCloseTo(miss, 2)
})

// Single key, rate λ, TTL T: a cycle is one miss plus Poisson(λℓ) hits, where ℓ is the expected cached time
const [lam, w, T] = [1, 0.5, 2]
const l = -Math.expm1(-w * T) / w // expected time until the first write or expiry

test('single key with TTL hits λT/(1+λT), so hits do not refresh the TTL', () => {
  expect(run(params({ keys: 1, rps: lam }, { ttlSec: T })).missRate).toBeCloseTo(1 / (1 + lam * T), 2)
})

test('single key, ttl-only writes: hit rate unchanged, reads after the first write are stale', () => {
  const r = run(params({ keys: 1, rps: lam, wps: w }, { ttlSec: T }))
  expect(r.missRate).toBeCloseTo(1 / (1 + lam * T), 2)
  expect(r.staleRate).toBeCloseTo((lam * (T - l)) / (1 + lam * T), 2)
  // A read at time t after a first write at x < T is t - x out of date: E[(T-x)²/2] over E[T-x], which is e - 2 here
  const age = (T * T - (2 * T) / w + (2 * -Math.expm1(-w * T)) / (w * w)) / (2 * (T - l))
  expect(age).toBeCloseTo(Math.E - 2, 12)
  expect(r.staleAgeSec / age).toBeCloseTo(1, 1)
})

test('single key, invalidating writes: cached time shrinks to ℓ and nothing is stale', () => {
  const r = run(params({ keys: 1, rps: lam, wps: w }, { ttlSec: T, writePolicy: 'invalidate' }))
  expect(r.missRate).toBeCloseTo(1 / (1 + lam * l), 2)
  expect(r.staleRate).toBe(0)
  expect(r.staleAgeSec).toBe(0)
})

// With room for every key nothing is evicted, so each Zipf key is an independent copy of the single-key case
for (const writePolicy of ['ttl-only', 'invalidate'] as const)
  test(`200 Zipf keys, no eviction, ${writePolicy}: per-key closed forms add up`, () => {
    const [rps, wps, ttlSec] = [400, 100, 3]
    let hit = 0, stale = 0
    for (const p of zipf(200, 1)) {
      const li = -Math.expm1(-wps * p * ttlSec) / (wps * p)
      hit += (p * rps * p * (writePolicy === 'invalidate' ? li : ttlSec)) / (1 + rps * p * (writePolicy === 'invalidate' ? li : ttlSec))
      if (writePolicy === 'ttl-only') stale += (p * rps * p * (ttlSec - li)) / (1 + rps * p * ttlSec)
    }
    const r = run(params({ keys: 200, alpha: 1, rps, wps }, { memGB: 1e-3, ttlSec, writePolicy }), 1e6)
    expect(r.missRate).toBeCloseTo(1 - hit, 2)
    expect(r.staleRate).toBeCloseTo(stale, 2)
  })

// Naive reference: Map insertion order is recency order, expiry is a full scan at every event. It draws from the same
// generator in the same order as simulate (time, key, read-or-write), so the two must agree to the last bit.
function reference({ id, params: { sys, redis }, requests, seed }: SimRequest): SimResult {
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const weights = Array.from({ length: sys.keys }, (_, i) => (i + 1) ** -sys.alpha)
  let sum = 0
  for (const x of weights) sum += x
  const cap = Math.floor((redis.memGB * 1e9) / (sys.objBytes + 100))
  const cache = new Map<number, { born: number; dirtied?: number }>() // dirtied: time of the first write since insertion
  let now = 0, reads = 0, hits = 0, stale = 0, age = 0
  for (let i = 0; i < requests; i++) {
    now -= Math.log(1 - rand()) / (sys.rps + sys.wps)
    for (const [k, e] of cache) if (e.born + redis.ttlSec <= now) cache.delete(k)
    const u = rand() * sum
    let k = 0
    for (let acc = weights[0]; k < sys.keys - 1 && acc <= u; acc += weights[++k]);
    const e = cache.get(k)
    if (rand() * (sys.rps + sys.wps) < sys.wps) {
      if (e) redis.writePolicy === 'invalidate' ? cache.delete(k) : (e.dirtied ??= now)
      continue
    }
    if (i >= requests / 2) reads++
    if (e) {
      cache.delete(k)
      cache.set(k, e)
      if (i >= requests / 2) hits++
      if (i >= requests / 2 && e.dirtied !== undefined) stale++, (age += now - e.dirtied)
    } else if (cap >= 1) {
      if (cache.size === cap) cache.delete(cache.keys().next().value!)
      cache.set(k, { born: now })
    }
  }
  return { id, missRate: 1 - hits / reads, staleRate: stale / reads, staleAgeSec: stale ? age / stale : 0 }
}

test('linked-list cache agrees bit for bit with a naive Map reference while eviction, expiry and writes interleave', () => {
  const seen: number[] = [], ages: number[] = []
  for (const writePolicy of ['ttl-only', 'invalidate'] as const) for (const ttlSec of [Infinity, 5, 0.5]) for (const slots of [1, 10, 60]) for (const alpha of [0, 1.2]) {
    const req = { id: 3, params: params({ keys: 50, alpha, rps: 20, wps: 5 }, { memGB: slots / 1e6, ttlSec, writePolicy }), requests: 2e4, seed: slots }
    const r = simulate(req)
    expect(r, `${writePolicy} ttl=${ttlSec} slots=${slots} α=${alpha}`).toEqual(reference(req))
    seen.push(r.missRate, r.staleRate)
    ages.push(r.staleAgeSec)
  }
  // The battery is not vacuous: rates are numbers and cover misses, hits and stale reads
  expect(seen.every((x) => x >= 0 && x <= 1)).toBe(true)
  expect(Math.max(...seen)).toBeGreaterThan(0.9)
  expect(seen.filter((x) => x > 0.05 && x < 0.5).length).toBeGreaterThan(10)
  expect(ages.filter((x) => x > 0).length).toBeGreaterThan(10)
})

test('same seed reproduces the result, other seeds differ by sampling noise only', () => {
  const p = params({ keys: 1e4, alpha: 1, rps: 100, wps: 10 }, { memGB: 1e-3, ttlSec: 60 })
  expect(run(p, 1e5, 3)).toEqual(run(p, 1e5, 3))
  const miss = [0, 1, 2, 3, 4, 5].map((seed) => run(p, 4e5, seed).missRate)
  expect(new Set(miss).size).toBe(6)
  expect(Math.max(...miss) - Math.min(...miss)).toBeLessThan(0.005)
})

test('degenerate requests neither throw nor corrupt later runs', () => {
  expect(run(params({ keys: 1e3 }, {}), 0).missRate).toBeNaN() // no measured reads
  expect(run(params({ keys: 1e3, rps: 1e-9, wps: 1 }, {}), 1e3).missRate).toBeNaN() // writes only
  const r = run(params({ keys: 1234.56, alpha: 2.5, rps: 100, wps: 100 }, { memGB: 1.5e-5, ttlSec: 1 }), 1e5) // fractional keys
  expect(r.missRate).toBeGreaterThan(0)
  expect(r.missRate + r.staleRate).toBeLessThanOrEqual(1)
})

test('1e6 keys x 5e6 requests with TTL, eviction and writes finishes within 3 s', () => {
  const t = performance.now()
  const r = run(params({ keys: 1e6, alpha: 1, rps: 1e3, wps: 100 }, { memGB: 0.1, ttlSec: 600 }), 5e6)
  expect(performance.now() - t).toBeLessThan(3000)
  expect(r.missRate).toBeGreaterThan(0.1)
  expect(r.staleRate).toBeGreaterThan(0)
})

test('worker answers a SimRequest with the matching SimResult', async () => {
  const g = globalThis as unknown as { postMessage: (m: unknown) => void; onmessage: (e: { data: unknown }) => void }
  let reply: unknown
  g.postMessage = (m) => (reply = m)
  g.onmessage = () => {} // declares the global that the worker module assigns
  await import('../src/engine/worker')
  const req = { id: 9, params: params({ keys: 1e3 }, { memGB: 1e-4 }), requests: 1e4, seed: 2 }
  g.onmessage({ data: req })
  expect(reply).toEqual(simulate(req))
})
