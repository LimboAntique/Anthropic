import { expect, test } from 'vitest'
import { DEFAULTS } from '../src/contract/inputs'
import type { Params } from '../src/contract/types'
import { bins, byRank, curves, evaluate, latencyGap, life, meanLatency } from '../src/engine/model'

const INF = Infinity
const mk = (sys: Partial<Params['sys']> = {}, redis: Partial<Params['redis']> = {}): Params => ({ sys: { ...DEFAULTS.sys, ...sys }, redis: { ...DEFAULTS.redis, ...redis } })

test('bins cover every key and popularities sum to one', () => {
  for (const [keys, alpha] of [[100, 0], [1e7, 1], [1e9, 2.5]]) {
    const b = bins(keys, alpha)
    expect(b.reduce((s, x) => s + x.n, 0)).toBe(keys)
    expect(b.reduce((s, x) => s + x.n * x.p, 0)).toBeCloseTo(1, 9)
  }
})

test('life reduces to Che without a TTL and to a fixed timer without eviction', () => {
  const lam = 0.3, Tc = 7, T = 11
  const che = life(lam, 0, INF, Tc)
  expect((lam * che) / (1 + lam * che)).toBeCloseTo(1 - Math.exp(-lam * Tc), 9)
  expect(life(lam, 0, T, INF)).toBe(T)
  expect(life(lam, 0.2, T, INF)).toBeCloseTo((1 - Math.exp(-0.2 * T)) / 0.2, 12)
  expect(life(lam, 0, T, Tc)).toBeLessThan(T)
  expect(life(lam, 0, T, Tc)).toBeGreaterThan(Tc)
})

test('uniform popularity without TTL gives hit = capacity / keys', () => {
  const p = mk({ keys: 1e6, alpha: 0, objBytes: 900 }, { memGB: 0.25, ttlSec: INF })
  expect(1 - evaluate(p).missRate).toBeCloseTo(0.25, 6)
})

test('a cache larger than the dataset with no TTL never misses and reports the memory it really uses', () => {
  const o = evaluate(mk({ keys: 1e5 }, { memGB: 10, ttlSec: INF }))
  expect(o.missRate).toBeCloseTo(0, 9)
  expect(o.evictionAgeSec).toBe(INF)
  expect(o.memUsedGB).toBeCloseTo((1e5 * 1124) / 1e9, 9)
})

test('without TTL the hit rate does not depend on traffic volume', () => {
  const a = evaluate(mk({ rps: 10, wps: 0 }, { ttlSec: INF })).missRate
  const b = evaluate(mk({ rps: 1e6, wps: 0 }, { ttlSec: INF })).missRate
  expect(a).toBeCloseTo(b, 6)
})

test('miss rate falls as memory or TTL grows and never beats the ideal cache', () => {
  const c = curves(DEFAULTS)
  for (const k of ['missVsMem', 'vsTtl'] as const) for (let i = 1; i < c[k].length; i++) expect(c[k][i].miss).toBeLessThanOrEqual(c[k][i - 1].miss + 1e-9)
  for (const pt of c.missVsMem) expect(pt.ideal).toBeLessThanOrEqual(pt.miss + 1e-9)
})

test('write policy trades stale reads for misses', () => {
  const ttl = evaluate(mk({ wps: 2000 }))
  const inv = evaluate(mk({ wps: 2000 }, { writePolicy: 'invalidate' }))
  expect(ttl.staleRate).toBeGreaterThan(0)
  expect(inv.staleRate).toBe(0)
  expect(inv.missRate).toBeGreaterThan(ttl.missRate)
  expect(evaluate(mk({ wps: 0 })).staleRate).toBe(0)
})

test('binding constraint flips from capacity to TTL as the TTL shrinks', () => {
  expect(evaluate(mk({}, { ttlSec: INF })).binding).toBe('capacity')
  const short = evaluate(mk({}, { ttlSec: 1 }))
  expect(short.binding).toBe('ttl')
  expect(short.memUsedGB).toBeLessThan(DEFAULTS.redis.memGB)
})

test('baseline reproduces the DB percentiles; the cache helps P50 but not P99 while misses exceed 1%', () => {
  const o = evaluate(DEFAULTS)
  expect(o.baseline.p50).toBeCloseTo(5, 2)
  expect(o.baseline.p99).toBeCloseTo(50, 1)
  expect(o.missRate).toBeGreaterThan(0.01)
  expect(o.latency.p50).toBeLessThan(o.baseline.p50)
  expect(o.latency.p99).toBeGreaterThan(o.baseline.p50)
})

