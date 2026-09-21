// The system being designed: workload plus backing database
export interface SystemConfig {
  keys: number // distinct keys
  objBytes: number // uniform object size; dataset size = keys * objBytes
  alpha: number // Zipf exponent, 0..2.5
  rps: number // reads per second
  wps: number // writes per second, sharing the read popularity distribution
  dbP50Ms: number
  dbP99Ms: number
  dbCapacityQps: number
}

// The Redis choices under review
export interface RedisConfig {
  memGB: number
  ttlSec: number // Infinity means no TTL
  writePolicy: 'ttl-only' | 'invalidate' // ttl-only: writes skip the cache; invalidate: writes delete the key
  pricePerGBMonth: number
  availability: number // fraction of time Redis is up, 0..1
  p50Ms: number
  p99Ms: number
  timeoutMs: number // paid by every request while Redis is down
}

export interface Params {
  sys: SystemConfig
  redis: RedisConfig
}

export interface Percentiles {
  p50: number
  p75: number
  p90: number
  p99: number
}

export interface Outputs {
  missRate: number
  staleRate: number // fraction of all reads served stale
  staleAgeSec: number // how long the returned value had been out of date, averaged over stale reads; Infinity if never corrected
  evictionAgeSec: number // Che characteristic time Tc; Infinity when memory never fills
  binding: 'ttl' | 'capacity' // 'capacity' when Tc < ttlSec
  memUsedGB: number
  costPerMonth: number
  latency: Percentiles // with cache, ms
  baseline: Percentiles // database only, ms
  dbLoad: { withCache: number; noCache: number; redisDown: number } // utilisation; >= 1 is overload
}

export interface Curves {
  missVsMem: { memGB: number; miss: number; ideal: number }[] // ideal: cache holding exactly the hottest keys
  vsTtl: { ttlSec: number; miss: number; stale: number }[]
  latencyCdf: { ms: number; withCache: number; baseline: number }[]
}

export interface SimRequest {
  id: number
  params: Params
  requests: number
  seed: number
}

export interface SimResult {
  id: number
  missRate: number
  staleRate: number
  staleAgeSec: number // mean time since the overwriting write, over stale reads; 0 when there were none
}

export interface Advice {
  level: 'good' | 'warn' | 'bad'
  title: string
  detail: string
}

// One numeric slider; key names a field of the config selected by group
export interface InputSpec {
  key: string
  group: 'system' | 'redis'
  label: string
  unit: string
  min: number
  max: number
  log: boolean
  random?: [number, number] // plausible range drawn by randomSystem
}
