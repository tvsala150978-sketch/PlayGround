import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const metadataDir = process.env.OPENCODE_WEB_DIR || '/home/runner/work/_temp/omgithub-web'
let previewHost = ''
try {
  previewHost = new URL(readFileSync(resolve(metadataDir, 'app-url'), 'utf8').trim()).hostname
} catch {
  // Local development does not require the worker's public preview host.
}

export default defineConfig({
  preview: {
    allowedHosts: previewHost ? [previewHost] : [],
  },
})
