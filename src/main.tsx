import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { lengthOptions, type Analysis, type AnalysisRequest } from '../shared/contracts'
import { parseYouTubeUrl } from '../shared/youtube'
import { analyzeVideo, StudioError, unlockStudio } from './api'
import { Review } from './Review'
import './styles.css'

function EmptyTimeline() {
  return (
    <div className="empty-timeline" aria-hidden="true">
      <div className="timeline-ruler" />
      <div className="mock-track"><i /><i /><i /></div>
      <div className="mock-track"><i /><i /><i /></div>
      <div className="playhead" />
    </div>
  )
}

function Access({ onUnlock, notice }: { onUnlock: (token: string) => void; notice: string }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState(notice)
  const [checking, setChecking] = useState(false)

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking) return
    setChecking(true)
    setError('')
    try {
      await unlockStudio(token.trim())
      onUnlock(token.trim())
    } catch (failure) {
      setError(failure instanceof StudioError ? failure.message : 'Access could not be verified.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main id="main" tabIndex={-1} className="access-layout">
      <div className="access-intro">
        <p className="eyebrow"><span /> Highlight studio</p>
        <h1>Every great clip<br className="wide-only" /> starts with a cut.</h1>
        <p className="intro-copy">Find the moments worth keeping in a public YouTube video, then review each suggested cut at its source timestamp.</p>
        <EmptyTimeline />
      </div>
      <form className="panel access-panel" onSubmit={unlock}>
        <h2>Unlock the studio</h2>
        <p className="muted">Enter your owner access token.</p>
        <label htmlFor="token">Owner access token</label>
        <input id="token" type="password" autoComplete="current-password" spellCheck={false} required maxLength={128} value={token} onChange={(event) => setToken(event.target.value)} />
        <button type="submit" className="primary" disabled={checking}>{checking ? 'Checking access…' : 'Unlock studio'} <span aria-hidden="true">↗</span></button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  )
}

function Studio({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [url, setUrl] = useState('')
  const [count, setCount] = useState(5)
  const [length, setLength] = useState<AnalysisRequest['length']>('balanced')
  const [urlError, setUrlError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ analysis: Analysis; revision: number } | null>(null)
  const run = useRef<AbortController | null>(null)
  const urlInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => run.current?.abort(), [])

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (run.current) return
    setError('')
    if (!parseYouTubeUrl(url)) {
      setUrlError('Enter a valid HTTPS link to a single public YouTube video.')
      urlInput.current?.focus()
      return
    }
    setUrlError('')
    const controller = new AbortController()
    run.current = controller
    setLoading(true)
    try {
      const analysis = await analyzeVideo(token, { url, count, length }, controller.signal)
      setResult((current) => ({ analysis, revision: (current?.revision ?? 0) + 1 }))
    } catch (failure) {
      if (controller.signal.aborted) return
      if (failure instanceof StudioError && failure.status === 401) return onExpired()
      setError(failure instanceof StudioError ? failure.message : 'Analysis failed. Try again.')
    } finally {
      run.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return (
    <main id="main" tabIndex={-1}>
      <div className="page-heading">
        <p className="eyebrow"><span /> Highlight studio</p>
        <h1>Generate highlights</h1>
        <p className="intro-copy">Turn a public YouTube video into a shortlist of moments worth cutting.</p>
      </div>
      <div className="workspace">
        <aside className="source">
          <form className="panel source-panel" onSubmit={analyze} noValidate>
            <h2>Source video</h2>
            <label htmlFor="youtube">YouTube URL</label>
            <input type="url" id="youtube" ref={urlInput} placeholder="https://www.youtube.com/watch?v=…" maxLength={2048} value={url} aria-invalid={!!urlError} aria-describedby={urlError ? 'url-error' : undefined} onChange={(event) => { setUrl(event.target.value); setUrlError('') }} />
            {urlError && <p className="error" role="alert" id="url-error">{urlError}</p>}
            <div className="preferences">
              <div>
                <label htmlFor="clip-count">Clip count</label>
                <select id="clip-count" value={count} onChange={(event) => setCount(Number(event.target.value))}>
                  {[5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>Up to {value}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="clip-length">Clip length</label>
                <select id="clip-length" value={length} onChange={(event) => setLength(event.target.value as AnalysisRequest['length'])}>
                  {Object.entries(lengthOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className="primary" disabled={loading}>{loading ? 'Analyzing video…' : 'Analyze video'} <span aria-hidden="true">↗</span></button>
            {error && <p className="error" role="alert">{error}</p>}
          </form>
          <p className="export-note"><strong>Source file for export</strong>Future export requires an authorized source MP4.</p>
        </aside>
        <section className="panel results-panel" aria-labelledby="results-title" aria-busy={loading}>
          <div className="section-bar">
            <h2 id="results-title">Highlight review</h2>
            {result && <span className="muted">{result.analysis.clips.length} {result.analysis.clips.length === 1 ? 'selection' : 'selections'}</span>}
          </div>
          {result ? <Review key={result.revision} analysis={result.analysis} /> : (
            <div className="empty-panel">
              <EmptyTimeline />
              <h3>{loading ? 'Reviewing the source' : 'Your picks will appear here'}</h3>
              <p>{loading ? 'Gemini is looking for distinct moments and their timestamps. Longer videos can take a minute.' : 'Add a public YouTube link to find clips, compare their scores, and preview the original moments.'}</p>
            </div>
          )}
        </section>
      </div>
      <p className="sr-only" role="status">{loading ? 'Analysis in progress.' : result ? `Analysis complete. ${result.analysis.clips.length} selections.` : ''}</p>
    </main>
  )
}

function App() {
  const [token, setToken] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const transitioned = useRef(false)
  useEffect(() => {
    if (transitioned.current) document.getElementById('main')?.focus()
  }, [token])

  function setAccess(next: string | null) {
    transitioned.current = true
    setToken(next)
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <div className="wordmark"><img src="/mark.svg" width="36" height="36" alt="" /> CUTROOM<span>.</span></div>
        {token && <button className="text-button" type="button" onClick={() => { setNotice(''); setAccess(null) }}>Lock studio</button>}
      </header>
      {token ? (
        <Studio token={token} onExpired={() => { setNotice('Your access token changed. Unlock the studio again.'); setAccess(null) }} />
      ) : <Access onUnlock={setAccess} notice={notice} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
