#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence output directory.}"
mkdir -p "$CAPTURE_DIR"

/usr/bin/time -p node --input-type=module - "$CAPTURE_URL" "$CAPTURE_DIR" <<'NODE'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()
const url = process.argv[2]
const output = process.argv[3]
let browser
let exitCode = 0
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

try {
  try {
    browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 })
  } catch (error) {
    console.error(`Browser infrastructure failure: ${error.message}`)
    exitCode = 75
  }

  if (browser) {
    const origin = new URL(url).origin
    for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 844, 390]]) {
      let page
      try {
        page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' })
        page.setDefaultTimeout(30000)
        const defects = []
        page.on('pageerror', error => defects.push(`Page error: ${error.message}`))
        page.on('response', response => {
          if (response.status() >= 400 && new URL(response.url()).origin === origin) defects.push(`HTTP ${response.status()}: ${response.url()}`)
        })
        let response
        try {
          response = await page.goto(url, { waitUntil: 'load', timeout: 45000 })
        } catch (error) {
          console.error(`Navigation/browser infrastructure failure (${name}): ${error.message}`)
          exitCode = 75
          break
        }
        if (!response?.ok()) {
          const status = response?.status()
          console.error(`Preview returned HTTP ${status ?? 'no response'} (${name}).`)
          exitCode = !status || status === 408 || status === 429 || status >= 500 ? 75 : 1
          break
        }
        try {
          await page.locator('#loading.hidden').waitFor({ state: 'attached', timeout: 30000 })
          await page.locator('#scene').waitFor({ state: 'visible', timeout: 10000 })
          await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, { timeout: 15000 })
          await page.locator('#btn-play').evaluate(button => button.click())
          await page.waitForFunction(() => {
            const hud = document.querySelector('#hud')
            const canvas = document.querySelector('#scene')
            return hud && !hud.classList.contains('hidden') && canvas?.width > 0 && canvas?.height > 0
          }, undefined, { timeout: 10000 })
          await sleep(900)
          await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 })
          if (name === 'desktop') {
            await page.screenshot({ path: join(output, 'final-preview.jpg'), type: 'jpeg', quality: 88, timeout: 30000 })
          }
        } catch (error) {
          console.error(`Rendering/capture defect (${name}): ${error.message}`)
          exitCode = 1
          break
        }
        if (defects.length) {
          console.error(`Rendering defect (${name}): ${defects.join('; ')}`)
          exitCode = 1
          break
        }
        console.log(`Captured ${name}: ${join(output, `final-${name}.png`)}`)
        await page.close()
      } catch (error) {
        console.error(`Capture script defect (${name}): ${error.stack || error.message}`)
        exitCode = 1
        break
      } finally {
        await page?.close().catch(error => {
          console.error(`Browser cleanup failure: ${error.message}`)
          exitCode ||= 75
        })
      }
    }
  }
} finally {
  await browser?.close().catch(error => {
    console.error(`Browser cleanup failure: ${error.message}`)
    exitCode ||= 75
  })
}
process.exitCode = exitCode
NODE
