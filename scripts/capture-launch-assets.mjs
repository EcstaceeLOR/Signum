import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const assetDirectory = resolve(root, 'docs/assets')
const publicDirectory = resolve(root, 'public')
const gameUrl =
  process.env.SIGNUM_CAPTURE_URL ??
  'https://ecstaceelor.github.io/Signum/?showcase=1'

await mkdir(assetDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  await page.goto(gameUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Skip guide' }).click()

  for (const receiver of ['Pulse', 'Carrier', 'Deepwave']) {
    await page
      .locator(`label[for="receiver-${receiver.toLowerCase()}"]`)
      .click()
    await page.locator('.workbench').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: resolve(assetDirectory, `signum-${receiver.toLowerCase()}.png`),
    })
  }

  await page.setViewportSize({ width: 1200, height: 630 })
  await page.goto(gameUrl, { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: resolve(publicDirectory, 'og-image.png') })
  await context.close()

  const videoContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: assetDirectory, size: { width: 1280, height: 720 } },
  })
  const videoPage = await videoContext.newPage()
  await videoPage.goto(gameUrl, { waitUntil: 'domcontentloaded' })
  await videoPage.waitForTimeout(3_000)
  await videoPage.getByRole('button', { name: 'Start composing' }).click()
  await videoPage.locator('.workbench').scrollIntoViewIfNeeded()
  await videoPage.waitForTimeout(3_000)
  await videoPage.locator('label[for="receiver-carrier"]').click()
  await videoPage.getByRole('button', { name: /^Beat 2:/ }).click()
  await videoPage.getByRole('button', { name: /^Beat 5:/ }).click()
  await videoPage.waitForTimeout(3_000)
  await videoPage.getByRole('button', { name: 'Transmit demo wager' }).click()
  await videoPage.getByLabel('Settled result').waitFor()
  await videoPage.waitForTimeout(4_000)
  await videoPage.getByText('See the fixed rules behind every echo').click()
  await videoPage
    .getByRole('heading', { name: /The echo is compared beat-for-beat/ })
    .scrollIntoViewIfNeeded()
  await videoPage.waitForTimeout(5_000)
  await videoPage.locator('.signal-journal').scrollIntoViewIfNeeded()
  await videoPage.locator('.signal-journal > summary').click()
  await videoPage.waitForTimeout(5_000)
  const video = videoPage.video()
  await videoContext.close()
  if (video) {
    const generatedVideo = await video.path()
    const finalVideo = resolve(assetDirectory, 'signum-showcase-demo.webm')
    await video.saveAs(finalVideo)
    if (generatedVideo !== finalVideo) await rm(generatedVideo)
  }
} finally {
  await browser.close()
}

console.log(`Captured launch assets from ${gameUrl}`)
