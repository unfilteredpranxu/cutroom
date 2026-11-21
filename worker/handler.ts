import { analysisRequestSchema } from '../shared/contracts'
import { parseYouTubeUrl } from '../shared/youtube'
import { isOwner, ownerTokenPattern } from './auth'
import { ApiError } from './errors'
import { analyzeWithGemini } from './gemini'

export interface Env {
  CUTROOM_OWNER_TOKEN?: string
  GEMINI_API_KEY?: string
  ANALYSIS_QUOTA?: {
    getByName(name: string): { fetch(url: string): Promise<Response> }
  }
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders)
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  return Response.json(data, { status, headers })
}

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') throw new ApiError(415, 'content_type', 'Send an application/json request.')

  const limit = 4096
  if (Number(request.headers.get('Content-Length')) > limit) {
    throw new ApiError(413, 'body_too_large', 'The request is too large.')
  }
  if (!request.body) throw new ApiError(400, 'invalid_json', 'The request body must contain valid JSON.')

  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new ApiError(413, 'body_too_large', 'The request is too large.')
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } catch (error) {
    void reader.cancel().catch(() => {})
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'invalid_json', 'The request body must contain valid JSON.')
  } finally {
    reader.releaseLock()
  }
}

export async function handleRequest(request: Request, env: Env, analyze = analyzeWithGemini) {
  try {
    const path = new URL(request.url).pathname
    const method = path === '/api/session' ? 'GET' : path === '/api/analyze' ? 'POST' : null
    if (!method) return json({ code: 'not_found', message: 'This endpoint does not exist.' }, 404)
    if (request.method !== method) {
      return json({ code: 'method_not_allowed', message: 'This method is unavailable.' }, 405, { Allow: method })
    }
    if (!env.CUTROOM_OWNER_TOKEN || !ownerTokenPattern.test(env.CUTROOM_OWNER_TOKEN)) {
      throw new ApiError(503, 'owner_unconfigured', 'Set the owner token in the Worker settings.')
    }
    if (!await isOwner(request, env.CUTROOM_OWNER_TOKEN)) {
      return json({ code: 'unauthorized', message: 'Enter a valid owner access token.' }, 401, {
        'WWW-Authenticate': 'Bearer realm="Cutroom"',
      })
    }
    if (path === '/api/session') return json({ authenticated: true })

    const input = analysisRequestSchema.safeParse(await readBody(request))
    if (!input.success) throw new ApiError(400, 'invalid_input', 'Choose 5–10 clips, a clip length, and a YouTube URL.')
    const videoId = parseYouTubeUrl(input.data.url)
    if (!videoId) throw new ApiError(400, 'invalid_youtube_url', 'Enter a valid HTTPS link to a single public YouTube video.')
    if (!env.GEMINI_API_KEY || !env.ANALYSIS_QUOTA) {
      throw new ApiError(503, 'analysis_unconfigured', 'Set the Gemini key and analysis quota binding in the Worker settings.')
    }

    const quota = await env.ANALYSIS_QUOTA.getByName('owner').fetch('https://quota.internal/consume')
    if (quota.status === 429) {
      const retry = Math.max(1, Number(quota.headers.get('Retry-After')) || 60)
      throw new ApiError(429, 'rate_limited', 'The studio analysis limit has been reached. Try again after the cooldown.', retry)
    }
    if (quota.status !== 204) throw new ApiError(503, 'quota_unavailable', 'The studio quota check is temporarily unavailable.')
    return json(await analyze(env.GEMINI_API_KEY, videoId, input.data))
  } catch (error) {
    if (error instanceof ApiError) {
      const headers = error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined
      return json({ code: error.code, message: error.message, retryAfter: error.retryAfter }, error.status, headers)
    }
    return json({ code: 'unavailable', message: 'The studio is temporarily unavailable. Try again later.' }, 503)
  }
}
