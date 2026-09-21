import { DEFAULTS } from './inputs'
import type { Params } from './types'

export const PRESETS: { name: string; blurb: string; params: Params }[] = [{ name: 'Default', blurb: 'Skewed read-heavy workload with a small cache', params: DEFAULTS }]
