import { expect, it } from 'vitest'
import { MODEL } from '../shared/contracts'
import { parseYouTubeUrl } from '../shared/youtube'
import { analyzeWithGemini } from '../worker/gemini'

const live = process.env.CUTROOM_GEMINI_LIVE === '1'
const key = process.env.GEMINI_API_KEY

it.skipIf(!live || !key)('LIVE Gemini: analyzes an explicitly selected public video', async () => {
  const url = process.env.CUTROOM_LIVE_YOUTUBE_URL ?? ''
  const id = parseYouTubeUrl(url)
  if (!id) throw new Error('Set CUTROOM_LIVE_YOUTUBE_URL to a suitable public YouTube video.')
  const result = await analyzeWithGemini(key!, id, { url, count: 5, length: 'balanced' })
  expect(result.model).toBe(MODEL)
  expect(result.videoId).toBe(id)
  expect(result.clips.length).toBeGreaterThan(0)
}, 110_000)
