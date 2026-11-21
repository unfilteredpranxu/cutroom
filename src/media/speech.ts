import { useMediaEngine } from './engine'
import type { Caption } from './captions'
import type { ClipRange } from './settings'

type Progress = (value: number | null, message: string) => void

export async function transcribeClip(file: File, range: ClipRange, report: Progress, signal: AbortSignal) {
  if (typeof AbortSignal.any !== 'function') {
    throw new Error('This browser cannot run local speech recognition. Import an SRT/VTT file.')
  }
  const taskSignal = AbortSignal.any([signal, AbortSignal.timeout(480_000)])
  const pcm = await useMediaEngine(file, taskSignal, report, async (ffmpeg, input) => {
    report(null, 'Reading the selected audio locally')
    const status = await ffmpeg.exec([
      '-v', 'error', '-threads', '1', '-ss', range.start.toFixed(3), '-i', input,
      '-t', (range.end - range.start).toFixed(3), '-map', '0:a:0', '-vn',
      '-ar', '16000', '-ac', '1', '-f', 'f32le', '/speech.pcm',
    ])
    if (status !== 0) throw new Error('No readable audio track was found. You can import captions.')
    const data = await ffmpeg.readFile('/speech.pcm')
    if (typeof data === 'string' || data.byteLength < 1600) throw new Error('The selected audio is too short to transcribe.')
    const copy = new Uint8Array(data)
    return new Float32Array(copy.buffer)
  })
  taskSignal.throwIfAborted()
  let peak = 0
  for (const sample of pcm) peak = Math.max(peak, Math.abs(sample))
  if (peak < 0.001) throw new Error('The audio is nearly silent. Choose a speech segment or import captions.')

  return new Promise<Caption[]>((resolve, reject) => {
    report(null, 'Loading the free Whisper model')
    const worker = new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' })
    const done = () => {
      taskSignal.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      done()
      reject(taskSignal.reason)
    }
    const unavailable = () => {
      done()
      reject(new Error('Local speech recognition is unavailable. Check your connection or import an SRT/VTT file.'))
    }
    taskSignal.addEventListener('abort', abort, { once: true })
    worker.onerror = unavailable
    worker.onmessage = ({ data }) => {
      if (data.type === 'inference') report(null, 'Transcribing speech on this device')
      else if (data.type === 'captions') {
        done()
        resolve(data.captions)
      } else if (data.type === 'failed') unavailable()
    }
    worker.postMessage({ pcm, range }, [pcm.buffer])
  })
}
