import { DEFAULTS } from '../contract/inputs'
import type { Params } from '../contract/types'

const preset = (name: string, blurb: string, sys: Partial<Params['sys']>, redis: Partial<Params['redis']>) => ({ name, blurb, params: { sys: { ...DEFAULTS.sys, ...sys }, redis: { ...DEFAULTS.redis, ...redis } } as Params })

export const PRESETS = [
  preset('Redis helps', 'Skewed, read-mostly catalogue; writes delete the cached key and a one day TTL lets memory fill', { alpha: 1.2, wps: 1 }, { memGB: 4, ttlSec: 86400, writePolicy: 'invalidate' }),
  preset('Uniform access', 'Every key is equally likely, so a small cache almost never hits', { alpha: 0.1, wps: 1 }, { ttlSec: 600 }),
  preset('TTL too short', 'A 5 second TTL empties the cache faster than traffic can fill it', { alpha: 1.2, wps: 1 }, { memGB: 8, ttlSec: 5 }),
  preset('Hot keys are written too', 'One write per hundred reads, one hour TTL: the hottest keys are stale almost all the time', { wps: 100 }, { ttlSec: 3600 }),
  preset('P99 barely moves', 'A decent hit rate makes the median fast but the tail is still made of misses', { alpha: 0.9, wps: 1 }, { memGB: 2, ttlSec: 600 }),
]
