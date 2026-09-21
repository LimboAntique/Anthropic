import { simulate } from './sim'
import type { SimRequest } from '../contract/types'

onmessage = (e: MessageEvent<SimRequest>) => postMessage(simulate(e.data))
