import { expect, test } from 'vitest'
import { DEFAULTS } from '../src/contract/inputs'
import { scaleForSim, simulate } from '../src/engine/sim'
import type { Params } from '../src/contract/types'

// objBytes 900 plus 100 B overhead makes capacity exactly memGB * 1e6 keys
const params = (sys: Partial<Params['sys']>, redis: Partial<Params['redis']>): Params => ({
  sys: { ...DEFAULTS.sys, objBytes: 900, wps: 0, ...sys },
  redis: { ...DEFAULTS.redis, ttlSec: Infinity, ...redis },
})
const run = (p: Params, requests = 4e5, seed = 1) => simulate({ id: 7, params: p, requests, seed })

test('uniform popularity without TTL hits with probability C/N', () => {
  const r = run(params({ keys: 1e4, alpha: 0 }, { memGB: 1e-3 }))
  expect(r.missRate).toBeCloseTo(0.9, 2)
  expect(r.staleRate).toBe(0)
  expect(r.id).toBe(7)
})

test('a cache that holds every key stops missing', () => {
  expect(run(params({ keys: 1e3, alpha: 1 }, { memGB: 1e-3 })).missRate).toBeLessThan(0.005)
})

test('no memory means every read misses', () => {
  expect(run(params({ keys: 1e3 }, { memGB: 1e-7 }), 1e4).missRate).toBe(1)
})

// Single key, rate λ, TTL T: a cycle is one miss plus Poisson(λℓ) hits, where ℓ is the expected cached time
const [lam, w, T] = [1, 0.5, 2]
const l = -Math.expm1(-w * T) / w // expected time until the first write or expiry

test('single key with TTL hits λT/(1+λT)', () => {
  expect(run(params({ keys: 1, rps: lam }, { ttlSec: T })).missRate).toBeCloseTo(1 / (1 + lam * T), 2)
})

test('single key, ttl-only writes: hit rate unchanged, reads after the first write are stale', () => {
  const r = run(params({ keys: 1, rps: lam, wps: w }, { ttlSec: T }))
  expect(r.missRate).toBeCloseTo(1 / (1 + lam * T), 2)
  expect(r.staleRate).toBeCloseTo((lam * (T - l)) / (1 + lam * T), 2)
})

test('single key, invalidating writes: cached time shrinks to ℓ and nothing is stale', () => {
  const r = run(params({ keys: 1, rps: lam, wps: w }, { ttlSec: T, writePolicy: 'invalidate' }))
  expect(r.missRate).toBeCloseTo(1 / (1 + lam * l), 2)
  expect(r.staleRate).toBe(0)
})

test('same seed reproduces the result, scaling preserves keys-to-memory ratio', () => {
  const p = scaleForSim(DEFAULTS, 1e4)
  expect(run(p, 1e5, 3)).toEqual(run(p, 1e5, 3))
  expect(run(p, 1e5, 3)).not.toEqual(run(p, 1e5, 4))
  expect(p.sys.keys).toBe(1e4)
  expect(p.redis.memGB / p.sys.keys).toBeCloseTo(DEFAULTS.redis.memGB / DEFAULTS.sys.keys, 15)
})

test('1e6 keys x 5e6 requests finishes within 3 s', () => {
  const t = performance.now()
  run(scaleForSim(DEFAULTS), 5e6)
  expect(performance.now() - t).toBeLessThan(3000)
})

test('worker answers a SimRequest with the matching SimResult', async () => {
  const g = globalThis as unknown as { postMessage: (m: unknown) => void; onmessage: (e: { data: unknown }) => void }
  let reply: unknown
  g.postMessage = (m) => (reply = m)
  g.onmessage = () => {} // declares the global that the worker module assigns
  await import('../src/engine/worker')
  const req = { id: 9, params: scaleForSim(DEFAULTS, 1e3), requests: 1e4, seed: 2 }
  g.onmessage({ data: req })
  expect(reply).toEqual(simulate(req))
})