test('outputs are finite across extreme inputs and fast enough for slider dragging', () => {
  for (const p of [mk({ keys: 1e9, alpha: 2.5, rps: 1e6 }), mk({ keys: 1e3, alpha: 0, rps: 1, wps: 0 }, { memGB: 0.01, ttlSec: 1 }), mk({ wps: 1e5 }, { ttlSec: INF, availability: 0.9 })]) {
    const o = evaluate(p)
    for (const v of [o.missRate, o.staleRate, o.memUsedGB, o.latency.p99, o.baseline.p99, o.dbLoad.withCache]) expect(Number.isFinite(v), JSON.stringify(o)).toBe(true)
  }
  const big = mk({ keys: 1e9 })
  evaluate(big)
  curves(big)
  let t = performance.now()
  for (let i = 0; i < 20; i++) evaluate(big)
  const ev = (performance.now() - t) / 20
  t = performance.now()
  for (let i = 0; i < 5; i++) curves(big)
  const cu = (performance.now() - t) / 5
  console.log(`evaluate ${ev.toFixed(2)} ms, curves ${cu.toFixed(1)} ms, bins ${bins(1e9, 1).length}`)
  // Bounds are ten times the laptop figures: shared CI runners are slow, and only an algorithmic blow-up should fail
  expect(ev).toBeLessThan(50)
  expect(cu).toBeLessThan(600)
})

test('on average the cache pays off exactly when the hit rate exceeds redis latency / db latency', () => {
  const p = mk({}, { availability: 1 })
  const m = meanLatency(p, 0)
  expect(m.withCache).toBeCloseTo(m.redis, 12)
  expect(meanLatency(p, 1 - m.breakEvenHit).withCache).toBeCloseTo(m.db, 9)
  expect(meanLatency(p, 1).withCache).toBeCloseTo(m.db + m.redis, 9)
  expect(meanLatency(mk({}, { availability: 0 }), 0).withCache).toBeCloseTo(p.redis.timeoutMs + m.db, 9)
})

test('per-rank hit probabilities fall with rank and add up to the overall hit rate', () => {
  for (const p of [DEFAULTS, mk({ wps: 2000 }, { writePolicy: 'invalidate' }), mk({}, { ttlSec: 5, memGB: 8 })]) {
    const { points, capacity } = byRank(p)
    let hit = 0
    points.forEach((pt, i) => {
      if (i) expect(pt.hit).toBeLessThanOrEqual(points[i - 1].hit + 1e-12)
      hit += pt.hit * (pt.traffic - (i ? points[i - 1].traffic : 0))
    })
    expect(points[points.length - 1].traffic).toBeCloseTo(1, 9)
    expect(hit).toBeCloseTo(1 - evaluate(p).missRate, 9)
    expect(capacity).toBeLessThanOrEqual(p.sys.keys)
  }
})

test('stale age matches the closed form for a fixed timer and is unbounded without a TTL', () => {
  // One key, no eviction: reads land uniformly over [0,T]; a read at age t is t - (1 - e^{-wt})/w out of date
  const [T, w] = [100, 0.05]
  const fresh = (1 - Math.exp(-w * T)) / w
  const expected = ((T * T) / 2 - (T - fresh) / w) / (T - fresh)
  const o = evaluate(mk({ keys: 1000, alpha: 0, rps: 1000, wps: 1000 * w }, { memGB: 10, ttlSec: T }))
  expect(o.evictionAgeSec).toBe(Infinity)
  expect(o.staleAgeSec).toBeCloseTo(expected, 6)
  expect(o.staleAgeSec).toBeLessThan(T)
  expect(evaluate(mk({ wps: 100 }, { ttlSec: Infinity })).staleAgeSec).toBe(Infinity)
  expect(evaluate(mk({ wps: 100 }, { writePolicy: 'invalidate' })).staleAgeSec).toBe(0)
})

test('with no hits every percentile is slower by one Redis round trip; with many hits the low percentiles are faster', () => {
  const p = mk({}, { availability: 1 })
  for (const g of latencyGap(p, 1)) expect(g.gap).toBeCloseTo(p.redis.p50Ms, 6)
  const gaps = latencyGap(p, 0.2)
  expect(gaps[49].gap).toBeLessThan(-4)
  expect(gaps[49].withCache).toBeCloseTo(evaluate(mk({}, { availability: 1, ttlSec: Infinity })).latency.p50, 0)
})
