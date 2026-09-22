import type { ChangeEvent } from 'react'
import type { TableMode } from '../../../../core/table/TableMode.ts'

interface ToolbarProps {
  canUndo: boolean
  canRedo: boolean
  query: string
  validationValid: boolean
  mode: TableMode
  canChangeMode: boolean
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSearch: () => void
  onUndo: () => void
  onRedo: () => void
  onQueryChange: (query: string) => void
  onModeChange: (mode: TableMode) => void
}

type IconName = 'new' | 'open' | 'save' | 'search' | 'undo' | 'redo'

const ICON_PATHS: Record<IconName, string> = {
  new: 'M6 2.5h7l3 3V17.5H6zM13 2.5v3h3M9 10h4M11 8v4',
  open: 'M2.5 6.5h5l1.5-2h3l1.5 2h3l-2 8h-10z',
  save: 'M4 3h10l2 2v11H4zM7 3v4h6V3M7 16v-5h6v5',
  search: 'm14.5 14.5-3.2-3.2m1.2-4.1a5.3 5.3 0 1 1-10.6 0 5.3 5.3 0 0 1 10.6 0Z',
  undo: 'M6.5 5 3 8.5 6.5 12M3.5 8.5h7a4 4 0 0 1 4 4v1',
  redo: 'M11.5 5 15 8.5 11.5 12M14.5 8.5h-7a4 4 0 0 0-4 4v1'
}

export function Toolbar({
  canUndo,
  canRedo,
  query,
  validationValid,
  mode,
  canChangeMode,
  onNew,
  onOpen,
  onSave,
  onSearch,
  onUndo,
  onRedo,
  onQueryChange,
  onModeChange
}: ToolbarProps): React.JSX.Element {
  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onQueryChange(event.target.value)
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Table actions">
      <div className="toolbar__actions">
        <ToolButton icon="new" label="New" shortcut="Ctrl+N" onClick={onNew} />
        <ToolButton icon="open" label="Open" shortcut="Ctrl+O" onClick={onOpen} />
        <ToolButton
          icon="save"
          label="Save"
          shortcut="Ctrl+S"
          disabled={!validationValid}
          onClick={onSave}
        />
        <span className="toolbar__separator" aria-hidden="true" />
        <ToolButton
          icon="undo"
          label="Undo"
          shortcut="Ctrl+Z"
          disabled={!canUndo}
          onClick={onUndo}
        />
        <ToolButton
          icon="redo"
          label="Redo"
          shortcut="Ctrl+Y"
          disabled={!canRedo}
          onClick={onRedo}
        />
      </div>

      <form
        className="toolbar__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch()
        }}
      >
        <input
          type="search"
          value={query}
          placeholder="Hex or value…"
          aria-label="Search table"
          onChange={handleQueryChange}
        />
        <ToolButton icon="search" label="Search" compact onClick={onSearch} />
      </form>

      <label className="mode-select">
        <span>Table Mode</span>
        <select
          value={mode}
          aria-label="Table mode"
          disabled={!canChangeMode}
          onChange={(event) => onModeChange(event.target.value as TableMode)}
        >
          <option value="8-bit">8-bit</option>
          <option value="16-bit">16-bit</option>
        </select>
      </label>
    </div>
  )
}

interface ToolButtonProps {
  icon: IconName
  label: string
  shortcut?: string
  compact?: boolean
  disabled?: boolean
  onClick: () => void
}

function ToolButton({
  icon,
  label,
  shortcut,
  compact = false,
  disabled = false,
  onClick
}: ToolButtonProps): React.JSX.Element {
  return (
    <button
      className={`tool-button${compact ? ' tool-button--compact' : ''}`}
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
    >
      <ToolIcon name={icon} />
      <span>{label}</span>
    </button>
  )
}

function ToolIcon({ name }: { name: IconName }): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}
