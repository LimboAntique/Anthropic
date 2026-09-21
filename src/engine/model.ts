import type { Curves, Outputs, Params } from '../contract/types'

// STUB: placeholder shapes so the UI can be built against the contract; hit rate is just capacity / keys
const miss = (p: Params, memGB = p.redis.memGB) => Math.max(0, 1 - (memGB * 1e9) / ((p.sys.objBytes + 100) * p.sys.keys))

export function evaluate(p: Params): Outputs {
  const { sys, redis } = p
  const m = miss(p)
  const pct = (p50: number, p99: number) => ({ p50, p75: (p50 * 3 + p99) / 4, p90: (p50 + p99) / 2, p99 })
  return {
    missRate: m,
    staleRate: 0,
    evictionAgeSec: Infinity,
    binding: 'ttl',
    memUsedGB: redis.memGB,
    costPerMonth: redis.memGB * redis.pricePerGBMonth,
    latency: pct(m > 0.5 ? sys.dbP50Ms : redis.p50Ms, sys.dbP99Ms + redis.p50Ms),
    baseline: pct(sys.dbP50Ms, sys.dbP99Ms),
    dbLoad: { withCache: (sys.rps * m + sys.wps) / sys.dbCapacityQps, noCache: (sys.rps + sys.wps) / sys.dbCapacityQps, redisDown: (sys.rps + sys.wps) / sys.dbCapacityQps },
  }
}

export function curves(p: Params): Curves {
  const steps = Array.from({ length: 50 }, (_, i) => i / 49)
  return {
    missVsMem: steps.map((t) => 0.01 * 1e5 ** t).map((memGB) => ({ memGB, miss: miss(p, memGB), ideal: miss(p, memGB) ** 2 })),
    vsTtl: steps.map((t) => 2592000 ** t).map((ttlSec) => ({ ttlSec, miss: 1 / (1 + ttlSec / 60), stale: 1 - 1 / (1 + ttlSec / 86400) })),
    latencyCdf: steps.map((t) => 0.1 * 1e4 ** t).map((ms) => ({ ms, withCache: 1 - Math.exp(-ms / p.redis.p50Ms), baseline: 1 - Math.exp(-ms / p.sys.dbP50Ms) })),
  }
}
