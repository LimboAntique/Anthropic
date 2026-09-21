import { advise } from './advisor'
import { DEFAULTS } from './inputs'
import { evaluate } from './model'
import './style.css'

// STUB: dumps the default evaluation to prove the contract is wired end to end
const o = evaluate(DEFAULTS)
document.querySelector('#app')!.textContent = JSON.stringify({ outputs: o, advice: advise(DEFAULTS, o) }, null, 2)
