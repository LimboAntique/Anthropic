import { advise } from '../engine/advisor'
import { DEFAULTS } from '../contract/inputs'
import { evaluate } from '../engine/model'
import './style.css'

// STUB: dumps the default evaluation to prove the contract is wired end to end
const o = evaluate(DEFAULTS)
document.querySelector('#app')!.textContent = JSON.stringify({ outputs: o, advice: advise(DEFAULTS, o) }, null, 2)
