export const MAX_SOURCE_BYTES = 512 * 1024 * 1024
export const MAX_LIBRARY_BYTES = 96 * 1024 * 1024
export const MAX_CLIP_SECONDS = 60

export const resolutions = {
  '540': { width: 540, height: 960, maxRate: '2400k' },
  '720': { width: 720, height: 1280, maxRate: '4200k' },
  '1080': { width: 1080, height: 1920, maxRate: '7500k' },
} as const

export type Resolution = keyof typeof resolutions
export type ClipRange = { start: number; end: number }
export type Framing = { horizontal: number; vertical: number; zoom: number }
export type ExportSettings = ClipRange & Framing & { resolution: Resolution }
export type SuggestedCut = ClipRange & { title: string }

export function rangeError({ start, end }: ClipRange, duration: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration) {
    return 'Use start and end times within the source video.'
  }
  if (end - start < 0.25) return 'Choose at least 0.25 seconds of video.'
  if (end - start > MAX_CLIP_SECONDS) return 'Choose a clip of 60 seconds or less.'
  return ''
}

export function sourceError(file: File) {
  if (!/\.(mp4|mov|m4v)$/i.test(file.name)) return 'Choose a local MP4, MOV, or M4V video.'
  if (file.size === 0 || file.size > MAX_SOURCE_BYTES) return 'Choose a source video between 1 byte and 512 MB.'
  return ''
}

export function exportName(title: string) {
  return (title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'cutroom-clip') + '.mp4'
}

export function cropFilter(settings: ExportSettings) {
  const { width, height } = resolutions[settings.resolution]
  const zoom = Math.min(1.8, Math.max(1, settings.zoom))
  const x = Math.min(100, Math.max(0, settings.horizontal)) / 100
  const y = Math.min(100, Math.max(0, settings.vertical)) / 100
  return [
    'crop=w=\'max(2,trunc(min(iw,ih*9/(16*sar))/' + zoom + '/2)*2)\'' +
      ':h=\'max(2,trunc(min(ih,iw*16*sar/9)/' + zoom + '/2)*2)\'' +
      ':x=\'(iw-ow)*' + x + '\':y=\'(ih-oh)*' + y + '\'',
    'scale=' + width + ':' + height + ':flags=fast_bilinear',
    'setsar=1',
    'fps=30',
  ].join(',')
}
