import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CaptionEditor } from './CaptionEditor'
import { captionsAreValid, type Caption, type CaptionPreset } from './captions'
import { Library, type RenderedClip } from './Library'
import { exportName, MAX_LIBRARY_BYTES, rangeError, sourceError, type Resolution, type SuggestedCut } from './settings'

type Frame = { duration: number; width: number; height: number }
type Source = { file: File; url: string }
type Job = { fraction: number | null; message: string; kind: 'export' | 'transcription' }

export function Editor({ suggested }: { suggested: SuggestedCut | null }) {
  const [source, setSource] = useState<Source | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [title, setTitle] = useState('My short')
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('')
  const [horizontal, setHorizontal] = useState(50)
  const [vertical, setVertical] = useState(50)
  const [zoom, setZoom] = useState(1)
  const [resolution, setResolution] = useState<Resolution>('540')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [preset, setPreset] = useState<CaptionPreset>('editorial')
  const [burn, setBurn] = useState(true)
  const [previewTime, setPreviewTime] = useState(0)
  const [clips, setClips] = useState<RenderedClip[]>([])
  const video = useRef<HTMLVideoElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const operation = useRef<AbortController | null>(null)
  const outputUrls = useRef(new Set<string>())
  const previewWindow = useRef<{ end: number } | null>(null)

  useEffect(() => {
    if (!suggested) return
    operation.current?.abort()
    setTitle(suggested.title)
    setStart(String(suggested.start))
    setEnd(String(suggested.end))
    setError('')
    setNotice('')
    video.current?.pause()
    previewWindow.current = null
    heading.current?.focus()
  }, [suggested])

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url) }, [source])
  useEffect(() => () => {
    operation.current?.abort()
    outputUrls.current.forEach((url) => URL.revokeObjectURL(url))
    outputUrls.current.clear()
  }, [])

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = sourceError(file)
    setError(problem)
    setNotice('')
    if (problem) return
    setFrame(null)
    setCaptions([])
    setPreviewTime(0)
    previewWindow.current = null
    setSource({ file, url: URL.createObjectURL(file) })
    if (!suggested) {
      setStart('0')
      setEnd('')
    }
  }

  function metadata(event: React.SyntheticEvent<HTMLVideoElement>) {
    const item = event.currentTarget
    if (!Number.isFinite(item.duration) || item.duration <= 0 || !item.videoWidth || !item.videoHeight) {
      setError('This file has no readable video track. Try an H.264 MP4.')
      return
    }
    setFrame({ duration: item.duration, width: item.videoWidth, height: item.videoHeight })
    setEnd((value) => value || String(Math.floor(Math.min(item.duration, 30) * 1000) / 1000))
  }

  const range = { start: start.trim() ? Number(start) : NaN, end: end.trim() ? Number(end) : NaN }

  async function previewCut() {
    if (!frame || !video.current) return
    const problem = rangeError(range, frame.duration)
    setError(problem)
    if (problem) return
    const player = video.current
    player.currentTime = range.start
    previewWindow.current = { end: range.end }
    try {
      await player.play()
    } catch {
      setError('This browser could not start the local preview.')
    }
  }

  async function transcribe() {
    if (!source || !frame || operation.current) return
    const problem = rangeError(range, frame.duration)
    setError(problem)
    setNotice('')
    if (problem) return
    const controller = new AbortController()
    operation.current = controller
    const report = (fraction: number | null, message: string) => {
      if (!controller.signal.aborted) setJob({ fraction, message, kind: 'transcription' })
    }
    report(null, 'Starting transcription')
    video.current?.pause()
    try {
      const { transcribeClip } = await import('./speech')
      controller.signal.throwIfAborted()
      const generated = await transcribeClip(source.file, range, report, controller.signal)
      controller.signal.throwIfAborted()
      if (!generated.length) throw new Error('Whisper did not return usable timed speech. Import or add captions to continue.')
      setCaptions(generated)
      setNotice('Draft captions ready. Review the wording and timing before exporting.')
    } catch (failure) {
      if (controller.signal.aborted) setNotice('Transcription canceled.')
      else setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'Transcription took too long. Try a shorter cut or import captions.')
    } finally {
      operation.current = null
      setJob(null)
    }
  }

  async function exportClip() {
    if (!source || !frame || operation.current) return
    const problem = rangeError(range, frame.duration)
    setError(problem)
    setNotice('')
    if (problem) return
    if (burn && !captionsAreValid(captions, frame.duration)) {
      setError('Review the captions. Each cue needs text and a valid range within the source video.')
      return
    }
    const subtitles = burn ? { captions, preset } : undefined
    if (clips.reduce((total, clip) => total + clip.blob.size, 0) >= MAX_LIBRARY_BYTES) {
      setError('Download and remove a previous clip before starting another export.')
      return
    }
    const controller = new AbortController()
    operation.current = controller
    const report = (fraction: number | null, message: string) => {
      if (!controller.signal.aborted) setJob({ fraction, message, kind: 'export' })
    }
    report(null, 'Starting export')
    video.current?.pause()
    try {
      const { renderClip } = await import('./engine')
      controller.signal.throwIfAborted()
      const settings = { ...range, horizontal, vertical, zoom, resolution }
      let actualResolution = resolution
      let blob: Blob
      try {
        blob = await renderClip(source.file, settings, report, controller.signal, subtitles)
      } catch (failure) {
        if (controller.signal.aborted || resolution === '540') throw failure
        setNotice('The requested resolution could not be encoded. Retrying at 540 × 960.')
        actualResolution = '540'
        blob = await renderClip(source.file, { ...settings, resolution: actualResolution }, report, controller.signal, subtitles)
      }
      controller.signal.throwIfAborted()
      if (clips.reduce((total, clip) => total + clip.blob.size, blob.size) > MAX_LIBRARY_BYTES) {
        throw new Error('The session library is full. Download and remove a previous clip, then retry.')
      }
      const url = URL.createObjectURL(blob)
      outputUrls.current.add(url)
      const name = title.trim() || 'My short'
      setClips((current) => [...current, {
        id: crypto.randomUUID(), title: name, filename: exportName(name), blob, url, resolution: actualResolution,
      }])
      setNotice(actualResolution !== resolution ? 'MP4 ready at the 540 × 960 fallback resolution.' : 'MP4 ready in the session library.')
    } catch (failure) {
      if (controller.signal.aborted) setNotice('Export canceled.')
      else setError(failure instanceof Error ? failure.message : 'Export could not finish.')
    } finally {
      if (operation.current === controller) {
        operation.current = null
        setJob(null)
      }
    }
  }

  const activeCaption = burn ? captions.find((caption) => caption.start <= previewTime && caption.end > previewTime) : undefined

  return (
    <div className="editing-area">
      <section id="cut-editor" className="panel cut-editor" aria-labelledby="cut-editor-title">
        <div className="section-bar">
          <h2 id="cut-editor-title" ref={heading} tabIndex={-1}>Cut editor</h2>
          <span className="muted">9:16 MP4</span>
        </div>
        <div className="editor-grid">
          <div className="editor-settings">
            <fieldset disabled={!!job}>
              <legend className="sr-only">Clip settings</legend>
              <label htmlFor="local-video">Authorized source video</label>
              <input type="file" id="local-video" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" onChange={chooseFile} />
              <p className="field-help">{source ? source.file.name + (frame ? ` · ${frame.duration.toFixed(2)}s · ${frame.width} × ${frame.height}` : '') : 'Choose the matching video you have permission to edit. The file stays on this device.'}</p>
              <label htmlFor="output-title">Clip title</label>
              <input id="output-title" maxLength={90} value={title} onChange={(event) => setTitle(event.target.value)} />
              <div className="preferences">
                <div><label htmlFor="cut-start">Start (seconds)</label><input id="cut-start" type="number" min="0" max={frame?.duration} step="0.001" inputMode="decimal" value={start} onChange={(event) => setStart(event.target.value)} /></div>
                <div><label htmlFor="cut-end">End (seconds)</label><input id="cut-end" type="number" min="0" max={frame?.duration} step="0.001" inputMode="decimal" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
              </div>
              <div className="range-tools">
                <label htmlFor="horizontal">Horizontal framing</label>
                <input id="horizontal" type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} />
                <label htmlFor="vertical">Vertical framing</label>
                <input id="vertical" type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} />
                <label htmlFor="zoom">Zoom</label>
                <input id="zoom" type="range" min="1" max="1.8" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              </div>
              <label htmlFor="resolution">Export resolution</label>
              <select id="resolution" value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}>
                <option value="540">540 × 960 · lighter</option>
                <option value="720">720 × 1280</option>
                <option value="1080">1080 × 1920 · highest</option>
              </select>
              <CaptionEditor {...{ captions, setCaptions, range, preset, setPreset, burn, setBurn }} canTranscribe={!!frame} onTranscribe={transcribe} />
              <div className="editor-actions">
                <button type="button" className="secondary" disabled={!frame} onClick={previewCut}>Play cut</button>
                <button type="button" className="primary" disabled={!frame} onClick={exportClip}>Export MP4 <span aria-hidden="true">↗</span></button>
              </div>
            </fieldset>
            {job && (
              <div className="job-state">
                <span id="export-status" role="status">{job.message}{job.fraction !== null ? ` · ${Math.floor(job.fraction * 100)}%` : ''}</span>
                <progress aria-labelledby="export-status" value={job.fraction ?? undefined} max={1} />
                <button type="button" className="secondary" onClick={() => operation.current?.abort()}>Cancel {job.kind}</button>
              </div>
            )}
            {notice && <p className="field-help" role="status">{notice}</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </div>
          <div className="editor-monitor">
            <div className="vertical-monitor">
              {source ? (
                <video key={source.url} ref={video} src={source.url} preload="metadata" playsInline
                  aria-label="Local cropped video preview"
                  style={{ objectPosition: `${horizontal}% ${vertical}%`, transformOrigin: `${horizontal}% ${vertical}%`, transform: `scale(${zoom})` }}
                  onLoadedMetadata={metadata}
                  onError={() => { setFrame(null); setError('The browser could not read this video. Try an H.264 MP4.') }}
                  onTimeUpdate={(event) => {
                    setPreviewTime(event.currentTarget.currentTime)
                    if (previewWindow.current && event.currentTarget.currentTime >= previewWindow.current.end) {
                      event.currentTarget.pause()
                      previewWindow.current = null
                    }
                  }}
                />
              ) : <p>Vertical preview</p>}
              {activeCaption && (
                <div className={`caption-overlay caption-${preset}`} aria-hidden="true">
                  {preset === 'kinetic' && activeCaption.words
                    ? activeCaption.words.map((word) => <span key={word.start} className={word.start <= previewTime ? 'spoken' : ''}>{word.text} </span>)
                    : activeCaption.text}
                </div>
              )}
            </div>
            {frame && <button type="button" className="text-button" onClick={() => video.current?.pause()}>Pause preview</button>}
          </div>
        </div>
      </section>
      <Library clips={clips} onRemove={(id) => {
        const clip = clips.find((item) => item.id === id)
        if (!clip) return
        URL.revokeObjectURL(clip.url)
        outputUrls.current.delete(clip.url)
        setClips((current) => current.filter((item) => item.id !== id))
      }} />
    </div>
  )
}
