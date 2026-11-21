import { useEffect, useRef, useState } from 'react'
import { resolutions, type Resolution } from './settings'

export interface RenderedClip {
  id: string
  title: string
  filename: string
  blob: Blob
  url: string
  resolution: Resolution
}

export function Library({ clips, onRemove }: { clips: RenderedClip[]; onRemove: (id: string) => void }) {
  const [selection, setSelection] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [zip, setZip] = useState<string | null>(null)
  const [packing, setPacking] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => () => { if (zip) URL.revokeObjectURL(zip) }, [zip])

  const selected = clips.filter((clip) => selection.includes(clip.id))

  async function pack() {
    setPacking(true)
    setError('')
    try {
      const { downloadZip } = await import('client-zip')
      const blob = await downloadZip(selected.map((clip, index) => ({
        name: `${index + 1}-${clip.filename}`,
        input: clip.blob,
      }))).blob()
      if (mounted.current) setZip(URL.createObjectURL(blob))
    } catch {
      if (mounted.current) setError('The archive could not be prepared. Download the clips individually.')
    } finally {
      if (mounted.current) setPacking(false)
    }
  }

  return (
    <section className="panel clip-library" aria-labelledby="library-title">
      <div className="section-bar">
        <h2 id="library-title">Session library</h2>
        <span className="muted">{clips.length} {clips.length === 1 ? 'clip' : 'clips'}</span>
      </div>
      <div className="library-inner">
        {!clips.length && <p className="muted">Finished MP4s appear here. Download them before closing or locking Cutroom.</p>}
        {clips.length > 0 && (
          <>
            <div className="library-actions">
              <button type="button" className="secondary" disabled={packing || !selected.length} onClick={pack}>
                {packing ? 'Preparing archive…' : `Prepare ZIP (${selected.length})`}
              </button>
              {zip && <a href={zip} download="cutroom-clips.zip" className="source-link">Download selected ZIP</a>}
            </div>
            {error && <p role="alert" className="error">{error}</p>}
            <ul className="exports-list">
              {clips.map((clip) => (
                <li key={clip.id}>
                  <div className="export-row">
                    <label className="check-label">
                      <input type="checkbox" disabled={packing} checked={selection.includes(clip.id)} onChange={(event) => {
                        setZip(null)
                        setSelection(event.target.checked ? [...selection, clip.id] : selection.filter((id) => id !== clip.id))
                      }} />
                      <span><strong>{clip.title}</strong><small>{resolutions[clip.resolution].width} × {resolutions[clip.resolution].height} · {(clip.blob.size / (1024 * 1024)).toFixed(1)} MB</small></span>
                    </label>
                    <button type="button" className="text-button" aria-expanded={active === clip.id} onClick={() => setActive(active === clip.id ? null : clip.id)}>{active === clip.id ? 'Hide' : 'Preview'}</button>
                    <a className="source-link" href={clip.url} download={clip.filename}>Download MP4</a>
                    <button type="button" className="text-button" disabled={packing} aria-label={`Remove ${clip.title}`} onClick={() => {
                      setZip(null)
                      setSelection(selection.filter((id) => id !== clip.id))
                      onRemove(clip.id)
                    }}>Remove</button>
                  </div>
                  {active === clip.id && <video className="export-preview" src={clip.url} controls playsInline preload="metadata" aria-label={`Exported video: ${clip.title}`} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
