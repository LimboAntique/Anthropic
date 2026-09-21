import type { Curves, Outputs, Params, Percentiles } from '../contract/types'

const OVERHEAD = 100 // bytes Redis spends per key on top of the value
const EXACT = 256 // ranks modelled one by one before geometric binning starts

// Popularity bins: n keys that each receive fraction p of the traffic. Hot ranks are exact, the tail is binned geometrically.
export function bins(keys: number, alpha: number): { n: number; p: number }[] {
  const out: { n: number; p: number }[] = []
  for (let a = 1; a <= keys; ) {
    const b = a < EXACT ? a + 1 : Math.min(keys + 1, Math.ceil(a * 1.1))
    out.push({ n: b - a, p: Math.sqrt(a * (b - 1)) ** -alpha })
    a = b
  }
  const h = out.reduce((s, x) => s + x.n * x.p, 0)
  for (const x of out) x.p /= h
  return out
}

// Expected time a key stays cached after insertion, discounted by e^{-wt}: integral over [0,T] of P(L>t) e^{-wt}.
// L is the LRU eviction time, approximated as Tc + Exp(m) with the exact mean (e^{λTc}-1)/λ.
export function life(lam: number, w: number, T: number, Tc: number): number {
  const seg = (rate: number, len: number) => (len === Infinity ? 1 / rate : rate * len < 1e-9 ? len : -Math.expm1(-rate * len) / rate)
  if (T <= Tc) return seg(w, T)
  const m = Math.expm1(lam * Tc) / lam - Tc
  return seg(w, Tc) + Math.exp(-w * Tc) * seg(w + 1 / m, T - Tc)
}

interface Solved {
  tc: number
  hit: number
  stale: number
  used: number // expected number of cached keys
}

// Finds the eviction age Tc at which expected occupancy equals capacity, then aggregates hit and stale rates
function solve(p: Params, cap: number, b = bins(p.sys.keys, p.sys.alpha)): Solved {
  const { rps, wps } = p.sys
  const T = p.redis.ttlSec
  const inval = p.redis.writePolicy === 'invalidate'
  const at = (tc: number): Solved => {
    let hit = 0, stale = 0, used = 0
    for (const { n, p: pi } of b) {
      const lam = rps * pi, w = wps * pi
      const l0 = inval ? 0 : life(lam, 0, T, tc), lw = w > 0 || inval ? life(lam, w, T, tc) : l0
      const o = 1 - 1 / (1 + lam * (inval ? lw : l0)) // occupancy equals hit probability (PASTA)
      hit += n * pi * o
      used += n * o
      if (!inval && w > 0) stale += n * pi * o * (1 - lw / l0)
    }
    return { tc, hit, stale, used }
  }
  const free = at(Infinity)
  if (free.used <= cap) return free
  let lo = -30, hi = 30 // bisection on ln Tc
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2
    at(Math.exp(mid)).used > cap ? (hi = mid) : (lo = mid)
  }
  return at(Math.exp((lo + hi) / 2))
}

// Standard normal CDF (Abramowitz-Stegun 7.1.26 erf, |error| < 1.5e-7)
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) * Math.SQRT1_2)
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-z * z) / 2)
  return z < 0 ? (1 - erf) / 2 : (1 + erf) / 2
}

// CDF of shift + lognormal fitted to a P50 and a P99
const lognCdf = (ms: number, p50: number, p99: number, shift = 0) =>
  ms <= shift ? 0 : phi(Math.log((ms - shift) / p50) / (Math.log(Math.max(p99 / p50, 1.0001)) / 2.3263))

