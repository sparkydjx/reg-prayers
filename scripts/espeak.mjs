import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

/**
 * Load the eSpeak NG library (Emscripten build) and return a worker.
 * Audio is synthesized offline; the library is not shipped in the web app.
 */
export async function createEspeak() {
  const pkgDir = dirname(require.resolve('@echogarden/espeak-ng-emscripten/package.json'))
  const { default: Module } = await import(pathToFileURL(join(pkgDir, 'espeak-ng.js')).href)
  const runtime = await Module({
    locateFile: (file) => join(pkgDir, file)
  })
  const espeak = new runtime.eSpeakNGWorker()
  return espeak
}
