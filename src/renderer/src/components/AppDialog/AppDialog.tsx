import { useEffect } from 'react'

export type AppDialogKind = 'shortcuts' | 'about'

interface AppDialogProps {
  kind: AppDialogKind
  onClose: () => void
}

const SHORTCUTS = [
  ['New table', 'Ctrl+N'],
  ['Open table', 'Ctrl+O'],
  ['Save', 'Ctrl+S'],
  ['Save as', 'Ctrl+Shift+S'],
  ['Undo', 'Ctrl+Z'],
  ['Redo', 'Ctrl+Y'],
  ['Search', 'Ctrl+F'],
  ['Clear selected cell', 'Delete'],
  ['Keyboard shortcuts', 'F1']
] as const

export function AppDialog({ kind, onClose }: AppDialogProps): React.JSX.Element {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const title = kind === 'shortcuts' ? 'Keyboard Shortcuts' : 'About TableBoy Studio'

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
      >
        <header className="app-dialog__header">
          <h2 id="app-dialog-title">{title}</h2>
          <button type="button" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </header>

        {kind === 'shortcuts' ? (
          <div className="shortcut-list">
            {SHORTCUTS.map(([label, shortcut]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{shortcut}</kbd>
              </div>
            ))}
          </div>
        ) : (
          <div className="about-content">
            <strong>TableBoy Studio</strong>
            <span>Version 1.0.0</span>
            <p>A modern 8-bit character table editor for ROM hacking.</p>
            <small>Electron · React · TypeScript · Vite</small>
            <div className="about-content__credits">
              <span>Developed by Lucas Ineth</span>
              <span>© 2026 Lucas Ineth</span>
              <small>Built for ROM hackers &amp; retro enthusiasts.</small>
            </div>
          </div>
        )}

        <footer className="app-dialog__footer">
          <button type="button" autoFocus onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  )
}
