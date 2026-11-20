import './style.css'
import { registerSW } from 'virtual:pwa-register'
import {
  categoryForDevotion,
  getDevotion,
  isSection,
  listDevotions,
  prayers,
  sections
} from './data/prayers.js'

registerSW({ immediate: true })

const app = document.querySelector('#app')
const LANG_KEY = 'reg-prayers-lang'
const SECTION_KEY = 'reg-prayers-section'

function currentLang() {
  const saved = localStorage.getItem(LANG_KEY)
  return saved === 'la' || saved === 'both' ? saved : 'en'
}

/**
 * @returns {import('./data/prayers.js').DevotionCategory}
 */
function currentSection() {
  const hash = location.hash.replace(/^#/, '')
  if (isSection(hash)) return hash
  const saved = localStorage.getItem(SECTION_KEY)
  return isSection(saved || '') ? /** @type {import('./data/prayers.js').DevotionCategory} */ (saved) : 'prayers'
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function celticCrossMark() {
  return `
    <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="28" r="18" fill="none" stroke="currentColor" stroke-width="3"/>
      <path fill="currentColor" d="M29 6h6v52h-6z"/>
      <path fill="currentColor" d="M14 25h36v6H14z"/>
      <circle cx="32" cy="28" r="5" fill="none" stroke="#b08d3a" stroke-width="2"/>
    </svg>
  `
}

function formatText(value) {
  return escapeHtml(value)
    .split('\n')
    .map((line) => `<span class="verse">${line}</span>`)
    .join('')
}

function sectionLabel(sectionId) {
  return sections.find((section) => section.id === sectionId)?.label || 'Prayers'
}

function tabNav(activeSection) {
  const buttons = sections
    .map(
      (section) => `
        <button
          type="button"
          role="tab"
          class="tab"
          data-section="${section.id}"
          aria-selected="${section.id === activeSection}"
        >
          ${escapeHtml(section.label)}
        </button>
      `
    )
    .join('')

  return `
    <div class="tabs" role="tablist" aria-label="Library sections">
      ${buttons}
    </div>
  `
}

function bindSectionTabs() {
  app.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.getAttribute('data-section')
      localStorage.setItem(SECTION_KEY, section)
      location.hash = section
    })
  })
}

function renderHome(sectionId = currentSection()) {
  localStorage.setItem(SECTION_KEY, sectionId)
  const title = sectionLabel(sectionId)
  const items = listDevotions(sectionId)
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
      <header class="brand">
        ${celticCrossMark()}
        <p class="brand-eyebrow">Celtic Abbey · Anno Domini M</p>
        <h1 class="brand-title">${escapeHtml(title)}</h1>
      </header>
      ${tabNav(sectionId)}
      <ul class="prayer-list">${items || `<li class="empty">Nothing in this section yet.</li>`}</ul>
    </main>
  `

  bindSectionTabs()

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
    const hideLatinTitle = prayer.latinTitle === pageTitle || sameAsPage
    const heading =
      sameAsPage && hideLatinTitle
        ? ''
        : `
          <div class="bilingual line">
            <div>${sameAsPage ? '' : `<h2>${escapeHtml(prayer.title)}</h2>`}</div>
            <div>${hideLatinTitle ? '' : `<h2>${escapeHtml(prayer.latinTitle)}</h2>`}</div>
          </div>
        `
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
    return `<section class="step lines">${heading}${rows}</section>`
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
  const detail = devotion.activeSet.note
    ? devotion.activeSet.note
    : `${devotion.activeSet.title}. Traditionally prayed on ${devotion.activeSet.days}.`
  return `
    <div class="lang" role="group" aria-label="${escapeHtml(devotion.setsLabel || 'Mysteries')}">${buttons}</div>
    <p class="days">${escapeHtml(detail)}</p>
  `
}

function renderDevotion(devotion) {
  const lang = currentLang()
  const sectionId = devotion.category || categoryForDevotion(devotion.id)
  localStorage.setItem(SECTION_KEY, sectionId)
  const backLabel = sectionLabel(sectionId)
  const columns =
    lang === 'both'
      ? `<div class="column-labels" aria-hidden="true"><span>English</span><span>Latin</span></div>`
      : ''
  app.innerHTML = `
    <main class="app${lang === 'both' ? ' app--both' : ''}">
      <button type="button" class="back" id="back">${escapeHtml(backLabel)}</button>
      ${tabNav(sectionId)}
      <h1>${escapeHtml(devotion.title)}</h1>
      ${mysteryControl(devotion)}
      ${languageControl(lang)}
      ${columns}
      ${devotion.steps.map((step) => renderStep(step, lang, devotion.title)).join('')}
    </main>
  `

  document.querySelector('#back').addEventListener('click', () => {
    location.hash = sectionId
  })

  bindSectionTabs()

  app.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem(LANG_KEY, button.getAttribute('data-lang'))
      renderDevotion(devotion)
    })
  })

  app.querySelectorAll('[data-set]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = `${devotion.setBase}-${button.getAttribute('data-set')}`
    })
  })
}

function render() {
  const id = location.hash.replace(/^#/, '')
  if (!id || isSection(id)) {
    renderHome(id && isSection(id) ? id : currentSection())
    return
  }
  const devotion = getDevotion(id)
  if (devotion) {
    renderDevotion(devotion)
    return
  }
  renderHome()
}

window.addEventListener('hashchange', render)
render()
