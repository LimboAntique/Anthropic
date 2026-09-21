import type { InputSpec, Params, SystemConfig } from './types'

export const INPUTS: InputSpec[] = [
  { key: 'keys', group: 'system', label: 'Distinct keys', unit: '', min: 1e3, max: 1e9, log: true, random: [1e5, 1e8] },
  { key: 'objBytes', group: 'system', label: 'Object size', unit: 'B', min: 64, max: 1e6, log: true, random: [128, 16384] },
  { key: 'alpha', group: 'system', label: 'Zipf skew α', unit: '', min: 0, max: 2.5, log: false, random: [0.4, 1.8] },
  { key: 'rps', group: 'system', label: 'Reads', unit: '/s', min: 1, max: 1e6, log: true, random: [1e2, 1e5] },
  { key: 'wps', group: 'system', label: 'Writes', unit: '/s', min: 0, max: 1e5, log: true },
  { key: 'dbP50Ms', group: 'system', label: 'DB latency P50', unit: 'ms', min: 0.5, max: 500, log: true, random: [2, 50] },
  { key: 'dbP99Ms', group: 'system', label: 'DB latency P99', unit: 'ms', min: 0.5, max: 5000, log: true },
  { key: 'dbCapacityQps', group: 'system', label: 'DB capacity', unit: 'qps', min: 10, max: 1e6, log: true },
  { key: 'memGB', group: 'redis', label: 'Memory', unit: 'GB', min: 0.01, max: 1024, log: true },
  { key: 'ttlSec', group: 'redis', label: 'TTL', unit: 's', min: 1, max: 2592000, log: true },
  { key: 'pricePerGBMonth', group: 'redis', label: 'Price', unit: '$/GB·mo', min: 1, max: 100, log: false },
  { key: 'availability', group: 'redis', label: 'Availability', unit: '', min: 0.9, max: 1, log: false },
  { key: 'p50Ms', group: 'redis', label: 'Redis latency P50', unit: 'ms', min: 0.1, max: 50, log: true },
  { key: 'p99Ms', group: 'redis', label: 'Redis latency P99', unit: 'ms', min: 0.1, max: 500, log: true },
  { key: 'timeoutMs', group: 'redis', label: 'Client timeout', unit: 'ms', min: 1, max: 5000, log: true },
]

export const DEFAULTS: Params = {
  sys: { keys: 1e7, objBytes: 1024, alpha: 1, rps: 1e4, wps: 100, dbP50Ms: 5, dbP99Ms: 50, dbCapacityQps: 2e4 },
  redis: { memGB: 1, ttlSec: 3600, writePolicy: 'ttl-only', pricePerGBMonth: 16, availability: 0.999, p50Ms: 0.5, p99Ms: 2, timeoutMs: 100 },
}

// Log-uniform draw from [lo, hi]
const logU = (lo: number, hi: number) => lo * (hi / lo) ** Math.random()

// Draws a plausible system: spec ranges for independent fields, ratios for fields tied to rps or dbP50Ms
export function randomSystem(): SystemConfig {
  const s = { ...DEFAULTS.sys } as Record<string, number>
  for (const i of INPUTS) if (i.random) s[i.key] = i.log ? logU(...i.random) : i.random[0] + Math.random() * (i.random[1] - i.random[0])
  s.wps = s.rps * logU(0.001, 0.3)
  s.dbP99Ms = s.dbP50Ms * logU(3, 20)
  s.dbCapacityQps = s.rps * logU(0.3, 3)
  return s as unknown as SystemConfig
}
