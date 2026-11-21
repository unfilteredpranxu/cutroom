import { analysisSchema, type AnalysisRequest } from '../shared/contracts'

export class StudioError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function request(path: string, token: string, payload?: AnalysisRequest, signal?: AbortSignal) {
  let response: Response
  try {
    response = await fetch(path, {
      method: payload ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload && { 'Content-Type': 'application/json' }),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new StudioError('Could not reach Cutroom. Check your connection and try again.', 0)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : 'The studio is temporarily unavailable.'
    const retry = data?.code === 'rate_limited' && typeof data.retryAfter === 'number'
      ? ` Try again in about ${Math.max(1, Math.ceil(data.retryAfter / 60))} min.`
      : ''
    throw new StudioError(message + retry, response.status)
  }

  return data
}

export async function unlockStudio(token: string) {
  const data = await request('/api/session', token)
  if (data?.authenticated !== true) throw new StudioError('Could not verify access to the studio.', 0)
}

export async function analyzeVideo(token: string, payload: AnalysisRequest, signal: AbortSignal) {
  const data = analysisSchema.safeParse(await request('/api/analyze', token, payload, signal))
  if (!data.success) throw new StudioError('The studio received an unreadable analysis. Try again.', 0)
  return data.data
}
