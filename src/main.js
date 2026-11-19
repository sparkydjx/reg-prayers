import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { getDevotion, listDevotions, prayers } from './data/prayers.js'

registerSW({ immediate: true })

const app = document.querySelector('#app')
const LANG_KEY = 'reg-prayers-lang'

function currentLang() {
  const saved = localStorage.getItem(LANG_KEY)
  return saved === 'la' || saved === 'both' ? saved : 'en'
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatText(value) {
  return escapeHtml(value)
    .split('\n')
    .map((line) => `<span class="verse">${line}</span>`)
    .join('')
}

function renderHome() {
  const items = listDevotions()
    .map(
      (devotion) => `
        <li>
          <button type="button" data-devotion="${devotion.id}">
            ${escapeHtml(devotion.title)}
          </button>
        </li>
      `
    )
    .join('')

  app.innerHTML = `
    <main class="app">
      <h1>Prayers</h1>
      <ul class="prayer-list">${items}</ul>
    </main>
  `

  app.querySelectorAll('[data-devotion]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = button.getAttribute('data-devotion')
    })
  })
}

function verseBlock(leader, response) {
  return `
    <div>
      <p><span class="verse-label">V.</span> ${escapeHtml(leader)}</p>
      <p><span class="verse-label">R.</span> ${escapeHtml(response)}</p>
    </div>
  `
}

function prayerBlock(title, text, omitTitle) {
  const heading = omitTitle || !title ? '' : `<h2>${escapeHtml(title)}</h2>`
  return `
    <div>
      ${heading}
      <p>${formatText(text)}</p>
    </div>
  `
}

function renderStep(step, lang, pageTitle) {
  if (step.type === 'section') {
    const english = `<div><h2>${escapeHtml(step.title)}</h2></div>`
    const latin = `<div><h2>${escapeHtml(step.latinTitle)}</h2></div>`
    const body = lang === 'la' ? latin : lang === 'both' ? english + latin : english
    return `<section class="step section ${lang === 'both' ? 'bilingual' : ''}">${body}</section>`
  }

  if (step.type === 'note') {
    const english = `<div><p class="note">${escapeHtml(step.text)}</p></div>`
    const latin = `<div><p class="note">${escapeHtml(step.latinText)}</p></div>`
    const body = lang === 'la' ? latin : lang === 'both' ? english + latin : english
    return `<section class="step ${lang === 'both' ? 'bilingual' : ''}">${body}</section>`
  }

  if (step.type === 'dialogue') {
    const english = verseBlock(step.leader, step.response)
    const latin = verseBlock(step.latinLeader, step.latinResponse)
    const body =
      lang === 'la' ? latin : lang === 'both' ? english + latin : english
    return `<section class="step dialogue ${lang === 'both' ? 'bilingual' : ''}">${body}</section>`
  }

  const prayer = prayers[step.id]
  if (!prayer) return ''
  const sameAsPage = prayer.title === pageTitle
  const englishLines = prayer.text.split('\n')
  const latinLines = prayer.latinText.split('\n')
  if (lang === 'both' && englishLines.length > 1 && englishLines.length === latinLines.length) {
    const rows = englishLines
      .map(
        (line, index) => `
          <div class="bilingual line">
            <div><p>${escapeHtml(line)}</p></div>
            <div><p>${escapeHtml(latinLines[index])}</p></div>
          </div>
        `
      )
      .join('')
    return `<section class="step lines">${rows}</section>`
  }
  const english = prayerBlock(prayer.title, prayer.text, sameAsPage)
  const hideLatinTitle = prayer.latinTitle === pageTitle || (lang === 'both' && sameAsPage)
  const latin = prayerBlock(prayer.latinTitle, prayer.latinText, hideLatinTitle)
  const body = lang === 'la' ? latin : lang === 'both' ? english + latin : english
  return `<section class="step ${lang === 'both' ? 'bilingual' : ''}">${body}</section>`
}

function languageControl(lang) {
  const option = (value, label) => `
    <button type="button" data-lang="${value}" aria-pressed="${lang === value}">
      ${label}
    </button>
  `
  return `
    <div class="lang" role="group" aria-label="Language">
      ${option('en', 'English')}
      ${option('la', 'Latin')}
      ${option('both', 'Both')}
    </div>
  `
}

function mysteryControl(devotion) {
  if (!devotion.sets) return ''
  const buttons = devotion.sets
    .map(
      (set) => `
        <button type="button" data-set="${set.id}" aria-pressed="${set.id === devotion.activeSet.id}">
          ${escapeHtml(set.label)}
        </button>
      `
    )
    .join('')
  return `
    <div class="lang" role="group" aria-label="Mysteries">${buttons}</div>
    <p class="days">${escapeHtml(devotion.activeSet.title)}. Traditionally prayed on ${escapeHtml(devotion.activeSet.days)}.</p>
  `
}

function renderDevotion(devotion) {
  const lang = currentLang()
  const columns =
    lang === 'both'
      ? `<div class="column-labels" aria-hidden="true"><span>English</span><span>Latin</span></div>`
      : ''
  app.innerHTML = `
    <main class="app${lang === 'both' ? ' app--both' : ''}">
      <button type="button" class="back" id="back">Prayers</button>
      <h1>${escapeHtml(devotion.title)}</h1>
      ${mysteryControl(devotion)}
      ${languageControl(lang)}
      ${columns}
      ${devotion.steps.map((step) => renderStep(step, lang, devotion.title)).join('')}
    </main>
  `

  document.querySelector('#back').addEventListener('click', () => {
    history.pushState(null, '', location.pathname + location.search)
    renderHome()
  })

  app.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem(LANG_KEY, button.getAttribute('data-lang'))
      renderDevotion(devotion)
    })
  })

  app.querySelectorAll('[data-set]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = `rosary-${button.getAttribute('data-set')}`
    })
  })
}

function render() {
  const id = location.hash.replace(/^#/, '')
  const devotion = id ? getDevotion(id) : undefined
  if (devotion) {
    renderDevotion(devotion)
    return
  }
  renderHome()
}

window.addEventListener('hashchange', render)
render()
