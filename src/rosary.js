import { prayers } from './data/prayers.js'

const PLACE_KEY = 'reg-prayers-rosary-place'

const intentions = [
  { en: 'For the increase of faith', la: 'Pro augmento fidei' },
  { en: 'For the increase of hope', la: 'Pro augmento spei' },
  { en: 'For the increase of charity', la: 'Pro augmento caritatis' }
]

const sections = [
  { id: 'opening', label: 'Opening', aria: 'Opening' },
  { id: 'decade-0', label: '1', aria: 'Decade 1' },
  { id: 'decade-1', label: '2', aria: 'Decade 2' },
  { id: 'decade-2', label: '3', aria: 'Decade 3' },
  { id: 'decade-3', label: '4', aria: 'Decade 4' },
  { id: 'decade-4', label: '5', aria: 'Decade 5' },
  { id: 'closing', label: 'Close', aria: 'Closing' }
]

const rosaryCopy = {
  group: 'Place in the rosary',
  reset: 'Reset the rosary to the beginning',
  doneKicker: 'Closing',
  doneTitle: 'The Holy Rosary is complete'
}

const chapletCopy = {
  group: 'Place in the chaplet',
  reset: 'Reset the chaplet to the beginning',
  doneKicker: 'Closing',
  doneTitle: 'The Divine Mercy Chaplet is complete'
}

/** @type {{ move: (delta: number) => void, restart: () => void } | null} */
let session = null

if (!window.__regPrayersRosaryKeys) {
  window.__regPrayersRosaryKeys = true
  window.addEventListener('keydown', (event) => {
    if (!session) return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const target = event.target
    if (target instanceof HTMLElement && target.closest('input, textarea, select')) return
    event.preventDefault()
    if (event.key === 'ArrowRight') session.move(1)
    else session.move(-1)
  })
}

export function leaveRosary() {
  session = null
}

/**
 * @param {HTMLElement} root
 * @param {{ id: string, activeSet: { id: string, mysteryIds: string[] } }} devotion
 * @param {'en' | 'la' | 'both'} lang
 */
export function mountRosary(root, devotion, lang) {
  const set = devotion.activeSet
  mountSession(root, set.id, buildBeads(set), lang, rosaryCopy)
}

/**
 * @param {HTMLElement} root
 * @param {'en' | 'la' | 'both'} lang
 */
export function mountChaplet(root, lang) {
  mountSession(root, 'divine-mercy', buildMercyBeads(), lang, chapletCopy)
}

/**
 * @param {HTMLElement} root
 * @param {string} placeId
 * @param {Bead[]} beads
 * @param {'en' | 'la' | 'both'} lang
 * @param {{ group: string, reset: string, doneKicker: string, doneTitle: string }} copy
 */
function mountSession(root, placeId, beads, lang, copy) {
  let index = loadIndex(placeId, beads.length)

  const api = {
    move(delta) {
      if (index >= beads.length) {
        if (delta < 0) setIndex(beads.length - 1)
        return
      }
      setIndex(index + delta)
    },
    restart() {
      setIndex(0)
    }
  }
  session = api

  /**
   * @param {number} next
   */
  function setIndex(next) {
    const clamped = Math.min(beads.length, Math.max(0, next))
    if (clamped === index) return
    index = clamped
    saveIndex(placeId, index)
    draw()
  }

  function draw() {
    if (session !== api) return
    root.innerHTML = markup(beads, index, lang, copy)
    bind()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (session !== api) return
        revealPrayer()
      })
    })
  }

  function revealPrayer() {
    const prayer = root.querySelector('.rosary-prayer, .rosary-done')
    const nav = root.querySelector('.rosary-nav')
    if (!(prayer instanceof HTMLElement) || !(nav instanceof HTMLElement)) return
    const prayerBox = prayer.getBoundingClientRect()
    const navTop = nav.getBoundingClientRect().top
    const gap = 16
    if (prayerBox.height < 1) return
    if (prayerBox.bottom <= navTop - gap && prayerBox.top >= 0) return
    if (prayerBox.height <= navTop - gap) {
      const overlap = prayerBox.bottom - (navTop - gap)
      if (overlap > 0) window.scrollBy(0, overlap)
      if (prayer.getBoundingClientRect().top < 0) prayer.scrollIntoView({ block: 'start' })
      return
    }
    prayer.scrollIntoView({ block: 'start' })
  }

  function bind() {
    root.querySelector('[data-rosary="prev"]')?.addEventListener('click', () => api.move(-1))
    root.querySelector('[data-rosary="next"]')?.addEventListener('click', () => {
      if (index >= beads.length) api.restart()
      else api.move(1)
    })
    root.querySelector('[data-rosary="restart"]')?.addEventListener('click', () => api.restart())
    root.querySelectorAll('[data-rosary-section]').forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.getAttribute('data-rosary-section')
        const found = beads.findIndex((bead) => bead.section === section)
        if (found >= 0) setIndex(found)
      })
    })
    root.querySelectorAll('[data-rosary-bead]').forEach((button) => {
      button.addEventListener('click', () => {
        const found = Number(button.getAttribute('data-rosary-bead'))
        if (Number.isInteger(found)) setIndex(found)
      })
    })
  }

  draw()
}

