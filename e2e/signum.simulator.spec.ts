import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const simulatorUrl = 'http://127.0.0.1:3300'
const gameUrl = 'http://127.0.0.1:5173'
const rpcUrl = 'http://127.0.0.1:8545'
const browserFailuresByPage = new WeakMap<Page, string[]>()

test.afterEach(async ({ page }, testInfo) => {
  const failures = browserFailuresByPage.get(page) ?? []
  if (failures.length === 0) return
  await testInfo.attach('browser-failures.txt', {
    body: failures.join('\n'),
    contentType: 'text/plain',
  })
})

test('runs settled and cancelled Signum sessions through the real simulator', async ({
  page,
  request,
}) => {
  const browserFailures: string[] = []
  browserFailuresByPage.set(page, browserFailures)
  page.on('pageerror', (error) =>
    browserFailures.push(`pageerror: ${error.message}`),
  )
  page.on('console', (message) =>
    captureConsoleFailure(message, browserFailures),
  )
  page.on('requestfailed', (failed) => {
    if (failed.url().startsWith('http://127.0.0.1')) {
      browserFailures.push(
        `requestfailed: ${failed.method()} ${failed.url()} ${failed.failure()?.errorText ?? ''}`,
      )
    }
  })

  const gameAddress = process.env.SIGNUM_GAME_ADDRESS
  expect(
    gameAddress,
    'The stack runner must provide SignumGame address',
  ).toMatch(/^0x[0-9a-fA-F]{40}$/)

  await page.goto(
    `${simulatorUrl}/?game=${encodeURIComponent(gameUrl)}&gameAddress=${gameAddress}`,
  )
  const game = page.frameLocator('iframe[title="Signum"]')
  await expect(
    game.getByRole('status', { name: 'Chain host status' }),
  ).toContainText('Chain host ready', { timeout: 60_000 })
  await expect(game.getByLabel('Smart Vault balance')).toContainText(
    '1000000 chUSD',
  )

  const firstTransmit = game.getByRole('button', { name: 'Transmit 1 chUSD' })
  await firstTransmit.click()
  await expect(
    game.getByText('Transmission opened. Awaiting a verified echo…'),
  ).toBeVisible()
  await expect(
    game.getByRole('heading', { name: 'Receiving the ghost signal' }),
  ).toBeVisible({ timeout: 45_000 })

  const result = game.getByLabel('Settled result')
  await expect(result).toBeVisible()
  const matchText = await result
    .locator('div')
    .filter({ hasText: /^Matches/ })
    .locator('dd')
    .innerText()
  const multiplierText = await result
    .locator('div')
    .filter({ hasText: /^Multiplier/ })
    .locator('dd')
    .innerText()
  const payoutText = await result
    .locator('div')
    .filter({ hasText: /^Payout/ })
    .locator('dd')
    .innerText()
  const matches = Number(matchText.split('/')[0])
  const multiplier = Number(multiplierText.replace('×', ''))
  const payout = Number(payoutText.split(' ')[0])

  expect(
    await game.locator('.signal-reveal__beat[data-result="match"]').count(),
  ).toBe(matches)
  expect(payout).toBeCloseTo(multiplier, 8)
  await expect(
    result.locator('div').filter({ hasText: /^Session ID/ }),
  ).toBeVisible()

  await game.getByText('See the fixed rules behind every echo').click()
  await expect(
    game.getByRole('heading', { name: 'Reconstruct this echo' }),
  ).toBeVisible()
  await expect(game.getByText('VRF proof verified')).toBeVisible({
    timeout: 30_000,
  })
  await expect(game.getByText('Pulse paytable')).toBeVisible()
  await expect(game.getByText(gameAddress!)).toBeVisible()
  await expect(game.getByText(/XOR marks different beats/)).toContainText(
    `${matches} of 4 beats match`,
  )

  await game.getByRole('button', { name: 'Compose another signal' }).click()
  const secondTransmit = game.getByRole('button', { name: 'Transmit 1 chUSD' })
  await secondTransmit.click()
  await expect(
    game.getByRole('button', { name: 'Awaiting Chain…' }),
  ).toBeDisabled()
  await expect(
    game.getByText('Transmission opened. Awaiting a verified echo…'),
  ).toBeVisible()
  await expect(game.locator('#wager-feedback')).toContainText(
    /Transaction 0x/,
    { timeout: 30_000 },
  )

  const mine = await request.post(rpcUrl, {
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'hardhat_mine',
      params: ['0x20'],
    },
  })
  expect(mine.ok()).toBe(true)
  expect((await mine.json()).error).toBeUndefined()

  const cancel = game.getByRole('button', { name: 'Cancel delayed request' })
  await expect(cancel).toBeVisible({ timeout: 35_000 })
  await cancel.click()
  await expect(game.getByRole('alert')).toContainText(
    'The delayed transmission was cancelled by Chain.',
    { timeout: 30_000 },
  )
  await expect(
    game.getByRole('button', { name: 'Return to composer' }),
  ).toBeVisible()

  expect(browserFailures, browserFailures.join('\n')).toEqual([])
})