// Latency CDFs: baseline is the database alone; with a cache a read is a hit, a miss (Redis then DB) or a Redis outage (timeout then DB)
function cdfs(p: Params, miss: number) {
  const { sys, redis: r } = p
  const baseline = (ms: number) => lognCdf(ms, sys.dbP50Ms, sys.dbP99Ms)
  const withCache = (ms: number) =>
    r.availability * ((1 - miss) * lognCdf(ms, r.p50Ms, r.p99Ms) + miss * lognCdf(ms, sys.dbP50Ms, sys.dbP99Ms, r.p50Ms)) +
    (1 - r.availability) * lognCdf(ms, sys.dbP50Ms, sys.dbP99Ms, r.timeoutMs)
  return { baseline, withCache }
}

// Mean of the lognormal fitted to a P50 and a P99
const lognMean = (p50: number, p99: number) => p50 * Math.exp((Math.log(Math.max(p99 / p50, 1.0001)) / 2.3263) ** 2 / 2)

// Mean read latency per path. A miss costs Redis plus the database, so the cache only pays off on average
// while hit rate > redis / db: below that the round trips wasted on misses outweigh the database reads saved.
export function meanLatency(p: Params, miss: number) {
  const redis = lognMean(p.redis.p50Ms, p.redis.p99Ms), db = lognMean(p.sys.dbP50Ms, p.sys.dbP99Ms)
  const up = p.redis.availability
  return { redis, db, withCache: up * (redis + miss * db) + (1 - up) * (p.redis.timeoutMs + db), breakEvenHit: Math.min(1, redis / db) }
}

function percentiles(cdf: (ms: number) => number): Percentiles {
  const q = (target: number) => {
    let lo = Math.log(1e-3), hi = Math.log(1e6)
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      cdf(Math.exp(mid)) < target ? (lo = mid) : (hi = mid)
    }
    return Math.exp(hi)
  }
  return { p50: q(0.5), p75: q(0.75), p90: q(0.9), p99: q(0.99) }
}

const capacity = (p: Params, memGB = p.redis.memGB) => (memGB * 1e9) / (p.sys.objBytes + OVERHEAD)

export function evaluate(p: Params): Outputs {
  const { sys, redis } = p
  const s = solve(p, capacity(p))
  const c = cdfs(p, 1 - s.hit)
  const all = (sys.rps + sys.wps) / sys.dbCapacityQps
  return {
    missRate: 1 - s.hit,
    staleRate: s.stale,
    evictionAgeSec: s.tc,
    binding: s.tc < redis.ttlSec ? 'capacity' : 'ttl',
    memUsedGB: (s.used * (sys.objBytes + OVERHEAD)) / 1e9,
    costPerMonth: redis.memGB * redis.pricePerGBMonth,
    latency: percentiles(c.withCache),
    baseline: percentiles(c.baseline),
    dbLoad: { withCache: (sys.rps * (1 - s.hit) + sys.wps) / sys.dbCapacityQps, noCache: all, redisDown: all },
  }
}

const logspace = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => lo * (hi / lo) ** (i / (n - 1)))

export function curves(p: Params): Curves {
  const b = bins(p.sys.keys, p.sys.alpha)
  // Hit rate of a cache holding exactly the hottest `cap` keys
  const ideal = (cap: number) => {
    let hit = 0
    for (const x of b) {
      const take = Math.min(x.n, cap)
      hit += take * x.p
      if ((cap -= take) <= 0) break
    }
    return hit
  }
  const miss = 1 - solve(p, capacity(p), b).hit
  const c = cdfs(p, miss)
  return {
    missVsMem: logspace(0.01, 1024, 40).map((memGB) => ({ memGB, miss: 1 - solve(p, capacity(p, memGB), b).hit, ideal: 1 - ideal(capacity(p, memGB)) })),
    vsTtl: logspace(1, 2592000, 40).map((ttlSec) => {
      const s = solve({ ...p, redis: { ...p.redis, ttlSec } }, capacity(p), b)
      return { ttlSec, miss: 1 - s.hit, stale: s.stale }
    }),
    latencyCdf: logspace(0.05, 5000, 80).map((ms) => ({ ms, withCache: c.withCache(ms), baseline: c.baseline(ms) })),
  }
}
