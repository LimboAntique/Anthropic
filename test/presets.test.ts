import { expect, test } from 'vitest'
import { advise } from '../src/engine/advisor'
import { evaluate } from '../src/engine/model'
import { PRESETS } from '../src/engine/presets'

const VERDICT: Record<string, string> = {
  'Redis helps': 'Redis helps',
  'Uniform access': 'Redis is pure overhead',
  'TTL too short': 'Paying for empty memory',
  'Hot keys are written too': 'Serving stale data',
  'P99 barely moves': 'P99 is still a database read',
}

test.each(PRESETS)('preset "$name" demonstrates its verdict', ({ name, params }) => {
  const o = evaluate(params)
  const a = advise(params, o)
  console.log(name, '→', a.map((x) => x.title).join(' | '), `miss=${o.missRate.toFixed(3)} stale=${o.staleRate.toFixed(3)} p50=${o.latency.p50.toFixed(2)} p99=${o.latency.p99.toFixed(1)} used=${o.memUsedGB.toFixed(2)}`)
  expect(a[0].title).toBe(VERDICT[name])
})
