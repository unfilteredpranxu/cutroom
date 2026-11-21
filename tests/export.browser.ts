import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { ownerToken } from './fixtures'

async function unlock(page: Page) {
  await page.route('**/api/session', (route) => route.fulfill({ json: { authenticated: true } }))
  await page.goto('/')
  await page.getByLabel('Owner access token').fill(ownerToken)
  await page.getByRole('button', { name: 'Unlock studio' }).click()
}

test('real browser encode crops and trims playable H.264/AAC MP4s, then downloads selected clips', async ({ page }, info) => {
  test.skip(!['desktop', 'tablet landscape'].includes(info.project.name), 'Full encode runs on desktop and tablet landscape.')
  test.setTimeout(120_000)
  const input = info.outputPath('authorized-synthetic-input.mp4')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000', '-t', '3',
    '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input])
  await unlock(page)
  await page.getByLabel('Authorized source video').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
  await expect(page.getByText('Choose a local MP4, MOV, or M4V video.')).toBeVisible()
  await page.getByLabel('Authorized source video').setInputFiles(input)
  const exportButton = page.getByRole('button', { name: 'Export MP4' })
  await expect(exportButton).toBeEnabled()

  await page.getByLabel('Start (seconds)').fill('2.6')
  await page.getByLabel('End (seconds)').fill('2.8')
  await exportButton.click()
  await expect(page.getByText('Choose at least 0.25 seconds of video.')).toBeVisible()
  await page.getByLabel('Start (seconds)').fill('0.4')
  await page.getByLabel('End (seconds)').fill('1.7')

  for (const pixels of ['540', '1080']) {
    await page.getByLabel('Clip title').fill('Real export ' + pixels)
    await page.getByLabel('Export resolution').selectOption(pixels)
    await exportButton.click()
    const row = page.locator('.exports-list li').filter({ hasText: 'Real export ' + pixels })
    await expect(row).toBeVisible({ timeout: 65_000 })
    await row.getByRole('button', { name: 'Preview' }).click()
    const video = row.locator('video')
    await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).videoWidth)).toBe(Number(pixels))
    const download = page.waitForEvent('download')
    await row.getByRole('link', { name: 'Download MP4' }).click()
    const output = info.outputPath('actual-' + pixels + '.mp4')
    await (await download).saveAs(output)
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { encoding: 'utf8' }))
    const picture = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video')
    const audio = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === 'audio')
    assert.equal(picture.codec_name, 'h264')
    assert.equal(audio.codec_name, 'aac')
    assert.equal(picture.width, Number(pixels))
    assert.equal(picture.height, Number(pixels) * 16 / 9)
    assert.ok(Math.abs(Number(probe.format.duration) - 1.3) < 0.15)
    execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-'])
    await row.getByRole('checkbox').check()
  }

  await page.getByRole('button', { name: 'Prepare ZIP (2)' }).click()
  const zipDownload = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download selected ZIP' }).click()
  const zip = info.outputPath('actual-selected.zip')
  await (await zipDownload).saveAs(zip)
  expect(execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n')).toEqual([
    '1-Real-export-540.mp4', '2-Real-export-1080.mp4',
  ])
})
