import { simulate } from './sim'
import type { SimRequest } from './types'

onmessage = (e: MessageEvent<SimRequest>) => postMessage(simulate(e.data))
