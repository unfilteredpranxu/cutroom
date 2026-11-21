import { useEffect, useRef, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function Install() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches)

  useEffect(() => {
    function available(event: Event) {
      event.preventDefault()
      setPrompt(event as InstallEvent)
    }
    function complete() {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', available)
    window.addEventListener('appinstalled', complete)
    return () => {
      window.removeEventListener('beforeinstallprompt', available)
      window.removeEventListener('appinstalled', complete)
    }
  }, [])

  async function open() {
    if (prompt) {
      try {
        if ((await prompt.prompt()).outcome === 'accepted') setInstalled(true)
      } catch {
        dialog.current?.showModal()
      } finally {
        setPrompt(null)
      }
    } else {
      dialog.current?.showModal()
    }
  }

  if (installed) return null

  return (
    <>
      <button type="button" className="text-button" onClick={open}>Install</button>
      <dialog className="install-dialog" ref={dialog} aria-labelledby="install-title">
        <h2 id="install-title">Install Cutroom</h2>
        <p>On iPad or iPhone, open this site in Safari. Open <strong>Share</strong>, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
        <p>On desktop, use the browser’s install option when available.</p>
        <form method="dialog"><button className="secondary" type="submit" autoFocus>Done</button></form>
      </dialog>
    </>
  )
}
