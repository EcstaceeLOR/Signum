import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

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
  await game.getByRole('button', { name: 'Skip reveal' }).click()

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
