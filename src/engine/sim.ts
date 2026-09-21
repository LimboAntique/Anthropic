import type { Params, SimRequest, SimResult } from '../contract/types'

const OVERHEAD = 100 // bytes Redis spends per key on top of the value

// Seeded uniform [0,1) generator (mulberry32)
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Doubly linked list of key ids threaded through typed arrays; index n is the sentinel, so next[n] is the oldest entry
class List {
  prev: Int32Array
  next: Int32Array
  constructor(private n: number) {
    this.prev = new Int32Array(n + 1).fill(n)
    this.next = new Int32Array(n + 1).fill(n)
  }
  remove(k: number) {
    this.next[this.prev[k]] = this.next[k]
    this.prev[this.next[k]] = this.prev[k]
  }
  push(k: number) {
    const last = this.prev[this.n]
    this.next[last] = this.prev[this.n] = k
    this.prev[k] = last
    this.next[k] = this.n
  }
}

// Discrete-event LRU cache under Poisson reads and writes with Zipf keys. A TTL runs from insertion, is not refreshed
// by hits and expires instantly. The first half of the events warms the cache and is not measured.
export function simulate(r: SimRequest): SimResult {
  const { sys, redis } = r.params
  const n = Math.round(sys.keys)
  const cap = Math.floor((redis.memGB * 1e9) / (sys.objBytes + OVERHEAD))
  const invalidate = redis.writePolicy === 'invalidate'
  const rate = sys.rps + sys.wps
  const rand = rng(r.seed)

  const cdf = new Float64Array(n) // unnormalised Zipf CDF, sampled by bisection
  let sum = 0
  for (let i = 0; i < n; i++) cdf[i] = sum += (i + 1) ** -sys.alpha

  const state = new Uint8Array(n) // 0 absent, 1 fresh, 2 stale
  const born = new Float64Array(n) // insertion time
  const dirtied = new Float64Array(n) // time of the first write since insertion
  const lru = new List(n) // recency order
  const fifo = new List(n) // insertion order, which is also expiry order
  let size = 0
  const drop = (k: number) => {
    state[k] = 0
    lru.remove(k)
    fifo.remove(k)
    size--
  }

  let now = 0, reads = 0, hits = 0, stale = 0, age = 0
  for (let i = 0; i < r.requests; i++) {
    now -= Math.log(1 - rand()) / rate
    for (let k = fifo.next[n]; k !== n && born[k] + redis.ttlSec <= now; k = fifo.next[n]) drop(k)
    const u = rand() * sum
    let k = 0
    for (let hi = n - 1; k < hi; ) {
      const mid = (k + hi) >>> 1
      cdf[mid] > u ? (hi = mid) : (k = mid + 1)
    }
    if (rand() * rate < sys.wps) {
      if (invalidate && state[k]) drop(k)
      else if (state[k] === 1) (state[k] = 2), (dirtied[k] = now)
      continue
    }
    const measured = i >= r.requests / 2
    if (measured) reads++
    if (state[k]) {
      lru.remove(k)
      lru.push(k)
      if (measured) hits++
      if (measured && state[k] === 2) stale++, (age += now - dirtied[k])
    } else if (cap >= 1) {
      if (size === cap) drop(lru.next[n])
      state[k] = 1
      born[k] = now
      lru.push(k)
      fifo.push(k)
      size++
    }
  }
  return { id: r.id, missRate: 1 - hits / reads, staleRate: stale / reads, staleAgeSec: stale ? age / stale : 0 }
}

// Shrinks keys, memory and traffic by one factor so per-key request rates and the cached fraction are preserved
export function scaleForSim(p: Params, maxKeys = 1e6): Params {
  const f = Math.min(1, maxKeys / p.sys.keys)
  return { sys: { ...p.sys, keys: Math.round(p.sys.keys * f), rps: p.sys.rps * f, wps: p.sys.wps * f }, redis: { ...p.redis, memGB: p.redis.memGB * f } }
}
