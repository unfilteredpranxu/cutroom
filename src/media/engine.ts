import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import corePath from '@ffmpeg/core?url'
import packedPath from 'virtual:cutroom-ffmpeg'
import { captionsInRange, subtitleScript, type Caption, type CaptionPreset } from './captions'
import { cropFilter, resolutions, type ExportSettings } from './settings'

type Progress = (progress: number | null, message: string) => void
const INPUT = '/source/video'
const OUTPUT = '/cut.mp4'

export async function useMediaEngine<T>(
  file: File,
  signal: AbortSignal,
  progress: Progress,
  task: (engine: FFmpeg, input: string) => Promise<T>,
) {
  const ffmpeg = new FFmpeg()
  const loadSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)])
  const stop = () => ffmpeg.terminate()
  loadSignal.addEventListener('abort', stop, { once: true })
  let wasmUrl: string | undefined
  try {
    progress(null, 'Loading the local video engine')
    const response = await fetch(packedPath, { signal: loadSignal })
    if (!response.ok || !response.body) throw new Error('The video engine download failed. Check your connection and retry.')
    const wasm = await new Response(response.body.pipeThrough(new DecompressionStream('gzip')), {
      headers: { 'Content-Type': 'application/wasm' },
    }).blob()
    loadSignal.throwIfAborted()
    wasmUrl = URL.createObjectURL(wasm)
    await ffmpeg.load({ coreURL: new URL(corePath, location.href).href, wasmURL: wasmUrl })
    URL.revokeObjectURL(wasmUrl)
    wasmUrl = undefined
    loadSignal.removeEventListener('abort', stop)
    signal.addEventListener('abort', stop, { once: true })
    signal.throwIfAborted()

    await ffmpeg.createDir('/source')
    if (!await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'video', data: file }] }, '/source')) {
      throw new Error('This browser could not mount the source video.')
    }
    return await task(ffmpeg, INPUT)
  } finally {
    loadSignal.removeEventListener('abort', stop)
    signal.removeEventListener('abort', stop)
    ffmpeg.terminate()
    if (wasmUrl) URL.revokeObjectURL(wasmUrl)
  }
}

export async function renderClip(
  file: File,
  settings: ExportSettings,
  progress: Progress,
  signal: AbortSignal,
  subtitles?: { captions: Caption[]; preset: CaptionPreset },
) {
  const duration = settings.end - settings.start
  try {
    return await useMediaEngine(file, AbortSignal.any([signal, AbortSignal.timeout(720_000)]), progress, async (ffmpeg, input) => {
      const report = ({ time }: { time: number }) => progress(Math.min(0.99, Math.max(0, time / 1_000_000 / duration)), 'Encoding MP4')
      ffmpeg.on('progress', report)
      let filter = cropFilter(settings)
      if (subtitles && captionsInRange(subtitles.captions, settings).length) {
        progress(null, 'Preparing captions')
        await ffmpeg.createDir('/caption-fonts')
        const fonts = ['DejaVuSans-Bold.ttf', 'NotoSansDevanagari.ttf']
        await Promise.all(fonts.map(async (font) => {
          const response = await fetch('/caption-fonts/' + font, { signal })
          if (!response.ok) throw new Error('Caption fonts could not load. Check your connection and retry.')
          await ffmpeg.writeFile('/caption-fonts/' + font, new Uint8Array(await response.arrayBuffer()))
        }))
        const script = subtitleScript(subtitles.captions, settings, subtitles.preset)
        await ffmpeg.writeFile('/cut.ass', new TextEncoder().encode(script))
        filter += ',ass=/cut.ass:fontsdir=/caption-fonts'
      }
      const { maxRate } = resolutions[settings.resolution]
      progress(0, 'Encoding MP4')
      const code = await ffmpeg.exec([
        '-hide_banner', '-loglevel', 'error', '-threads', '1', '-ss', settings.start.toFixed(3), '-i', input,
        '-t', duration.toFixed(3), '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
        '-filter_threads', '1', '-vf', filter,
        '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-crf', '23',
        '-maxrate', maxRate, '-bufsize', maxRate, '-pix_fmt', 'yuv420p', '-c:a', 'aac',
        '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', OUTPUT,
      ])
      if (code !== 0) throw new Error('The video engine could not encode this source. Try a shorter cut, a lower resolution, or an H.264 source.')
      const bytes = await ffmpeg.readFile(OUTPUT)
      if (typeof bytes === 'string' || bytes.byteLength < 12) throw new Error('The video engine returned an empty file.')
      return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
    })
  } catch (error) {
    if (signal.aborted) throw signal.reason
    if (error instanceof Error && error.name !== 'TimeoutError' && error.message !== 'called FFmpeg.terminate()') throw error
    throw new Error('The video engine could not finish. Retry at 540p or with a shorter cut.')
  }
}
