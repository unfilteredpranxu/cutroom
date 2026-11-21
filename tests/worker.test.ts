import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseYouTubeUrl } from '../shared/youtube'
import { analyzeWithGemini, parseHighlights } from '../worker/gemini'
import { handleRequest, type Env } from '../worker/handler'
import { ApiError } from '../worker/errors'
import { fixture, geminiFixture, higherScore, lowerScore, ownerToken, preferences, videoId } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

describe('YouTube URLs', () => {
  it.each([
    preferences.url,
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://m.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
  ])('accepts %s', (url) => expect(parseYouTubeUrl(url)).toBe(videoId))

  it.each([
    'http://youtu.be/ixRanV-rdAQ',
    'https://www.youtube.com.bad.test/watch?v=ixRanV-rdAQ',
    'https://www.youtube.com@bad.test/watch?v=ixRanV-rdAQ',
    'https://test@www.youtube.com/watch?v=ixRanV-rdAQ',
    'https://youtu.be:8443/ixRanV-rdAQ',
    'https://www.youtube.com/watch?v=ixRanV-rdAQ&v=ixRanV-rdAQ',
    'https://www.youtube.com/playlist?list=123',
    'https://youtu.be/not-an-id',
    'https://127.0.0.1/ixRanV-rdAQ',
  ])('rejects %s', (url) => expect(parseYouTubeUrl(url)).toBeNull())
})

describe('Gemini structured results', () => {
  it('ranks, deduplicates and drops out-of-bounds or invalid candidates', () => {
    const clips = [
      lowerScore,
      { ...higherScore, source_start_seconds: 9, quality_score: 60 },
      { ...higherScore, source_end_seconds: 12 },
      { ...lowerScore, source_start_seconds: 100, source_end_seconds: 125 },
      { ...higherScore, source_start_seconds: -1 },
      { ...higherScore, quality_score: 120 },
      { ...higherScore, source_start_seconds: 10.5 },
      { ...higherScore, transcript_excerpt_if_supported: 'Unverified quote' },
      higherScore,
    ]
    expect(parseHighlights(JSON.stringify({ source_duration_seconds: 120, clips }), videoId, 5)).toEqual(fixture)
  })

  it('allows an empty result and unknown duration', () => {
    expect(parseHighlights('{"source_duration_seconds":null,"clips":[]}', videoId, 5).clips).toEqual([])
  })

  it.each([undefined, 'not JSON', '{"clips":[]}', '{"source_duration_seconds":60,"clips":[{}]}'])(
    'rejects incomplete output %s',
    (value) => expect(() => parseHighlights(value, videoId, 5)).toThrow(ApiError),
  )

  it('uses the real SDK transport with a labeled synthetic Google response', async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
      expect(request.headers.get('x-goog-api-key')).toBe('fixture-api-key')
      const payload = await request.json()
      expect(payload).toMatchObject({
        model: 'gemini-4-hydrogen',
        store: false,
        input: [
          { type: 'video', uri: `https://www.youtube.com/watch?v=${videoId}`, processing: 'agentic' },
          { type: 'text' },
        ],
      })
      const format = Array.isArray(payload.response_format) ? payload.response_format[0] : payload.response_format
      expect(format).toMatchObject({ type: 'text', mime_type: 'application/json', schema: { type: 'object' } })
      return Response.json(geminiFixture)
    })
    vi.stubGlobal('fetch', fetch)
    await expect(analyzeWithGemini('fixture-api-key', videoId, preferences)).resolves.toEqual(fixture)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    [400, 422, 'video_unavailable'],
    [403, 503, 'gemini_access'],
    [404, 503, 'gemini_access'],
    [429, 429, 'gemini_quota'],
    [504, 504, 'gemini_timeout'],
    [500, 502, 'gemini_unavailable'],
  ])('sanitizes upstream HTTP %d and does not retry', async (status, mapped, code) => {
    const fetch = vi.fn(async () => Response.json({ error: { message: 'sensitive upstream text' } }, { status }))
    vi.stubGlobal('fetch', fetch)
    await expect(analyzeWithGemini('fixture-api-key', videoId, preferences)).rejects.toMatchObject({ status: mapped, code })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

function analyzeRequest(body: unknown, token = ownerToken) {
  return new Request('https://cutroom.test/api/analyze', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function workerFixture(quota = new Response(null, { status: 204 })) {
  const consume = vi.fn(async () => quota)
  const analyze = vi.fn(async () => fixture)
  const env: Env = {
    CUTROOM_OWNER_TOKEN: ownerToken,
    GEMINI_API_KEY: 'fixture-api-key',
    ANALYSIS_QUOTA: { getByName: () => ({ fetch: consume }) },
  }
  return { env, consume, analyze }
}

describe('Worker API', () => {
  it('requires authentication before quota or Gemini', async () => {
    const { env, analyze, consume } = workerFixture()
    const response = await handleRequest(analyzeRequest(preferences, 'x'.repeat(32)), env, analyze)
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(consume).not.toHaveBeenCalled()
    expect(analyze).not.toHaveBeenCalled()
  })

  it('rejects invalid URLs and oversized bodies without consuming quota', async () => {
    const { env, analyze, consume } = workerFixture()
    expect(await (await handleRequest(analyzeRequest({ ...preferences, url: 'https://bad.test' }), env, analyze)).json())
      .toMatchObject({ code: 'invalid_youtube_url' })
    expect((await handleRequest(analyzeRequest({ ...preferences, url: 'a'.repeat(4100) }), env, analyze)).status).toBe(413)
    expect(consume).not.toHaveBeenCalled()
    expect(analyze).not.toHaveBeenCalled()
  })

  it('blocks at the shared quota and provides Retry-After', async () => {
    const { env, analyze } = workerFixture(new Response(null, { status: 429, headers: { 'Retry-After': '36' } }))
    const response = await handleRequest(analyzeRequest(preferences), env, analyze)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('36')
    expect(analyze).not.toHaveBeenCalled()
  })

  it('requires runtime configuration', async () => {
    const { env, analyze, consume } = workerFixture()
    env.GEMINI_API_KEY = undefined
    expect((await handleRequest(analyzeRequest(preferences), env, analyze)).status).toBe(503)
    expect(consume).not.toHaveBeenCalled()
    expect(analyze).not.toHaveBeenCalled()
  })

  it('passes a validated ID to analysis', async () => {
    const { env, analyze, consume } = workerFixture()
    const response = await handleRequest(analyzeRequest(preferences), env, analyze)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(fixture)
    expect(consume).toHaveBeenCalledTimes(1)
    expect(analyze).toHaveBeenCalledWith(env.GEMINI_API_KEY, videoId, preferences)
  })
})
