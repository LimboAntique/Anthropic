import { expect, test } from 'vitest'
import { DEFAULTS } from '../src/contract/inputs'
import type { Params } from '../src/contract/types'
import { advise } from '../src/engine/advisor'
import { evaluate } from '../src/engine/model'

const titles = (sys: Partial<Params['sys']>, redis: Partial<Params['redis']>) => {
  const p: Params = { sys: { ...DEFAULTS.sys, wps: 0, ...sys }, redis: { ...DEFAULTS.redis, ...redis } }
  return advise(p, evaluate(p)).map((a) => a.title)
}

test.each([
  ['Database overloaded even with the cache', { dbCapacityQps: 1000 }, {}],
  ['The cache is load-bearing', { dbCapacityQps: 5000 }, {}],
  ['Some reads are stale', { wps: 1 }, { ttlSec: 30 }],
  ['The TTL does nothing for cold keys', {}, { ttlSec: Infinity }],
  ['Outages reach P99', {}, { availability: 0.98 }],
  ['Writes keep emptying the cache', { wps: 3000 }, { writePolicy: 'invalidate' as const }],
  ['Half the memory would do', { keys: 1e5 }, { memGB: 8, ttlSec: Infinity }],
])('rule "%s" fires', (title, sys, redis) => expect(titles(sys, redis)).toContain(title))

test('advice is sorted by severity and never praises a configuration it condemns', () => {
  for (const [sys, redis] of [[{ alpha: 0 }, {}], [{ wps: 5000 }, {}], [{}, {}]] as const) {
    const p: Params = { sys: { ...DEFAULTS.sys, ...sys }, redis: { ...DEFAULTS.redis, ...redis } }
    const levels = advise(p, evaluate(p)).map((a) => a.level)
    expect([...levels].sort((a, b) => 'bwg'.indexOf(a[0]) - 'bwg'.indexOf(b[0]))).toEqual(levels)
    expect(levels.includes('bad') && levels.includes('good')).toBe(false)
  }
})