/**
 * @param {{ id: string, mysteryIds: string[] }} set
 */
function buildBeads(set) {
  /** @type {Bead[]} */
  const beads = []
  const push = (bead) => {
    beads.push(bead)
  }

  push({ section: 'opening', prayerId: 'sign-of-the-cross', kind: 'cross' })
  push({ section: 'opening', prayerId: 'apostles-creed', kind: 'creed' })
  push({ section: 'opening', prayerId: 'our-father', kind: 'our-father' })
  intentions.forEach((intention, position) => {
    push({
      section: 'opening',
      prayerId: 'hail-mary',
      kind: 'hail-mary',
      repeat: position + 1,
      repeatTotal: 3,
      intention
    })
  })
  push({ section: 'opening', prayerId: 'glory-be', kind: 'glory' })
  push({ section: 'opening', prayerId: 'fatima-decade-prayer', kind: 'fatima' })

  set.mysteryIds.forEach((mysteryId, decade) => {
    const section = `decade-${decade}`
    push({ section, prayerId: mysteryId, kind: 'mystery', decade, mysteryId })
    push({ section, prayerId: 'our-father', kind: 'our-father', decade, mysteryId })
    for (let repeat = 1; repeat <= 10; repeat += 1) {
      push({
        section,
        prayerId: 'hail-mary',
        kind: 'hail-mary',
        decade,
        mysteryId,
        repeat,
        repeatTotal: 10
      })
    }
    push({ section, prayerId: 'glory-be', kind: 'glory', decade, mysteryId })
    push({ section, prayerId: 'fatima-decade-prayer', kind: 'fatima', decade, mysteryId })
  })

  push({ section: 'closing', prayerId: 'hail-holy-queen', kind: 'closing' })
  push({ section: 'closing', prayerId: 'final-rosary-prayer', kind: 'closing' })
  push({ section: 'closing', prayerId: 'sign-of-the-cross', kind: 'cross' })
  return beads
}

function buildMercyBeads() {
  /** @type {Bead[]} */
  const beads = []
  const push = (bead) => {
    beads.push(bead)
  }

  push({ section: 'opening', prayerId: 'sign-of-the-cross', kind: 'cross' })
  push({ section: 'opening', prayerId: 'mercy-opening', kind: 'opening' })
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    push({
      section: 'opening',
      prayerId: 'mercy-blood-and-water',
      kind: 'blood',
      repeat,
      repeatTotal: 3
    })
  }
  push({ section: 'opening', prayerId: 'our-father', kind: 'our-father' })
  push({ section: 'opening', prayerId: 'hail-mary', kind: 'hail-mary' })
  push({ section: 'opening', prayerId: 'apostles-creed', kind: 'creed' })

  for (let decade = 0; decade < 5; decade += 1) {
    const section = `decade-${decade}`
    push({ section, prayerId: 'mercy-eternal-father', kind: 'eternal-father', decade })
    for (let repeat = 1; repeat <= 10; repeat += 1) {
      push({
        section,
        prayerId: 'mercy-passion',
        kind: 'passion',
        decade,
        repeat,
        repeatTotal: 10
      })
    }
  }

  for (let repeat = 1; repeat <= 3; repeat += 1) {
    push({
      section: 'closing',
      prayerId: 'mercy-holy-god',
      kind: 'holy-god',
      repeat,
      repeatTotal: 3
    })
  }
  push({ section: 'closing', prayerId: 'mercy-closing', kind: 'closing' })
  return beads
}

