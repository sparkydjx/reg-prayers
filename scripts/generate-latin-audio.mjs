import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Mp3Encoder } from '@breezystack/lamejs'
import { prayers } from '../src/data/prayers.js'
import { createRespeller } from './ecclesiastical.mjs'
import { createEspeak } from './espeak.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const outDir = join(root, '..', 'public', 'audio', 'la')
const checkOnly = process.argv.includes('--check')

const VOICE = 'it+m3'
const RATE = 120
const PITCH = 44
const RANGE = 30

function synthesize(espeak, text) {
  const chunks = []
  espeak.synthesize(text, (samples) => {
    if (samples?.length) chunks.push(Int16Array.from(samples))
    return 0
  })
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const samples = new Int16Array(total)
  let offset = 0
  for (const chunk of chunks) {
    samples.set(chunk, offset)
    offset += chunk.length
  }
  return samples
}

function encodeMp3(samples, sampleRate) {
  const encoder = new Mp3Encoder(1, sampleRate, 64)
  const block = 1152
  const parts = []
  for (let index = 0; index < samples.length; index += block) {
    const slice = samples.subarray(index, index + block)
    const mp3 = encoder.encodeBuffer(Int16Array.from(slice))
    if (mp3.length) parts.push(Buffer.from(mp3))
  }
  const end = encoder.flush()
  if (end.length) parts.push(Buffer.from(end))
  return Buffer.concat(parts)
}

function speakWith(espeak, text) {
  espeak.set_voice(VOICE)
  espeak.set_rate(RATE)
  espeak.set_pitch(PITCH)
  espeak.set_range(RANGE)
  return synthesize(espeak, text)
}

const espeak = await createEspeak()
const respeller = createRespeller(espeak)

function italianIpa(spelling) {
  espeak.set_voice('it')
  return (espeak.synthesize_ipa(spelling).ipa || '').replaceAll('\n', ' ').trim()
}

if (checkOnly) {
  const samples = [
    'caelis',
    'coeli',
    'gratia',
    'agnus',
    'excelsis',
    'Christus',
    'Iesus',
    'regina',
    'Maria',
    'Marīa',
    'gloria',
    'vae',
    'sanctificetur',
    'ecclesiam',
    'angelus',
    'saeculorum',
    'Michael',
    'qui',
    'eius',
    'Deus',
    'hodie',
    'mihi',
    'iustitia',
    'nuntiavit',
    'descendit',
    'exaudi',
    'catholicam',
    'requiem',
    'Sancti',
    'Beati',
    'tibi'
  ]
  let failed = false
  for (const word of samples) {
    const result = respeller.spell(word.replace(/[āēīōū]/g, (mark) => ({ ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u' }[mark])))
    const ipa = italianIpa(result.spelling)
    console.log(
      `${word.padEnd(16)} ${result.spelling.padEnd(16)} ${result.aligned ? 'ok' : 'MIS'}  ${ipa}`
    )
  }

  const expect = (word, pattern, label) => {
    const result = respeller.spell(word)
    const ipa = italianIpa(result.spelling)
    if (!pattern.test(ipa) || !result.aligned) {
      failed = true
      console.error(`FAIL ${label}: ${word} -> ${result.spelling} ${ipa}`)
    }
  }
  expect('caelis', /tʃ_ˈɛ/, 'soft c and ae as e')
  expect('gratia', /ts/, 'ti before a vowel')
  expect('agnus', /ɲ/, 'gn')
  expect('excelsis', /k_ʃ|kʃ/, 'xc as ksh')
  expect('vae', /^v_/, 'v as v')
  expect('Iesus', /j_.*?z/, 'Iesus')
  expect('regina', /dʒ_ˈi/, 'regina stress and soft g')
  expect('Maria', /m_a_r_ˈi/, 'Maria stress')
  expect('ecclesiam', /k(?!ː?_ˈ?ɛ_tʃ)/, 'ecclesiam keeps hard c')
  expect('angelus', /dʒ/, 'angelus soft g')
  expect('descendit', /ʃ/, 'sc before e')
  expect('qui', /k_w|kw/, 'qui keeps qu')
  expect('Sancti', /t_ɪ/, 'word-final ti keeps t')
  expect('Beati', /t_i|t_ɪ/, 'beati keeps t')
  expect('tibi', /t_ˈi|t_i/, 'tibi keeps t')

  console.log(`\nUnaligned words in the sample: ${respeller.mismatches.size}`)
  for (const [word, result] of respeller.mismatches) {
    console.log(`  ${word} nuclei ${result.nuclei} ipa ${result.ipaVowels} -> ${result.spelling}`)
  }
  if (failed) process.exit(1)

  for (const id of ['our-father', 'hail-mary', 'hail-holy-queen', 'sign-of-the-cross', 'glory-be']) {
    console.log(`\n${id}\n${respeller.prepare(prayers[id].latinText)}`)
  }
  for (const prayer of Object.values(prayers)) respeller.prepare(prayer.latinText)
  console.log(`\nUnaligned after sample prayers: ${respeller.mismatches.size}`)
  for (const [word, result] of respeller.mismatches) {
    console.log(`  ${word} nuclei ${result.nuclei} ipa ${result.ipaVowels} -> ${result.spelling}`)
  }
  process.exit(0)
}

await mkdir(outDir, { recursive: true })
const sampleRate = espeak.get_samplerate()
let total = 0
for (const [id, prayer] of Object.entries(prayers)) {
  const spoken = respeller.prepare(prayer.latinText)
  const samples = speakWith(espeak, spoken)
  const mp3 = encodeMp3(samples, sampleRate)
  await writeFile(join(outDir, `${id}.mp3`), mp3)
  total += mp3.length
  console.log(`${id}  ${(mp3.length / 1024).toFixed(0)} KB  ${(samples.length / sampleRate).toFixed(1)}s`)
}
if (respeller.mismatches.size) {
  console.log(`\nWords spoken without a matched stress mark: ${respeller.mismatches.size}`)
  for (const word of respeller.mismatches.keys()) console.log(`  ${word}`)
}
console.log(`\nWrote ${Object.keys(prayers).length} files, ${(total / 1024 / 1024).toFixed(1)} MB`)
