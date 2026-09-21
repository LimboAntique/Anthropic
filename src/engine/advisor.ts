import type { Advice, Outputs, Params } from '../contract/types'

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`
const RANK = { bad: 0, warn: 1, good: 2 }

// Every rule that fires, most severe first; element 0 is the headline verdict
export function advise(p: Params, o: Outputs): Advice[] {
  const { redis } = p
  const out: Advice[] = []
  if (o.staleRate > 0.1)
    out.push({ level: 'bad', title: 'Serving stale data', detail: `${pct(o.staleRate)} of reads return a value that has already been overwritten. Hot keys are also written most often, so a long TTL keeps them stale; shorten the TTL or invalidate on write.` })
  if (o.latency.p50 > 0.9 * o.baseline.p50)
    out.push({ level: 'bad', title: 'Redis is pure overhead', detail: `${pct(o.missRate)} of reads miss and pay Redis plus the database, so even the median request is no faster than without a cache.` })
  if (o.binding === 'ttl' && o.memUsedGB < 0.5 * redis.memGB)
    out.push({ level: 'warn', title: 'Paying for empty memory', detail: `Keys expire before memory fills: only ${o.memUsedGB.toPrecision(2)} of ${redis.memGB} GB is ever used. A longer TTL or a smaller instance gives the same hit rate.` })
  if (o.latency.p99 > 0.5 * o.baseline.p99)
    out.push({ level: 'warn', title: 'P99 is still a database read', detail: `With ${pct(o.missRate)} misses the slowest 1% of requests are all misses, so P99 stays at ${o.latency.p99.toFixed(0)} ms while P50 drops to ${o.latency.p50.toFixed(1)} ms.` })
  if (!out.some((a) => a.level === 'bad')) out.push({ level: 'good', title: 'Redis helps', detail: `${pct(1 - o.missRate)} of reads are served from memory and database load falls from ${pct(o.dbLoad.noCache)} to ${pct(o.dbLoad.withCache)} of capacity.` })
  return out.sort((a, b) => RANK[a.level] - RANK[b.level])
}
