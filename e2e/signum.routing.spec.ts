import { expect, test } from '@playwright/test'

const baseUrl = process.env.SIGNUM_PREVIEW_URL ?? 'http://127.0.0.1:4173'

test('standalone product routes remain navigable without runtime errors', async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await page.goto(baseUrl)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Send a signal. Hear the unknown answer.',
    }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Home · Signum')
  await page.screenshot({
    path: testInfo.outputPath('signum-home.png'),
    fullPage: true,
  })

  await page.getByRole('link', { name: 'Play', exact: true }).click()
  await expect(page).toHaveURL(`${baseUrl}/play`)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Choose how deep to listen.',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Continue to compose' }).click()
  await expect(page).toHaveURL(`${baseUrl}/play/pulse`)
  await expect(
    page.getByRole('button', { name: 'Transmit demo wager' }),
  ).toBeEnabled()

  await page.goBack()
  await expect(page).toHaveURL(`${baseUrl}/play`)
  await expect(
    page.getByRole('heading', { name: 'Choose how deep to listen.' }),
  ).toBeFocused()

  await page.goBack()
  await expect(page).toHaveURL(`${baseUrl}/`)
  await expect(
    page.getByRole('heading', {
      name: 'Send a signal. Hear the unknown answer.',
    }),
  ).toBeFocused()

  await page.goForward()
  await expect(page).toHaveURL(`${baseUrl}/play`)
  await page.goForward()
  await expect(page).toHaveURL(`${baseUrl}/play/pulse`)

  await page.goto(`${baseUrl}/missing-frequency`)
  await expect(
    page.getByRole('heading', { name: 'This frequency is silent.' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Return home' }).click()
  await expect(page).toHaveURL(`${baseUrl}/`)

  expect(runtimeErrors).toEqual([])
})

test('mobile primary navigation opens and routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl)

  const menu = page.getByRole('button', { name: 'Menu' })
  await expect(menu).toBeVisible()
  await menu.click()
  await page.getByRole('link', { name: 'Play', exact: true }).click()
  await expect(page).toHaveURL(`${baseUrl}/play`)
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})
