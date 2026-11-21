import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prayers } from '../src/data/prayers.js'
import { createRespeller } from './ecclesiastical.mjs'
import { createEspeak } from './espeak.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const outDir = join(root, '..', 'public', 'audio', 'la')
const onlyId = process.argv.find((arg) => arg.startsWith('--id='))?.slice('--id='.length)

const VOICE = 'it-IT-Chirp3-HD-Charon'
const SPEAKING_RATE = 0.9
const CHUNK_LIMIT = 3500

async function loadKey() {
  const envPath = join(root, '..', '.env')
  const text = await readFile(envPath, 'utf8')
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith('GOOGLE_TTS_API_KEY='))
  const key = line?.slice('GOOGLE_TTS_API_KEY='.length).trim()
  if (!key) throw new Error('GOOGLE_TTS_API_KEY is missing from .env')
  return key
}

function spokenMarkup(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' [pause] ')
    .replaceAll('à', 'a')
    .replaceAll('è', 'e')
    .replaceAll('ì', 'i')
    .replaceAll('ò', 'o')
    .replaceAll('ù', 'u')
    .replace(/s(?=\s+s)/gi, '')
    .replace(/\bqui\s+/gi, 'qui,')
    // quae and the enclitic -que are /kwe/. Chirp reads "que" as Italian "che" (kay).
    .replace(/que\b/gi, ' qui,e')
}

function sentencesOf(text) {
  return text
    .split(/(?<=[.!?;])\s+/)
    .map((sentence) => sentence.replace(/[.!?;]+$/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function chunksOf(text) {
  const sentences = text.split(/(?<=[.!?;])\s+/)
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > CHUNK_LIMIT && current) {
      chunks.push(current)
      current = sentence
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)
  return chunks.flatMap((chunk) => {
    if (chunk.length <= CHUNK_LIMIT) return [chunk]
    const pieces = []
    for (let index = 0; index < chunk.length; index += CHUNK_LIMIT) {
      pieces.push(chunk.slice(index, index + CHUNK_LIMIT))
    }
    return pieces
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function synthesize(key, markup) {
  const payload = JSON.stringify({
    input: { markup },
    voice: { languageCode: 'it-IT', name: VOICE },
    audioConfig: { audioEncoding: 'MP3', speakingRate: SPEAKING_RATE }
  })
  let lastError
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Goog-Api-Key': key
      },
      body: payload
    })
    const body = await response.json()
    if (response.ok) return Buffer.from(body.audioContent, 'base64')
    const message = body.error?.message || response.statusText
    const reason = body.error?.details?.find((detail) => detail.reason)?.reason
    lastError = new Error(`Chirp request failed (${response.status}${reason ? `, ${reason}` : ''}): ${message}`)
    const retryable = response.status === 429 || response.status >= 500 || reason === 'API_KEY_SERVICE_BLOCKED'
    if (!retryable || attempt === 8) break
    await delay(Math.min(30000, 2000 * 2 ** (attempt - 1)))
  }
  throw lastError
}

const key = await loadKey()
const espeak = await createEspeak()
const respeller = createRespeller(espeak)
await mkdir(outDir, { recursive: true })

const entries = Object.entries(prayers).filter(([id]) => !onlyId || id === onlyId)
if (onlyId && entries.length === 0) throw new Error(`No prayer named ${onlyId}`)

let total = 0
for (const [id, prayer] of entries) {
  const markup = spokenMarkup(respeller.prepare(prayer.latinText))
  const parts = []
  for (const sentence of sentencesOf(markup)) {
    for (const chunk of chunksOf(sentence)) {
      parts.push(await synthesize(key, chunk))
    }
  }
  const mp3 = Buffer.concat(parts)
  await writeFile(join(outDir, `${id}.mp3`), mp3)
  total += mp3.length
  console.log(`${id}  ${(mp3.length / 1024).toFixed(0)} KB`)
}

console.log(`Wrote ${entries.length} files, ${(total / 1024 / 1024).toFixed(1)} MB, voice ${VOICE}`)
