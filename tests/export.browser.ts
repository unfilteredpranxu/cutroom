import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { ownerToken } from './fixtures'

test.use({ serviceWorkers: 'block' })

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
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=320x360:rate=30',
    '-f', 'lavfi', '-i', 'color=blue:size=320x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000',
    '-filter_complex', '[0:v][1:v]hstack[picture]', '-map', '[picture]', '-map', '2:a', '-t', '3',
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
    const framing = page.getByLabel('Horizontal framing')
    await framing.focus()
    await framing.press(pixels === '540' ? 'Home' : 'End')
    await expect(framing).toHaveValue(pixels === '540' ? '0' : '100')
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
    const [red, , blue] = execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-frames:v', '1',
      '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
    assert.ok(pixels === '540' ? red > 210 && blue < 40 : blue > 210 && red < 40, 'Framing should crop away the opposite half.')
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

test('real burned captions appear only inside the imported source time range', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Pixel verification runs once on desktop.')
  test.setTimeout(100_000)
  const input = info.outputPath('authorized-captions-source.mp4')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x15243a:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000', '-t', '3',
    '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input])
  await unlock(page)
  await page.getByLabel('Authorized source video').setInputFiles(input)
  await expect(page.getByRole('button', { name: 'Export MP4' })).toBeEnabled()
  await page.getByLabel('Start (seconds)').fill('0.4')
  await page.getByLabel('End (seconds)').fill('2.0')
  await page.locator('.caption-settings summary').click()
  await page.getByLabel('Import SRT or VTT').setInputFiles({
    name: 'authorized-captions.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from('1\n00:00:00,300 --> 00:00:00,950\nREAL CAPTIONS\n'),
  })
  await expect(page.getByLabel('In (seconds)')).toHaveValue('0.7')
  await page.getByLabel('Caption 1', { exact: true }).fill('EDITED CAPTIONS')
  await page.getByLabel('Out (seconds)').fill('1.45')
  await page.getByLabel('Caption preset').selectOption('studio')
  await page.getByRole('button', { name: 'Export MP4' }).click()
  const link = page.getByRole('link', { name: 'Download MP4' })
  await expect(link).toBeVisible({ timeout: 65_000 })
  const download = page.waitForEvent('download')
  await link.click()
  const output = info.outputPath('actual-captioned.mp4')
  await (await download).saveAs(output)
  function whitePixels(at: string) {
    const bytes = execFileSync('ffmpeg', ['-v', 'error', '-ss', at, '-i', output, '-frames:v', '1',
      '-vf', 'crop=400:140:60:710', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
    let count = 0
    for (let index = 0; index < bytes.length; index += 3) {
      if (bytes[index] > 210 && bytes[index + 1] > 210 && bytes[index + 2] > 210) count++
    }
    return count
  }
  assert.equal(whitePixels('0.05'), 0)
  assert.ok(whitePixels('0.6') > 100, 'Readable white caption glyphs should be burned into the frame.')
  assert.equal(whitePixels('1.3'), 0)
  execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-'])
})

test('a model download failure preserves the editable caption workflow', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Model transport fallback runs once.')
  const input = info.outputPath('authorized-audio-fallback.mp4')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:size=320x180:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=450:sample_rate=48000', '-t', '1',
    '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input])
  await unlock(page)
  await page.getByLabel('Authorized source video').setInputFiles(input)
  await page.locator('.caption-settings summary').click()
  let requests = 0
  await page.route('https://huggingface.co/**', (route) => {
    requests++
    expect(route.request().method()).toBe('GET')
    expect(route.request().postData()).toBeNull()
    return route.abort()
  })
  await page.getByRole('button', { name: 'Transcribe this cut on device' }).click()
  await expect(page.getByText('Local speech recognition is unavailable.', { exact: false })).toBeVisible({ timeout: 25_000 })
  expect(requests).toBeGreaterThan(0)
  await page.getByLabel('Import SRT or VTT').setInputFiles({
    name: 'local.vtt', mimeType: 'text/vtt',
    buffer: Buffer.from('WEBVTT\n\n00:00.100 --> 00:00.850\nLocal captions\n'),
  })
  await expect(page.getByLabel('Caption 1', { exact: true })).toHaveValue('Local captions')
})

test('canceling a real encode releases the job and allows another export', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Encode cancellation runs once.')
  test.setTimeout(70_000)
  const input = info.outputPath('authorized-cancellation-source.mp4')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=620:sample_rate=48000', '-t', '8',
    '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input])
  await unlock(page)
  await page.getByLabel('Authorized source video').setInputFiles(input)
  await page.getByLabel('Export resolution').selectOption('1080')
  await page.getByRole('button', { name: 'Export MP4' }).click()
  await expect(page.getByRole('progressbar')).toHaveAccessibleName(/Encoding MP4/, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Cancel export' }).click()
  await expect(page.getByText('Export canceled.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download MP4' })).toHaveCount(0)
  await page.getByLabel('Export resolution').selectOption('540')
  await page.getByLabel('End (seconds)').fill('1.0')
  await page.getByRole('button', { name: 'Export MP4' }).click()
  await expect(page.getByRole('link', { name: 'Download MP4' })).toBeVisible({ timeout: 25_000 })
  await page.getByRole('button', { name: 'Clear source' }).click()
  await expect(page.getByRole('button', { name: 'Export MP4' })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Download MP4' })).toBeVisible()
})
