import type { Advice, Outputs, Params } from '../contract/types'
import { evaluate } from './model'

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`
const dur = (s: number) => (s < 90 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(0)} min` : s < 129600 ? `${(s / 3600).toFixed(0)} h` : `${(s / 86400).toFixed(0)} d`)
const RANK = { bad: 0, warn: 1, good: 2 }

// Every rule that fires, most severe first; element 0 is the headline verdict
export function advise(p: Params, o: Outputs): Advice[] {
  const { redis } = p
  const out: Advice[] = []
  const add = (level: Advice['level'], when: boolean, title: string, detail: () => string) => when && out.push({ level, title, detail: detail() })
  const alt = (r: Partial<Params['redis']>) => evaluate({ ...p, redis: { ...redis, ...r } })

  add('bad', o.staleRate > 0.1, 'Serving stale data', () => `${pct(o.staleRate)} of reads return a value that has already been overwritten, on average ${o.staleAgeSec === Infinity ? 'indefinitely' : dur(o.staleAgeSec)} out of date. Hot keys are also written most often, so a long TTL keeps them stale; shorten the TTL or invalidate on write.`)
  add('bad', o.latency.p50 > 0.9 * o.baseline.p50, 'Redis is pure overhead', () => `${pct(o.missRate)} of reads miss and pay Redis plus the database, so even the median request is no faster than without a cache.`)
  add('bad', o.dbLoad.withCache >= 1, 'Database overloaded even with the cache', () => `Misses and writes still send ${pct(o.dbLoad.withCache)} of what the database can take.`)

  add('warn', o.binding === 'ttl' && o.memUsedGB < 0.5 * redis.memGB, 'Paying for empty memory', () => `Keys expire before memory fills: only ${o.memUsedGB.toPrecision(2)} of ${redis.memGB} GB is ever used. A longer TTL or a smaller instance gives the same hit rate.`)
  add('warn', o.latency.p99 > 0.5 * o.baseline.p99, 'P99 is still a database read', () => `With ${pct(o.missRate)} misses the slowest 1% of requests are all misses, so P99 stays at ${o.latency.p99.toFixed(0)} ms while P50 drops to ${o.latency.p50.toFixed(1)} ms.`)
  add('warn', o.dbLoad.redisDown >= 1 && o.dbLoad.withCache < 1, 'The cache is load-bearing', () => `Without Redis the database would see ${pct(o.dbLoad.redisDown)} of its capacity. A Redis outage or a cold restart becomes a full outage, and the system may not recover on its own.`)
  add('warn', o.staleRate > 0.01 && o.staleRate <= 0.1, 'Some reads are stale', () => `${pct(o.staleRate)} of reads are out of date, by ${dur(o.staleAgeSec)} on average. Whether that is acceptable depends on the data; the TTL is the knob.`)
  add('warn', o.binding === 'capacity' && redis.ttlSec > 10 * o.evictionAgeSec, 'The TTL does nothing for cold keys', () => `Memory pressure evicts a key after about ${dur(o.evictionAgeSec)} without a read, long before the ${redis.ttlSec === Infinity ? 'missing' : dur(redis.ttlSec)} TTL. Only keys read more often than that live to see it.`)
  add('warn', redis.availability < 0.99, 'Outages reach P99', () => `Redis is down ${pct(1 - redis.availability)} of the time and every request then waits ${redis.timeoutMs} ms before falling back, which is now inside the slowest 1%.`)
  add('warn', redis.writePolicy === 'invalidate' && o.missRate - alt({ writePolicy: 'ttl-only' }).missRate > 0.05, 'Writes keep emptying the cache', () => `Deleting on write costs ${pct(o.missRate - alt({ writePolicy: 'ttl-only' }).missRate)} extra misses: hot keys are rewritten before they are read again.`)
  add('warn', redis.memGB > 0.02 && alt({ memGB: redis.memGB / 2 }).missRate - o.missRate < 0.005, 'Half the memory would do', () => `Halving memory to ${redis.memGB / 2} GB raises the miss rate by under half a point and saves $${(o.costPerMonth / 2).toFixed(0)} a month.`)

  add('good', !out.some((a) => a.level === 'bad'), 'Redis helps', () => `${pct(1 - o.missRate)} of reads are served from memory and database load falls from ${pct(o.dbLoad.noCache)} to ${pct(o.dbLoad.withCache)} of capacity.`)
  return out.sort((a, b) => RANK[a.level] - RANK[b.level])
}
