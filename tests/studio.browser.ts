import { expect, test, type Page } from '@playwright/test'
import { fixture, ownerToken, preferences, videoId } from './fixtures'

async function enter(page: Page) {
  await page.route('**/api/session', (route) => (
    route.request().headers().authorization === `Bearer ${ownerToken}`
      ? route.fulfill({ json: { authenticated: true } })
      : route.fulfill({ status: 401, json: { message: 'Enter a valid owner access token.' } })
  ))
  await page.goto('/')
  await page.getByLabel('Owner access token').fill('invalid-owner-token')
  await page.getByRole('button', { name: 'Unlock studio' }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a valid owner access token.')
  await page.getByLabel('Owner access token').fill(ownerToken)
  await page.getByRole('button', { name: 'Unlock studio' }).click()
  await expect(page.getByRole('heading', { name: 'Generate highlights' })).toBeVisible()
}

test('owner can validate input, inspect and edit ranked highlights (fixture)', async ({ page }) => {
  await enter(page)
  let requests = 0
  await page.route('https://i.ytimg.com/**', (route) => route.abort())
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ body: 'Fixture player' }))
  await page.route('**/api/analyze', async (route) => {
    requests++
    expect(route.request().postDataJSON()).toEqual({ ...preferences, count: 7, length: 'quick' })
    await route.fulfill({ json: fixture })
  })

  await page.getByLabel('YouTube URL').fill('https://example.test/not-a-video')
  await page.getByRole('button', { name: 'Analyze video' }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a valid HTTPS link to a single public YouTube video.')
  expect(requests).toBe(0)
  await expect(page.getByLabel('YouTube URL')).toBeFocused()
  await page.getByLabel('YouTube URL').fill(preferences.url)
  await page.getByLabel('Clip count').selectOption('7')
  await page.getByLabel('Clip length').selectOption('quick')
  await page.getByRole('button', { name: 'Analyze video' }).click()
  await expect(page.getByRole('heading', { name: 'Fixture: the comeback' })).toBeVisible()
  await page.getByRole('button', { name: /fixture: the final turn/i }).click()
  await expect(page.getByText('Uncertain timestamps')).toBeVisible()
  await page.getByRole('button', { name: 'Play preview at 01:00' }).click()
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(`/embed/${videoId}\\?start=60&end=85`))
  await expect(page.getByRole('link', { name: /open on youtube/i })).toHaveAttribute('href', /&t=60$/)
  await page.getByRole('button', { name: 'Edit title' }).click()
  await page.getByRole('textbox', { name: 'Highlight title' }).fill('Edited fixture title')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edited fixture title' })).toBeVisible()
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Use these timestamps' }).click()
  await expect(page.getByLabel('Start (seconds)')).toHaveValue('60')
  await expect(page.getByLabel('End (seconds)')).toHaveValue('85')
  await page.getByRole('button', { name: 'Lock studio' }).click()
  await expect(page.getByRole('heading', { name: 'Unlock the studio' })).toBeVisible()
})

test('shows Gemini quota exhaustion and allows a retry (fixture)', async ({ page }) => {
  await enter(page)
  await page.route('**/api/analyze', (route) => route.fulfill({
    status: 429,
    json: { code: 'gemini_quota', message: 'Gemini quota is exhausted.' },
  }))
  await page.getByLabel('YouTube URL').fill(preferences.url)
  await page.getByRole('button', { name: 'Analyze video' }).click()
  await expect(page.getByRole('alert')).toHaveText('Gemini quota is exhausted.')
  await expect(page.getByRole('button', { name: 'Analyze video' })).toBeEnabled()
})
