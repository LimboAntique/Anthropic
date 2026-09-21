import { evaluate } from './model'
import type { Params, SimRequest, SimResult } from './types'

// STUB: echoes the model with a small seeded offset instead of simulating
export function simulate(r: SimRequest): SimResult {
  const o = evaluate(r.params)
  return { id: r.id, missRate: Math.min(1, o.missRate + ((r.seed % 7) - 3) / 200), staleRate: o.staleRate }
}

// Shrinks keys, memory and traffic by one factor so per-key request rates and the cached fraction are preserved
export function scaleForSim(p: Params, maxKeys = 1e6): Params {
  const f = Math.min(1, maxKeys / p.sys.keys)
  return { sys: { ...p.sys, keys: p.sys.keys * f, rps: p.sys.rps * f, wps: p.sys.wps * f }, redis: { ...p.redis, memGB: p.redis.memGB * f } }
}
