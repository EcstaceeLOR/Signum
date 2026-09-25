import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const baseUrl = process.env.SIGNUM_PREVIEW_URL ?? 'http://127.0.0.1:4173'

const routeMatrix = [
  ['/', 'Send a signal. Hear the unknown answer.'],
  ['/play', 'Choose how deep to listen.'],
  ['/how-it-works', 'How to play Signum'],
  ['/fairness', 'Fairness you can reconstruct.'],
  ['/history', 'Your signal history'],
  ['/settings', 'Settings'],
  ['/responsible-play', 'Responsible play'],
  ['/support', 'Support and diagnostics'],
] as const

test('every stable standalone route has metadata and no serious accessibility violations', async ({
  page,
}) => {
  for (const [path, heading] of routeMatrix) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { level: 1, name: heading }),
    ).toBeVisible()
    await expect(page).toHaveTitle(/Signum$/)
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      audit.violations.filter(
        ({ impact }) => impact === 'critical' || impact === 'serious',
      ),
      path,
    ).toEqual([])
  }
})

test('standalone product routes remain navigable without runtime errors', async ({
  page,
}) => {
  const runtimeErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Send a signal. Hear the unknown answer.',
    }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Home · Signum')
  await page.getByRole('link', { name: 'How it works', exact: true }).click()
  await expect(page).toHaveURL(`${baseUrl}/how-it-works`)
  await expect(
    page.getByRole('heading', { level: 1, name: 'How to play Signum' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Home', exact: true }).click()

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
    page.getByRole('button', { name: 'Play practice round' }),
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

  await page.goto(`${baseUrl}/missing-frequency`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(
    page.getByRole('heading', { name: 'This frequency is silent.' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Return home' }).click()
  await expect(page).toHaveURL(`${baseUrl}/`)

  expect(runtimeErrors).toEqual([])
})

test('mobile primary navigation opens and routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })

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