test('completes the standalone mobile round with keyboard and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(gameUrl)
  await expect(
    page.getByRole('heading', { name: 'Send a signal. Catch its echo.' }),
  ).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(
    overflow,
    'The mobile document must not overflow horizontally',
  ).toBeLessThanOrEqual(1)

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const blockingViolations = accessibility.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  )
  expect(
    blockingViolations,
    blockingViolations.map(({ id, help }) => `${id}: ${help}`).join('\n'),
  ).toEqual([])

  const pulse = page.getByRole('radio', { name: /Pulse/ })
  await tabTo(page, pulse)
  await page.keyboard.press('ArrowRight')
  const carrier = page.getByRole('radio', { name: /Carrier/ })
  await expect(carrier).toBeChecked()

  await page.keyboard.press('Tab')
  const firstBeat = page.getByRole('button', { name: /^Beat 1:/ })
  await expect(firstBeat).toBeFocused()
  const pressedBefore = await firstBeat.getAttribute('aria-pressed')
  await page.keyboard.press('Space')
  await expect(firstBeat).toHaveAttribute(
    'aria-pressed',
    pressedBefore === 'true' ? 'false' : 'true',
  )

  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: /^Beat 2:/ })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: /^Beat 6:/ })).toBeFocused()

  const mute = page.getByRole('button', { name: 'Mute sound' })
  await tabTo(page, mute)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('signum.sound-muted.v1')),
  ).toBe('1')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible()
  const transmit = page.getByRole('button', {
    name: 'Transmit demo wager',
  })
  await tabTo(page, transmit)
  await page.keyboard.press('Enter')

  const resultHeading = page.locator('#signal-reveal-title')
  await expect(resultHeading).toBeVisible()
  await expect(resultHeading).toBeFocused()
  await expect(page.locator('.signal-reveal')).toHaveAttribute(
    'data-phase',
    'settled',
  )

  const composeAgain = page.getByRole('button', {
    name: 'Compose another signal',
  })
  await page.keyboard.press('Tab')
  await expect(composeAgain).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Beat 1:/ })).toBeFocused()
})

async function tabTo(page: Page, target: ReturnType<Page['locator']>) {
  for (let press = 0; press < 30; press++) {
    await page.keyboard.press('Tab')
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return
    }
  }
  throw new Error('Keyboard focus did not reach the expected control.')
}

function captureConsoleFailure(
  message: ConsoleMessage,
  browserFailures: string[],
) {
  if (message.type() !== 'error') return
  const location = message.location().url
  if (location === `${simulatorUrl}/favicon.ico`) return
  browserFailures.push(
    `console.error${location ? ` (${location})` : ''}: ${message.text()}`,
  )
}