/**
 * @param {Bead[]} beads
 * @param {number} index
 * @param {'en' | 'la' | 'both'} lang
 * @param {{ group: string, reset: string, doneKicker: string, doneTitle: string }} copy
 */
function markup(beads, index, lang, copy) {
  const finished = index >= beads.length
  const bead = finished ? null : beads[index]
  const sectionId = bead?.section || 'closing'
  const sectionButtons = sections
    .map((section) => {
      const pressed = section.id === sectionId
      return `
        <button
          type="button"
          data-rosary-section="${section.id}"
          aria-pressed="${pressed}"
          aria-label="${escapeHtml(section.aria)}"
        >${escapeHtml(section.label)}</button>
      `
    })
    .join('')

  const visible = beads.filter((item) => item.section === sectionId)
  const beadButtons = visible
    .map((item) => {
      const position = beads.indexOf(item)
      const prayer = prayers[item.prayerId]
      const name = prayer ? (lang === 'la' ? prayer.latinTitle : prayer.title) : 'Prayer'
      const count = item.repeat ? `, ${item.repeat} of ${item.repeatTotal}` : ''
      const current = position === index
      const done = position < index
      const large =
        item.kind === 'our-father' || item.kind === 'creed' || item.kind === 'eternal-father'
          ? ' rosary-bead--large'
          : ''
      const mark = item.kind === 'cross' ? '<span aria-hidden="true">†</span>' : ''
      return `
        <button
          type="button"
          class="rosary-bead${large}"
          data-rosary-bead="${position}"
          data-kind="${item.kind}"
          data-done="${done}"
          ${current ? 'aria-current="step"' : ''}
          aria-label="${escapeHtml(name + count)}"
          title="${escapeHtml(name + count)}"
        >${mark}</button>
      `
    })
    .join('')

  const nextLabel = finished ? 'Pray again' : index === beads.length - 1 ? 'Finish' : 'Next'
  const countLabel = bead ? barCount(bead, index, beads.length) : 'Amen'

  return `
    <div class="rosary" data-rosary-index="${index}">
      <div class="lang rosary-sections" role="group" aria-label="${escapeHtml(copy.group)}">${sectionButtons}</div>
      <div class="rosary-beads" role="group" aria-label="${escapeHtml(sectionLabel(sectionId))}">${beadButtons}</div>
      ${finished ? doneMarkup(copy) : prayerMarkup(bead, lang)}
      <div class="rosary-nav">
        <button type="button" data-rosary="prev"${index === 0 ? ' disabled' : ''}>Previous</button>
        <button type="button" data-rosary="restart" aria-label="${escapeHtml(copy.reset)}"${index === 0 ? ' disabled' : ''}>Reset</button>
        <span class="rosary-count">${escapeHtml(countLabel)}</span>
        <button type="button" class="rosary-next" data-rosary="next">${nextLabel}</button>
      </div>
    </div>
  `
}

/**
 * @param {Bead} bead
 * @param {'en' | 'la' | 'both'} lang
 */
function prayerMarkup(bead, lang) {
  const prayer = prayers[bead.prayerId]
  if (!prayer) return ''
  const intention = intentionLine(bead, lang)
  const mystery = bead.kind === 'mystery' ? '' : mysteryLine(bead, lang)
  const body = lang === 'both' ? bothPrayer(prayer) : singlePrayer(prayer, lang)
  return `
    <article class="rosary-prayer" aria-live="polite">
      <p class="rosary-kicker">${escapeHtml(kicker(bead))}</p>
      ${mystery}
      ${intention}
      ${body}
    </article>
  `
}

/**
 * @param {{ doneKicker: string, doneTitle: string }} copy
 */
function doneMarkup(copy) {
  return `
    <article class="rosary-done rosary-prayer" aria-live="polite">
      <p class="rosary-kicker">${escapeHtml(copy.doneKicker)}</p>
      <h2>${escapeHtml(copy.doneTitle)}</h2>
    </article>
  `
}

/**
 * @param {Bead} bead
 */
