import { expect, test } from 'vitest'
import { DEFAULTS } from '../src/contract/inputs'
import { evaluate } from '../src/engine/model'
import { simulate } from '../src/engine/sim'
import type { Params } from '../src/contract/types'

const [N, rps, wps] = [2e4, 1000, 200]
let worst = 0, worstAge = 0

// Grid: skew x cached fraction x write policy x TTL (none, equal to the eviction age Tc, far below Tc)
for (const alpha of [0, 0.8, 1.2, 2]) for (const frac of [0.01, 0.1]) for (const writePolicy of ['ttl-only', 'invalidate'] as const)
  test(`model matches simulation within 2pp: α=${alpha} C/N=${frac} ${writePolicy}`, () => {
    // objBytes 900 plus 100 B overhead makes capacity exactly memGB * 1e6 keys
    const base: Params = { sys: { ...DEFAULTS.sys, keys: N, objBytes: 900, alpha, rps, wps }, redis: { ...DEFAULTS.redis, memGB: (N * frac) / 1e6, ttlSec: Infinity, writePolicy } }
    const tc = evaluate(base).evictionAgeSec
    for (const ttlSec of [Infinity, tc, tc / 10]) {
      const params = { ...base, redis: { ...base.redis, ttlSec } }
      const m = evaluate(params)
      // Long enough to fill the cache several times over, so the measured half is stationary
      const requests = Math.min(8e6, Math.max(5e5, 8 * (rps + wps) * tc))
      const s = simulate({ id: 0, params, requests, seed: 1 })
      const d = Math.max(Math.abs(m.missRate - s.missRate), Math.abs(m.staleRate - s.staleRate))
      worst = Math.max(worst, d)
      // Stale age is a duration, so it is compared relatively, where enough stale reads were sampled. Hot keys all start
      // their first TTL cycle at time zero, so the measured half must span many cycles or it samples cache ages unevenly.
      if (s.staleRate > 0.02 && requests / (rps + wps) > 40 * ttlSec) {
        worstAge = Math.max(worstAge, Math.abs(m.staleAgeSec / s.staleAgeSec - 1))
        expect(Math.abs(m.staleAgeSec / s.staleAgeSec - 1), `ttl=${ttlSec} stale age model=${m.staleAgeSec} sim=${s.staleAgeSec}`).toBeLessThan(0.1)
      }
      expect(d, `ttl=${ttlSec} model=${m.missRate}/${m.staleRate} sim=${s.missRate}/${s.staleRate}`).toBeLessThan(0.02)
    }
  })

test('worst deviation over the grid stays under 0.5pp', () => {
  console.log(`max |model - sim| over the grid: ${(worst * 100).toFixed(2)}pp; stale age within ${(worstAge * 100).toFixed(1)}%`)
  expect(worst).toBeLessThan(0.005)
})
