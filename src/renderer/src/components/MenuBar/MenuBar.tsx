import { useEffect, useRef, useState } from 'react'
import type { TableMode } from '../../../../core/table/TableMode.ts'

type MenuId = 'file' | 'edit' | 'table' | 'encoding' | 'tools' | 'view' | 'help'

interface MenuBarProps {
  canSave: boolean
  canUndo: boolean
  canRedo: boolean
  canClearSelected: boolean
  hasEntries: boolean
  inspectorVisible: boolean
  statusBarVisible: boolean
  mode: TableMode
  onNew: () => void
  onOpen: () => void
  onOpenRom: () => void
  onSave: () => void
  onSaveAs: () => void
  onExit: () => void
  onUndo: () => void
  onRedo: () => void
  onClearSelected: () => void
  onClearTable: () => void
  onValidateTable: () => void
  onShowStatistics: () => void
  onSearch: () => void
  onOpenRomSearch: () => void
  onOpenCharacterCatalog: () => void
  onToggleInspector: () => void
  onToggleStatusBar: () => void
  onShowShortcuts: () => void
  onShowAbout: () => void
}

interface MenuDefinition {
  id: MenuId
  label: string
  items: MenuItemDefinition[]
}

interface MenuItemDefinition {
  label: string
  onSelect?: () => void
  shortcut?: string
  disabled?: boolean
  checked?: boolean
  separatorBefore?: boolean
}

export function MenuBar({
  canSave,
  canUndo,
  canRedo,
  canClearSelected,
  hasEntries,
  inspectorVisible,
  statusBarVisible,
  mode,
  onNew,
  onOpen,
  onOpenRom,
  onSave,
  onSaveAs,
  onExit,
  onUndo,
  onRedo,
  onClearSelected,
  onClearTable,
  onValidateTable,
  onShowStatistics,
  onSearch,
  onOpenRomSearch,
  onOpenCharacterCatalog,
  onToggleInspector,
  onToggleStatusBar,
  onShowShortcuts,
  onShowAbout
}: MenuBarProps): React.JSX.Element {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return

    const closeOutside = (event: PointerEvent): void => {
      if (!menuBarRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  const menus: MenuDefinition[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'New', shortcut: 'Ctrl+N', onSelect: onNew },
        { label: 'Open…', shortcut: 'Ctrl+O', onSelect: onOpen },
        { label: 'Save', shortcut: 'Ctrl+S', disabled: !canSave, onSelect: onSave },
        {
          label: 'Save As…',
          shortcut: 'Ctrl+Shift+S',
          disabled: !canSave,
          onSelect: onSaveAs
        },
        { label: 'Open ROM / Binary...', separatorBefore: true, onSelect: onOpenRom },
        { label: 'Exit', separatorBefore: true, onSelect: onExit }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !canUndo, onSelect: onUndo },
        { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !canRedo, onSelect: onRedo },
        {
          label: 'Clear Selected Cell',
          shortcut: 'Delete',
          disabled: !canClearSelected,
          separatorBefore: true,
          onSelect: onClearSelected
        },
        { label: 'Clear Table…', disabled: !hasEntries, onSelect: onClearTable }
      ]
    },
    {
      id: 'table',
      label: 'Table',
      items: [
        { label: 'Validate Table', onSelect: onValidateTable },
        { label: 'Table Statistics', onSelect: onShowStatistics },
        {
          label: `${mode} Mode (${mode === '8-bit' ? '00-FF' : '0000-FFFF'})`,
          checked: true,
          disabled: true,
          separatorBefore: true
        }
      ]
    },
    {
      id: 'encoding',
      label: 'Encoding',
      items: [
        { label: `Custom ${mode}`, checked: true, disabled: true },
        { label: 'UTF-8 .tbl Files', checked: true, disabled: true },
        { label: 'ANSI / OEM', disabled: true, separatorBefore: true },
        { label: 'Shift-JIS', disabled: true }
      ]
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        { label: 'Search Table', shortcut: 'Ctrl+F', onSelect: onSearch },
        { label: 'Character Catalog…', onSelect: onOpenCharacterCatalog },
        {
          label: 'ROM Tools: Text Search...',
          separatorBefore: true,
          onSelect: onOpenRomSearch
        }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: 'Character Inspector', checked: inspectorVisible, onSelect: onToggleInspector },
        { label: 'Status Bar', checked: statusBarVisible, onSelect: onToggleStatusBar }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', shortcut: 'F1', onSelect: onShowShortcuts },
        { label: 'About TableBoy Studio', separatorBefore: true, onSelect: onShowAbout }
      ]
    }
  ]

  const runAction = (item: MenuItemDefinition): void => {
    if (item.disabled || !item.onSelect) return
    setOpenMenu(null)
    item.onSelect()
  }

  return (
    <nav className="menu-bar" aria-label="Application menu">
      <span className="menu-bar__brand">TableBoy Studio</span>
      <div className="menu-bar__items" ref={menuBarRef}>
        {menus.map((menu) => (
          <div className="menu-bar__menu" key={menu.id}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === menu.id}
              onClick={() => setOpenMenu((current) => (current === menu.id ? null : menu.id))}
              onPointerEnter={() => {
                if (openMenu) setOpenMenu(menu.id)
              }}
            >
              {menu.label}
            </button>
            {openMenu === menu.id ? (
              <div className="app-menu" role="menu" aria-label={menu.label}>
                {menu.items.map((item) => (
                  <MenuItem key={item.label} {...item} onSelect={() => runAction(item)} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </nav>
  )
}

function MenuItem({
  label,
  shortcut,
  disabled = false,
  checked,
  separatorBefore = false,
  onSelect
}: MenuItemDefinition): React.JSX.Element {
  return (
    <>
      {separatorBefore ? <span className="app-menu__separator" role="separator" /> : null}
      <button
        type="button"
        role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
      >
        <span className="app-menu__label">
          <span className="app-menu__check" aria-hidden="true">
            {checked ? '✓' : ''}
          </span>
          {label}
        </span>
        {shortcut ? <kbd>{shortcut}</kbd> : null}
      </button>
    </>
  )
}
