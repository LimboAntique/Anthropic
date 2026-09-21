import { expect, test } from 'vitest'
import { DEFAULTS } from '../src/contract/inputs'
import type { Params } from '../src/contract/types'
import { evaluate } from '../src/engine/model'
import { BANK, draw } from '../src/engine/quiz'

const mk = (sys: Partial<Params['sys']> = {}, redis: Partial<Params['redis']> = {}): Params => ({ sys: { ...DEFAULTS.sys, ...sys }, redis: { ...DEFAULTS.redis, ...redis } })

test('the bank has 50 distinct questions, each with four distinct options and an explanation', () => {
  expect(BANK.length).toBe(50)
  expect(new Set(BANK.map((x) => x.q)).size).toBe(50)
  for (const x of BANK) {
    expect(new Set(x.options).size, x.q).toBe(4)
    expect(x.why.length, x.q).toBeGreaterThan(20)
  }
})

test('draw returns distinct questions whose answer index still points at the correct option', () => {
  for (let n = 0; n < 50; n++) {
    const d = draw()
    expect(new Set(d.map((x) => x.q)).size).toBe(5)
    for (const x of d) expect(x.options[x.answer]).toBe(BANK.find((b) => b.q === x.q)!.options[0])
  }
  expect(new Set(Array.from({ length: 40 }, () => draw(1)[0].answer)).size).toBe(4)
})

// The numeric claims made by the bank, checked against the model so the two cannot drift apart
test('claims in the bank agree with the model', () => {
  const noTtl = { ttlSec: Infinity }
  expect(1 - evaluate(mk({ alpha: 0, keys: 1e6, objBytes: 900, wps: 0 }, { memGB: 0.1, ...noTtl })).missRate).toBeCloseTo(0.1, 3)
  expect(evaluate(mk({ rps: 1e3, wps: 0 }, noTtl)).missRate).toBeCloseTo(evaluate(mk({ rps: 1e4, wps: 0 }, noTtl)).missRate, 6)
  expect(evaluate(mk({ alpha: 1.4, wps: 0 }, noTtl)).missRate).toBeLessThan(evaluate(mk({ alpha: 0.6, wps: 0 }, noTtl)).missRate)
  expect(evaluate(mk({ wps: 100 }, { ttlSec: 3600 })).staleRate).toBeGreaterThan(0.5)

  const hour = evaluate(mk({ wps: 0 }, { ttlSec: 3600 }))
  expect(hour.evictionAgeSec).toBeLessThan(600)
  expect(hour.missRate - evaluate(mk({ wps: 0 }, { ttlSec: 86400 })).missRate).toBeLessThan(0.01)

  const short = evaluate(mk({ wps: 0 }, { memGB: 8, ttlSec: 5 }))
  expect(short.binding).toBe('ttl')
  expect(short.missRate).toBeCloseTo(evaluate(mk({ wps: 0 }, { memGB: 16, ttlSec: 5 })).missRate, 9)

  const inv = evaluate(mk({ wps: 2000 }, { writePolicy: 'invalidate' }))
  expect(inv.staleRate).toBe(0)
  expect(inv.missRate).toBeGreaterThan(evaluate(mk({ wps: 2000 })).missRate)

  const flat = evaluate(mk({ alpha: 0, wps: 0 }))
  expect(flat.latency.p99).toBeGreaterThan(flat.baseline.p99)
  expect(evaluate(mk({ wps: 0 }, { availability: 0.98 })).latency.p99).toBeGreaterThan(100)

  const down = evaluate(mk({ rps: 1e4, wps: 0, dbCapacityQps: 5000 }))
  expect(down.dbLoad.redisDown).toBeCloseTo(2, 9)
  expect(down.dbLoad.withCache).toBeLessThan(1)
})
