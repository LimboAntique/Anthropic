import { expect, test } from 'vitest'
import { DEFAULTS, INPUTS, randomSystem } from '../src/contract/inputs'
import { curves, evaluate } from '../src/engine/model'
import { scaleForSim, simulate } from '../src/engine/sim'

const all = (p: typeof DEFAULTS): Record<string, unknown> => ({ ...p.sys, ...p.redis })

test('every input spec names a config field whose default and random range lie inside the slider range', () => {
  for (const i of INPUTS) {
    const v = all(DEFAULTS)
    expect(v[i.key], i.key).toBeTypeOf('number')
    for (const x of [v[i.key] as number, ...(i.random ?? [])]) expect(x >= i.min && x <= i.max, i.key).toBe(true)
  }
})

test('random systems stay inside slider ranges', () => {
  for (let n = 0; n < 200; n++) {
    const s = randomSystem() as unknown as Record<string, number>
    for (const i of INPUTS) if (i.group === 'system') expect(s[i.key] >= i.min && s[i.key] <= i.max, `${i.key}=${s[i.key]}`).toBe(true)
  }
})

test('model and simulator accept the defaults and return finite rates', () => {
  const o = evaluate(DEFAULTS)
  expect(Object.keys(all(DEFAULTS)).length).toBe(16)
  expect(o.missRate).toBeGreaterThanOrEqual(0)
  expect(o.missRate).toBeLessThanOrEqual(1)
  expect(curves(DEFAULTS).missVsMem.length).toBeGreaterThan(0)
  expect(simulate({ id: 1, params: scaleForSim(DEFAULTS), requests: 1e4, seed: 1 }).id).toBe(1)
})
