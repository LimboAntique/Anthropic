import { draw, type Drawn } from '../engine/quiz'
import './style.css'
import './exam.css'

const OWLS = import.meta.glob('../../cat_teacher/proctor_*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const $ = (id: string) => document.getElementById(id)!
const paper = $('paper') as HTMLFormElement
let sheet: Drawn[] = []

function proctor(face: string, line: string) {
  ;($('owl') as HTMLImageElement).src = OWLS[`../../cat_teacher/proctor_${face}.svg`]
  $('says').textContent = line
}

const answered = () => sheet.filter((_, i) => paper.querySelector(`input[name=q${i}]:checked`)).length

function start() {
  sheet = draw()
  paper.innerHTML =
    sheet.map((x, i) => `<fieldset><legend>${i + 1}. ${x.q}</legend>${x.options.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}" required />${o}</label>`).join('')}</fieldset>`).join('') +
    '<button>Hand in</button>'
  proctor('watching', 'Eyes on your own paper. No peeking at the sliders.')
  scrollTo(0, 0)
}

// The owl glances sideways while the paper is half done
paper.onchange = () => answered() < sheet.length && proctor(answered() % 2 ? 'peeking' : 'watching', `${answered()} of ${sheet.length} answered. I am watching.`)

paper.onsubmit = (e) => {
  e.preventDefault()
  let score = 0
  paper.querySelectorAll('fieldset').forEach((f, i) => {
    const pick = Number((f.querySelector('input:checked') as HTMLInputElement).value)
    if (pick === sheet[i].answer) score++
    f.querySelectorAll('label').forEach((l, j) => l.classList.add(j === sheet[i].answer ? 'right' : j === pick ? 'wrong' : 'plain'))
    f.querySelectorAll('input').forEach((x) => (x.disabled = true))
    f.insertAdjacentHTML('beforeend', `<p class="why">${sheet[i].why}</p>`)
  })
  paper.querySelector('button')!.remove()
  paper.insertAdjacentHTML('afterbegin', `<p id="score">${score} / ${sheet.length}</p>`)
  paper.insertAdjacentHTML('beforeend', '<button type="button" id="again">Sit another paper</button>')
  $('again').onclick = start
  const pass = score >= 4
  proctor(pass ? 'pass' : 'fail', pass ? (score === sheet.length ? 'Full marks. You may leave early.' : 'A pass. Read the one you missed.') : 'Back to the explorer with you. Try the presets, then sit it again.')
  scrollTo(0, 0)
}

start()
