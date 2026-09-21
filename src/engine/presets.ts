import { DEFAULTS } from '../contract/inputs'
import type { Params } from '../contract/types'

export const PRESETS: { name: string; blurb: string; params: Params }[] = [{ name: 'Default', blurb: 'Skewed read-heavy workload with a small cache', params: DEFAULTS }]
