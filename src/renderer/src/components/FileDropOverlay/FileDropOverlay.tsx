interface FileDropOverlayProps {
  visible: boolean
}

export function FileDropOverlay({ visible }: FileDropOverlayProps): React.JSX.Element | null {
  if (!visible) return null

  return (
    <div className="file-drop-overlay" role="status" aria-live="polite">
      <div className="file-drop-overlay__content">
        <strong>Drop the .tbl file to open it</strong>
        <span>The current document will be protected before opening.</span>
      </div>
    </div>
  )
}
