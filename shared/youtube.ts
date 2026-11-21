import { z } from 'zod'

export const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/)
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])

export function parseYouTubeUrl(input: string): string | null {
  if (input.length > 2048) return null

  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null

    let id: string | undefined
    if (url.hostname === 'youtu.be') {
      id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1]
    } else if (youtubeHosts.has(url.hostname)) {
      if (url.pathname === '/watch') {
        const ids = url.searchParams.getAll('v')
        if (ids.length === 1) id = ids[0]
      } else {
        id = /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1]
      }
    }
    return videoIdSchema.safeParse(id).data ?? null
  } catch {
    return null
  }
}

export function watchUrl(id: string, start?: number) {
  const url = new URL('https://www.youtube.com/watch')
  url.searchParams.set('v', id)
  if (start !== undefined) url.searchParams.set('t', String(start))
  return url.toString()
}
