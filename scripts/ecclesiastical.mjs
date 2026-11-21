/**
 * Church Latin (ecclesiastical / Italianate) spelling for the eSpeak NG Italian voice.
 *
 * eSpeak NG's Latin voice follows classical pronunciation (hard c, v as w, ae as a diphthong).
 * Stress still comes from that Latin voice, including a few macron hints for long penults.
 * The Italian voice then speaks the respelling: soft c and g, v as v, ae/oe as e, gn as ny,
 * sc as sh, ti + vowel as ts, and xc before a front vowel as ksh.
 * Intervocalic s is doubled so it stays unvoiced, mihi and nihil keep the Roman k,
 * and an apostrophe separates a vowel from a preceding unstressed i or u.
 */

const ACCENT = { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' }
const PLAIN = { à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u' }

/** Words whose vowel length eSpeak cannot see without a macron. */
const MACRON_WORDS = {
  maria: 'Marīa',
  mariae: 'Marīae',
  mariam: 'Marīam',
  mario: 'Marīō',
  regina: 'regīna',
  reginae: 'regīnae',
  sanctificetur: 'sanctificētur',
  quotidianum: 'quotidiānum',
  debitoribus: 'dēbitōribus',
  ecclesia: 'ecclēsia',
  ecclesiam: 'ecclēsiam',
  ecclesiae: 'ecclēsiae',
  filio: 'fīliō',
  filii: 'fīliī',
  filium: 'fīlium',
  spiritu: 'spīritū',
  spiritui: 'spīrituī',
  spiritus: 'spīritus',
  gloria: 'glōria',
  gloriae: 'glōriae',
  gloriam: 'glōriam',
  vita: 'vīta',
  vitae: 'vītae',
  vitam: 'vītam',
  ideo: 'ideō',
  unigenitus: 'ūnigenitus',
  misericordia: 'misericordia',
  misericordiae: 'misericordiae',
  misericordiam: 'misericordiam'
}

const FRONT = new Set(['e', 'i', 'y'])

function bare(token) {
  return token.replace(/[ˈˌː]/g, '')
}

function ipaTokens(ipa) {
  return ipa.split('_').map((token) => token.trim()).filter(Boolean)
}

function isVowelToken(token) {
  return /[aeiouɛɔɪʊy]/.test(bare(token))
}

function diphthong(token, two) {
  const value = bare(token)
  if ((value === 'aɪ' || value === 'ai') && two === 'ae') return 'ae'
  if ((value === 'aʊ' || value === 'au') && two === 'au') return 'au'
  if ((value === 'ɔɪ' || value === 'oi') && two === 'oe') return 'oe'
  if ((value === 'ɛʊ' || value === 'eʊ' || value === 'eu') && two === 'eu') return 'eu'
  return ''
}

function vowelMatches(letter, token) {
  const value = bare(token)
  const table = {
    a: ['a'],
    e: ['e', 'ɛ'],
    i: ['i', 'ɪ', 'y'],
    y: ['i', 'ɪ', 'y'],
    o: ['o', 'ɔ'],
    u: ['u', 'ʊ']
  }
  return (table[letter] || []).includes(value)
}

function isFront(letters, index) {
  const pair = letters.slice(index, index + 2)
  return FRONT.has(letters[index]) || pair === 'ae' || pair === 'oe'
}

function macronize(word) {
  const key = word.toLowerCase()
  if (MACRON_WORDS[key]) return MACRON_WORDS[key]
  const rules = [
    [/orum$/, 'ōrum'],
    [/arum$/, 'ārum'],
    [/atur$/, 'ātur'],
    [/antur$/, 'āntur'],
    [/amur$/, 'āmur'],
    [/amus$/, 'āmus'],
    [/atis$/, 'ātis'],
    [/etur$/, 'ētur'],
    [/emus$/, 'ēmus'],
    [/ionem$/, 'iōnem'],
    [/ionis$/, 'iōnis'],
    [/ione$/, 'iōne']
  ]
  for (const [pattern, ending] of rules) {
    if (pattern.test(key) && key.length > ending.length) {
      return word.slice(0, word.length - ending.length) + ending
    }
  }
  return word
}

function respellWord(word, ipa) {
  let letters = word
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('œ', 'oe')
  if (letters === 'mihi') letters = 'michi'
  if (letters === 'nihil') letters = 'nichil'
  const vowels = ipaTokens(ipa).filter(isVowelToken)
  const stressAt = vowels.findIndex((token) => token.includes('ˈ'))
  let vowelIndex = 0
  let nucleus = 0
  let out = ''
  let lastWasNucleus = false

  const emitNucleus = (letter) => {
    const vowel = letter === 'y' ? 'i' : letter
    const marked = nucleus === stressAt && vowels.length > 1 ? ACCENT[vowel] || vowel : vowel
    nucleus += 1
    const previous = out.at(-1) || ''
    const breakHiatus = lastWasNucleus && ('iu'.includes(previous) || letter === 'i')
    lastWasNucleus = true
    return (breakHiatus ? "'" : '') + marked
  }

  const emitConsonant = (text) => {
    out += text
    lastWasNucleus = false
  }

  for (let index = 0; index < letters.length; ) {
    const ch = letters[index]
    const next = letters[index + 1] || ''
    const prev = letters[index - 1] || ''
    const two = ch + next

    if (two === 'ph' || two === 'th') {
      emitConsonant(two === 'ph' ? 'f' : 't')
      index += 2
      continue
    }
    if (ch === 'h') {
      index += 1
      continue
    }
    if (ch === 'c' && next === 'h') {
      emitConsonant(isFront(letters, index + 2) ? 'ch' : 'c')
      index += 2
      continue
    }
    if (ch === 'x' && next === 'c' && isFront(letters, index + 2)) {
      emitConsonant('ksc')
      index += 2
      continue
    }
    const after = letters[index + 2] || ''
    if (
      ch === 't' &&
      next === 'i' &&
      after &&
      'aeiouy'.includes(after) &&
      !(prev && 'stx'.includes(prev))
    ) {
      emitConsonant('z')
      index += 1
      continue
    }
    if (!'aeiouy'.includes(ch)) {
      emitConsonant(ch === 'j' ? 'i' : ch)
      index += 1
      continue
    }

    const token = vowels[vowelIndex]
    const kind = token ? diphthong(token, two) : ''
    if (kind === 'ae' || kind === 'oe') {
      out += emitNucleus('e')
      vowelIndex += 1
      index += 2
      continue
    }
    if (kind === 'au' || kind === 'eu') {
      out += emitNucleus(ch) + next
      lastWasNucleus = false
      vowelIndex += 1
      index += 2
      continue
    }
    if (token && vowelMatches(ch, token)) {
      out += emitNucleus(ch)
      vowelIndex += 1
      index += 1
      continue
    }
    if ('iuj'.includes(ch) && token && !vowelMatches(ch, token)) {
      emitConsonant(ch === 'j' ? 'i' : ch)
      index += 1
      continue
    }

    out += emitNucleus(ch)
    if (token) vowelIndex += 1
    index += 1
  }

  const aligned = nucleus === vowels.length && vowelIndex === vowels.length
  if (!aligned) out = out.replace(/[àèìòù]/g, (mark) => PLAIN[mark])
  out = out.replace(/([aeiouàèìòù])s(?=[aeiouàèìòù])/g, '$1ss')
  return { spelling: out, aligned, nuclei: nucleus, ipaVowels: vowels.length }
}

export function createRespeller(espeak) {
  const cache = new Map()
  const mismatches = new Map()

  function ipaFor(word) {
    espeak.set_voice('la')
    const spoken = espeak.synthesize_ipa(macronize(word)).ipa || ''
    return spoken
  }

  function spell(word) {
    const key = word.toLowerCase()
    if (cache.has(key)) return cache.get(key)
    const result = respellWord(word, ipaFor(word))
    cache.set(key, result)
    if (!result.aligned) mismatches.set(key, result)
    return result
  }

  function prepare(latinText) {
    const lines = latinText
      .replaceAll('—', ', ')
      .replaceAll('–', ', ')
      .replaceAll('…', ', ')
      .replaceAll('“', '')
      .replaceAll('”', '')
      .replaceAll('’', "'")
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^\(.*\)$/.test(line))
    const spoken = lines
      .join('\n')
      .replace(/[A-Za-zÆæŒœ]+/g, (word) => spell(word).spelling)
    return spoken
  }

  return { prepare, spell, mismatches, macronize }
}
