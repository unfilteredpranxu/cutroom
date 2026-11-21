import { useState } from 'react'
import type { Analysis, Clip } from '../shared/contracts'
import { watchUrl } from '../shared/youtube'

function timecode(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0')
  const rest = String(seconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`
}

function range(clip: Clip) {
  return `${timecode(clip.source_start_seconds)} – ${timecode(clip.source_end_seconds)}`
}

export function Review({ analysis }: { analysis: Analysis }) {
  const [clips, setClips] = useState(analysis.clips)
  const [selectedIndex, selectClip] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const selected = clips[selectedIndex]

  if (!selected) {
    return (
      <div className="empty-panel">
        <h3>No highlights found</h3>
        <p>Try another public video with clearer, self-contained moments.</p>
      </div>
    )
  }

  const trackEnd = analysis.sourceDurationSeconds ?? Math.max(...clips.map((clip) => clip.source_end_seconds))
  const anchor = watchUrl(analysis.videoId, selected.source_start_seconds)
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${analysis.videoId}`)
  embed.searchParams.set('start', String(selected.source_start_seconds))
  embed.searchParams.set('end', String(selected.source_end_seconds))
  embed.searchParams.set('autoplay', '1')
  embed.searchParams.set('playsinline', '1')

  return (
    <div className="review">
      <section className="clip-detail" aria-label="Selected highlight">
        <div className="preview">
          {preview === selected.id ? (
            <iframe src={embed.href} title="YouTube source preview" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          ) : (
            <>
              <img src={`https://i.ytimg.com/vi/${analysis.videoId}/hqdefault.jpg`} alt="" referrerPolicy="no-referrer" />
              <button type="button" className="preview-button" onClick={() => setPreview(selected.id)} aria-label={`Play preview at ${timecode(selected.source_start_seconds)}`}>
                <span aria-hidden="true">▶</span>
              </button>
            </>
          )}
          <span className="time-overlay">{range(selected)}</span>
        </div>
        <div className="timeline">
          <svg viewBox="0 0 1000 16" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="4" width="1000" height="8" rx="3" fill="currentColor" />
            {clips.map((clip) => (
              <rect
                key={clip.id}
                className={clip.id === selected.id ? 'segment active' : 'segment'}
                x={1000 * clip.source_start_seconds / trackEnd}
                y="2"
                width={1000 * (clip.source_end_seconds - clip.source_start_seconds) / trackEnd}
                height="12"
                rx="2"
              />
            ))}
          </svg>
          <div className="timeline-label"><span>00:00</span><span>{timecode(trackEnd)} {analysis.sourceDurationSeconds === null ? '· last selection' : '· reported duration'}</span></div>
        </div>
        <div className="detail-top">
          <span className="category">{selected.content_category}</span>
          <span className="stamp">{selected.verification_status === 'uncertain' ? 'Uncertain timestamps' : 'Estimated timestamps'}</span>
        </div>
        {editing ? (
          <form className="title-edit" onSubmit={(event) => {
            event.preventDefault()
            if (!title.trim()) return
            setClips((current) => current.map((clip) => clip.id === selected.id ? { ...clip, title: title.trim() } : clip))
            setEditing(false)
            requestAnimationFrame(() => document.getElementById('edit-title-button')?.focus())
          }}>
            <label htmlFor="edit-title" className="sr-only">Highlight title</label>
            <input id="edit-title" autoFocus required maxLength={90} value={title} onChange={(event) => setTitle(event.target.value)} />
            <button type="submit" className="secondary">Save</button>
            <button type="button" className="text-button" onClick={() => {
              setEditing(false)
              requestAnimationFrame(() => document.getElementById('edit-title-button')?.focus())
            }}>Cancel</button>
          </form>
        ) : (
          <div className="detail-title">
            <h3>{selected.title}</h3>
            <button id="edit-title-button" type="button" className="text-button" onClick={() => { setTitle(selected.title); setEditing(true) }}>Edit title</button>
          </div>
        )}
        <dl className="clip-notes">
          <div><dt>Opening hook</dt><dd>{selected.opening_hook}</dd></div>
          <div><dt>Why it works</dt><dd>{selected.rationale}</dd></div>
        </dl>
        <a className="source-link" href={anchor} target="_blank" rel="noopener noreferrer">Open on YouTube at {timecode(selected.source_start_seconds)} <span aria-hidden="true">↗</span></a>
      </section>
      <ol className="clip-list" aria-label="Highlights ranked by quality">
        {clips.map((clip, index) => (
          <li key={clip.id}>
            <button
              type="button"
              className="clip-row"
              aria-pressed={index === selectedIndex}
              onClick={() => {
                if (index === selectedIndex) return
                selectClip(index)
                setEditing(false)
                setPreview(null)
              }}
            >
              <span className="rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="clip-label"><strong>{clip.title}</strong><span>{range(clip)} · {clip.source_end_seconds - clip.source_start_seconds}s</span></span>
              <span className="score" aria-label={`Quality score ${clip.quality_score} out of 100`}>{clip.quality_score}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
