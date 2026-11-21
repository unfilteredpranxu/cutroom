import { useState, type ChangeEvent } from 'react'
import { MAX_CAPTIONS, parseCaptions, presets, type Caption, type CaptionPreset } from './captions'
import type { ClipRange } from './settings'

interface Props {
  captions: Caption[]
  setCaptions: (captions: Caption[]) => void
  range: ClipRange
  preset: CaptionPreset
  setPreset: (preset: CaptionPreset) => void
  burn: boolean
  setBurn: (burn: boolean) => void
  canTranscribe: boolean
  onTranscribe: () => void
}

export function CaptionEditor({ captions, setCaptions, range, preset, setPreset, burn, setBurn, canTranscribe, onTranscribe }: Props) {
  const [timing, setTiming] = useState<'clip' | 'source'>('clip')
  const [error, setError] = useState('')

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      if (file.size > 128 * 1024 || !/\.(srt|vtt)$/i.test(file.name)) {
        throw new Error('Choose an SRT or VTT file under 128 KB.')
      }
      if (timing === 'clip' && (!Number.isFinite(range.start) || range.start < 0)) {
        throw new Error('Set a valid clip start before importing clip-relative captions.')
      }
      const text = await file.text()
      setCaptions(parseCaptions(text, timing === 'clip' ? range.start : 0))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The caption file could not be read.')
    }
  }

  function update(id: string, changes: Partial<Caption>) {
    setCaptions(captions.map((caption) => caption.id === id ? { ...caption, ...changes, words: undefined } : caption))
  }

  function add() {
    const start = Number.isFinite(range.start) ? Math.max(0, range.start) : 0
    const end = Number.isFinite(range.end) && range.end > start ? Math.min(start + 2, range.end) : start + 2
    setCaptions([...captions, { id: crypto.randomUUID(), start, end, text: '' }])
  }

  return (
    <details className="caption-settings">
      <summary>Captions {captions.length > 0 && <span>· {captions.length}</span>}</summary>
      <div className="caption-body">
        <button className="secondary" type="button" disabled={!canTranscribe} onClick={onTranscribe}>Transcribe this cut on device</button>
        <p className="field-help">Downloads the free Whisper model on first use. Review the generated words and timings before export. Transcription replaces the current cues.</p>
        <div className="preferences caption-options">
          <div><label htmlFor="caption-import-timing">Import times relative to</label><select id="caption-import-timing" value={timing} onChange={(event) => setTiming(event.target.value === 'source' ? 'source' : 'clip')}><option value="clip">Selected clip</option><option value="source">Source video</option></select></div>
          <div><label htmlFor="caption-preset">Caption preset</label><select id="caption-preset" value={preset} onChange={(event) => setPreset(event.target.value as CaptionPreset)}>{Object.entries(presets).map(([key, style]) => <option key={key} value={key}>{style.label}</option>)}</select></div>
        </div>
        <label htmlFor="import-captions">Import SRT or VTT</label>
        <input id="import-captions" type="file" accept=".srt,.vtt" onChange={importFile} />
        <p className="field-help">Import replaces the current cues. Cue timings below use source seconds. Kinetic highlighting uses available word timings, and editing a cue clears its word timing.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {captions.length > 0 && (
          <ol className="cue-list">
            {captions.map((caption, index) => (
              <li key={caption.id}>
                <label htmlFor={'cue-' + caption.id}>Caption {index + 1}</label>
                <textarea id={'cue-' + caption.id} value={caption.text} maxLength={240} rows={2} onChange={(event) => update(caption.id, { text: event.target.value })} />
                <div className="cue-time">
                  <div><label htmlFor={'cue-in-' + caption.id}>In (seconds)</label><input id={'cue-in-' + caption.id} type="number" min="0" step="0.001" value={Number.isFinite(caption.start) ? caption.start : ''} onChange={(event) => update(caption.id, { start: event.target.valueAsNumber })} /></div>
                  <div><label htmlFor={'cue-out-' + caption.id}>Out (seconds)</label><input id={'cue-out-' + caption.id} type="number" min="0" step="0.001" value={Number.isFinite(caption.end) ? caption.end : ''} onChange={(event) => update(caption.id, { end: event.target.valueAsNumber })} /></div>
                  <button className="text-button" type="button" onClick={() => setCaptions(captions.filter((cue) => cue.id !== caption.id))} aria-label={`Remove caption ${index + 1}`}>Remove</button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="caption-actions">
          <button type="button" className="secondary" onClick={add} disabled={captions.length >= MAX_CAPTIONS}>Add caption</button>
          <label className="check-label burn-label"><input type="checkbox" checked={burn} onChange={(event) => setBurn(event.target.checked)} /> Burn captions into MP4</label>
        </div>
      </div>
    </details>
  )
}
