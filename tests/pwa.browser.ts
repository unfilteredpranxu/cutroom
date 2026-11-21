import { expect, test } from '@playwright/test'
import { ownerToken } from './fixtures'

test('the installable shell works offline and leaves authenticated API responses uncached', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Service worker cache is checked once.')
  await page.route('**/api/session', (route) => route.fulfill({ json: { authenticated: true } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeVisible()
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href
    return href ? await (await fetch(href)).json() : null
  })
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512'])

  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.getByLabel('Owner access token').fill(ownerToken)
  await page.getByRole('button', { name: 'Unlock studio' }).click()
  await expect(page.getByRole('heading', { name: 'Generate highlights' })).toBeVisible()
  const cached = await page.evaluate(async () => (await (await caches.open('cutroom-shell-v1')).keys()).map((request) => request.url))
  expect(cached.every((url) => !url.includes('/api/') && !url.startsWith('blob:'))).toBe(true)

  await page.unroute('**/api/session')
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Unlock the studio' })).toBeVisible()
  await page.getByLabel('Owner access token').fill(ownerToken)
  await page.getByRole('button', { name: 'Unlock studio' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not reach Cutroom')
})