function kicker(bead) {
  if (bead.section === 'opening') {
    return bead.repeat ? `Opening · ${bead.repeat} of ${bead.repeatTotal}` : 'Opening'
  }
  if (bead.section === 'closing') {
    return bead.repeat ? `Closing · ${bead.repeat} of ${bead.repeatTotal}` : 'Closing'
  }
  const decade = `Decade ${bead.decade + 1} of 5`
  return bead.repeat ? `${decade} · ${bead.repeat} of ${bead.repeatTotal}` : decade
}

/**
 * @param {string} sectionId
 */
function sectionLabel(sectionId) {
  return sections.find((section) => section.id === sectionId)?.aria || 'Rosary'
}

/**
 * @param {Bead} bead
 * @param {number} index
 * @param {number} total
 */
function barCount(bead, index, total) {
  if (bead.repeat && bead.repeatTotal) return `${bead.repeat} of ${bead.repeatTotal}`
  return `${index + 1} / ${total}`
}

/**
 * @param {Bead} bead
 * @param {'en' | 'la' | 'both'} lang
 */
function intentionLine(bead, lang) {
  if (!bead.intention) return ''
  const text =
    lang === 'la'
      ? bead.intention.la
      : lang === 'both'
        ? `${bead.intention.en} · ${bead.intention.la}`
        : bead.intention.en
  return `<p class="rosary-intention">${escapeHtml(text)}</p>`
}

/**
 * @param {Bead} bead
 * @param {'en' | 'la' | 'both'} lang
 */
function mysteryLine(bead, lang) {
  if (bead.decade == null || !bead.mysteryId) return ''
  const prayer = prayers[bead.mysteryId]
  if (!prayer) return ''
  if (lang === 'la') return `<p class="rosary-mystery">${escapeHtml(prayer.latinTitle)}</p>`
  if (lang === 'en') return `<p class="rosary-mystery">${escapeHtml(prayer.title)}</p>`
  return `
    <p class="rosary-mystery">${escapeHtml(prayer.title)}</p>
    <p class="rosary-mystery rosary-mystery--latin">${escapeHtml(prayer.latinTitle)}</p>
  `
}

/**
 * @param {{ title: string, latinTitle: string, text: string, latinText: string }} prayer
 * @param {'en' | 'la'} lang
 */
function singlePrayer(prayer, lang) {
  const title = lang === 'la' ? prayer.latinTitle : prayer.title
  const text = lang === 'la' ? prayer.latinText : prayer.text
  return `<h2>${escapeHtml(title)}</h2><p>${formatLines(text)}</p>`
}

/**
 * @param {{ title: string, latinTitle: string, text: string, latinText: string }} prayer
 */
function bothPrayer(prayer) {
  return `
    <div class="bilingual">
      <div>
        <p class="rosary-lang">English</p>
        <h2>${escapeHtml(prayer.title)}</h2>
        <p>${formatLines(prayer.text)}</p>
      </div>
      <div>
        <p class="rosary-lang">Latin</p>
        <h2>${escapeHtml(prayer.latinTitle)}</h2>
        <p>${formatLines(prayer.latinText)}</p>
      </div>
    </div>
  `
}

/**
 * @param {string} value
 */
function formatLines(value) {
  return escapeHtml(value)
    .split('\n')
    .map((line) => `<span class="verse">${line}</span>`)
    .join('')
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * @param {string} setId
 * @param {number} length
 */
function loadIndex(setId, length) {
  const value = readPlaces()[setId]
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(length, Math.max(0, Math.trunc(value)))
}

/**
 * @param {string} setId
 * @param {number} index
 */
function saveIndex(setId, index) {
  const places = readPlaces()
  places[setId] = index
  localStorage.setItem(PLACE_KEY, JSON.stringify(places))
}

function readPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLACE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * @typedef {object} Bead
 * @property {string} section
 * @property {string} prayerId
 * @property {'cross' | 'creed' | 'our-father' | 'hail-mary' | 'glory' | 'fatima' | 'mystery' | 'closing' | 'opening' | 'blood' | 'eternal-father' | 'passion' | 'holy-god'} kind
 * @property {number} [decade]
 * @property {string} [mysteryId]
 * @property {number} [repeat]
 * @property {number} [repeatTotal]
 * @property {{ en: string, la: string }} [intention]
 */
