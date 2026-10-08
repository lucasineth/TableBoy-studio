import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent
} from 'react'

import {
  addressCountForMode,
  addressFromKey,
  createTableEntryMap,
  formatTableAddress,
  pageFromAddress,
  pagesInDocument,
  type TableMode
} from '../../core/table/index.ts'
import { characterCatalog } from '../../core/characters/CharacterCatalog.ts'
import type { CharacterOption } from '../../core/characters/CharacterCategory.ts'
import type { OpenedTableFile } from '../../shared/tableFileApi.ts'
import { AppDialog, type AppDialogKind } from './components/AppDialog/AppDialog.tsx'
import { CharacterInspector } from './components/CharacterInspector/CharacterInspector.tsx'
import { HexContextMenu } from './components/ContextMenu/HexContextMenu.tsx'
import { FileDropOverlay } from './components/FileDropOverlay/FileDropOverlay.tsx'
import { MenuBar } from './components/MenuBar/MenuBar.tsx'
import { StatusBar } from './components/StatusBar/StatusBar.tsx'
import { TableEditor } from './components/TableEditor/TableEditor.tsx'
import { Toolbar } from './components/Toolbar/Toolbar.tsx'
import { RomSearchPanel } from './features/rom-search/RomSearchPanel.tsx'
import { useRomSearch } from './features/rom-search/useRomSearch.ts'
import {
  createSampleDocument,
  formatTableDocumentErrors,
  parseTableDocument,
  serializeTableDocument,
  validateTableDocument
} from './services/tableDocument.ts'
import { createEditorState, editorReducer, isEditorModified } from './state/editorState.ts'

interface ContextMenuState {
  address: number
  x: number
  y: number
}

interface NoticeState {
  message: string
  persistent: boolean
}

type ActiveWorkspace = 'table-editor' | 'rom-search'

const NOTICE_DURATION_MS = 3000

export default function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState(createSampleDocument(), 'example.tbl')
  )
  const [selectedAddress, setSelectedAddress] = useState(0xf1)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [fileDragActive, setFileDragActive] = useState(false)
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const [statusBarVisible, setStatusBarVisible] = useState(true)
  const [dialog, setDialog] = useState<AppDialogKind | null>(null)
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>('table-editor')
  const dragDepthRef = useRef(0)
  const romSearch = useRomSearch()
  const openRomDocument = romSearch.openDocument

  const entryMap = useMemo(
    () => createTableEntryMap(state.entries, state.mode),
    [state.entries, state.mode]
  )
  const values = useMemo(
    () => new Map(Array.from(entryMap, ([address, entry]) => [address, entry.value])),
    [entryMap]
  )
  const validation = useMemo(() => validateTableDocument(state.entries), [state.entries])
  const selectedValue = values.get(selectedAddress) ?? ''
  const availablePages = useMemo(
    () => pagesInDocument({ mode: state.mode, entries: state.entries }),
    [state.entries, state.mode]
  )
  const modified = isEditorModified(state)

  const handleValueChange = useCallback((address: number, value: string): void => {
    dispatch({ type: 'SET_VALUE', address, value })
    setNotice((current) => (current?.persistent ? current : null))
  }, [])

  const saveDocument = useCallback(
    async (forceSaveAs = false): Promise<boolean> => {
      const tableFiles = window.tableFiles
      if (!tableFiles) {
        setNotice({ message: 'The Electron file API is unavailable.', persistent: true })
        return false
      }

      if (!validation.valid) {
        setNotice({ message: 'Resolve table validation errors before saving.', persistent: true })
        return false
      }

      try {
        const contents = serializeTableDocument({ mode: state.mode, entries: state.entries })
        const result =
          forceSaveAs || state.filePath === null
            ? await tableFiles.saveAs({ suggestedName: state.fileName, contents })
            : await tableFiles.save({ filePath: state.filePath, contents })

        if (result.canceled) return false

        dispatch({
          type: 'MARK_SAVED',
          filePath: result.filePath,
          fileName: result.fileName
        })
        setNotice({ message: `Saved ${result.fileName}.`, persistent: false })
        return true
      } catch (error) {
        setNotice({
          message: error instanceof Error ? error.message : 'Could not save the table.',
          persistent: true
        })
        return false
      }
    },
    [state.entries, state.fileName, state.filePath, state.mode, validation.valid]
  )

  const confirmDocumentReplacement = useCallback(async (): Promise<boolean> => {
    if (!modified) return true

    const tableFiles = window.tableFiles
    if (!tableFiles) {
      setNotice({ message: 'The Electron file API is unavailable.', persistent: true })
      return false
    }

    const decision = await tableFiles.confirmUnsavedChanges(state.fileName)
    if (decision === 'cancel') return false
    if (decision === 'discard') return true
    return saveDocument()
  }, [modified, saveDocument, state.fileName])

  const handleNew = useCallback(async (): Promise<void> => {
    if (!(await confirmDocumentReplacement())) return

    dispatch({ type: 'NEW' })
    setSelectedAddress(0)
    setPage(0)
    setNotice({ message: 'Created a new empty 8-bit table.', persistent: false })
  }, [confirmDocumentReplacement])

  const loadOpenedTable = useCallback((opened: OpenedTableFile): boolean => {
    const result = parseTableDocument(opened.contents)
    if (result.errors.length > 0 || !result.document) {
      setNotice({
        message: `Could not open ${opened.fileName}:\n${formatTableDocumentErrors(result.errors)}`,
        persistent: true
      })
      return false
    }

    dispatch({
      type: 'LOAD',
      document: result.document,
      filePath: opened.filePath,
      fileName: opened.fileName
    })
    const firstAddress = result.document.entries[0]
      ? addressFromKey(result.document.entries[0].key, result.document.mode)
      : 0
    setSelectedAddress(firstAddress)
    setPage(pageFromAddress(firstAddress, result.document.mode))
    setNotice({ message: `Opened ${opened.fileName}.`, persistent: false })
    return true
  }, [])

  const handleOpen = useCallback(async (): Promise<void> => {
    if (!(await confirmDocumentReplacement())) return

    const tableFiles = window.tableFiles
    if (!tableFiles) {
      setNotice({ message: 'The Electron file API is unavailable.', persistent: true })
      return
    }

    try {
      const opened = await tableFiles.open()
      if (opened.canceled) return
      loadOpenedTable(opened)
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : 'Could not open the table.',
        persistent: true
      })
    }
  }, [confirmDocumentReplacement, loadOpenedTable])

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    dragDepthRef.current += 1
    setFileDragActive(true)
  }, [])

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setFileDragActive(false)
  }, [])

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>): Promise<void> => {
      event.preventDefault()
      dragDepthRef.current = 0
      setFileDragActive(false)

      const files = Array.from(event.dataTransfer.files)
      if (files.length !== 1 || !files[0].name.toLocaleLowerCase().endsWith('.tbl')) {
        setNotice({ message: 'Drop exactly one .tbl file to open it.', persistent: false })
        return
      }

      if (!(await confirmDocumentReplacement())) return

      const tableFiles = window.tableFiles
      if (!tableFiles) {
        setNotice({ message: 'The Electron file API is unavailable.', persistent: true })
        return
      }

      try {
        const opened = await tableFiles.openDroppedFile(files[0])
        if (!opened.canceled) loadOpenedTable(opened)
      } catch (error) {
        setNotice({
          message: error instanceof Error ? error.message : 'Could not open the dropped table.',
          persistent: true
        })
      }
    },
    [confirmDocumentReplacement, loadOpenedTable]
  )

  const handleSave = useCallback(async (): Promise<void> => {
    await saveDocument()
  }, [saveDocument])

  const handleSaveAs = useCallback(async (): Promise<void> => {
    await saveDocument(true)
  }, [saveDocument])

  const handleSearch = useCallback((): void => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      setNotice({
        message: 'Enter a hexadecimal byte or mapped value to search.',
        persistent: false
      })
      return
    }

    const hexadecimalPattern =
      state.mode === '8-bit' ? /^(?:0x)?([0-9a-f]{2})$/i : /^(?:0x)?([0-9a-f]{4})$/i
    const hexadecimalMatch = hexadecimalPattern.exec(normalizedQuery)
    const match = hexadecimalMatch
      ? Number.parseInt(hexadecimalMatch[1], 16)
      : Array.from(values).find(([, value]) =>
          value.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())
        )?.[0]

    if (match === undefined) {
      setNotice({ message: `No entry found for “${normalizedQuery}”.`, persistent: false })
      return
    }

    setSelectedAddress(match)
    setPage(pageFromAddress(match, state.mode))
    const formattedAddress = formatTableAddress(match, state.mode)
    setNotice({ message: `Selected address ${formattedAddress}.`, persistent: false })
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`[data-address="${formattedAddress}"]`)?.focus()
    })
  }, [query, state.mode, values])

  const handleUndo = useCallback((): void => {
    dispatch({ type: 'UNDO' })
  }, [])

  const handleRedo = useCallback((): void => {
    dispatch({ type: 'REDO' })
  }, [])

  const handleClearSelected = useCallback((): void => {
    handleValueChange(selectedAddress, '')
  }, [handleValueChange, selectedAddress])

  const handleClearTable = useCallback((): void => {
    if (state.entries.length === 0) return

    const confirmed = window.confirm(
      `Clear all ${state.entries.length} mapped entries from this table?`
    )
    if (confirmed) dispatch({ type: 'APPLY_ENTRIES', entries: [] })
  }, [state.entries.length])

  const handleValidateTable = useCallback((): void => {
    if (validation.valid) {
      setNotice({
        message: `Table is valid. ${entryMap.size} mapped entries and ${addressCountForMode(state.mode) - entryMap.size} free cells.`,
        persistent: false
      })
      return
    }

    setNotice({
      message: validation.issues.map((issue) => issue.message).join('\n'),
      persistent: true
    })
  }, [entryMap.size, state.mode, validation])

  const handleShowStatistics = useCallback((): void => {
    setNotice({
      message: `${state.mode} table · ${entryMap.size} used · ${addressCountForMode(state.mode) - entryMap.size} free · ${Math.round(
        (entryMap.size / addressCountForMode(state.mode)) * 100
      )}% occupied`,
      persistent: false
    })
  }, [entryMap.size, state.mode])

  const handleFocusSearch = useCallback((): void => {
    const selector =
      activeWorkspace === 'rom-search' ? '#rom-search-query' : '.toolbar__search input'
    const searchInput = document.querySelector<HTMLInputElement>(selector)
    searchInput?.focus()
    searchInput?.select()
  }, [activeWorkspace])

  const handleOpenRom = useCallback(async (): Promise<void> => {
    setActiveWorkspace('rom-search')
    await openRomDocument()
  }, [openRomDocument])

  const handleOpenCharacterCatalog = useCallback((): void => {
    setContextMenu({
      address: selectedAddress,
      x: Math.round(window.innerWidth / 2),
      y: 88
    })
  }, [selectedAddress])

  const handleModeChange = useCallback((mode: TableMode): void => {
    dispatch({ type: 'SET_MODE', mode })
    setSelectedAddress(0)
    setPage(0)
  }, [])

  const handlePageChange = useCallback((nextPage: number): void => {
    setPage(nextPage)
    setSelectedAddress((currentAddress) => (nextPage << 8) | (currentAddress & 0xff))
  }, [])

  const closeDialog = useCallback((): void => setDialog(null), [])

  const handleCellContextMenu = useCallback((address: number, x: number, y: number): void => {
    setContextMenu({ address, x, y })
  }, [])

  const handleInspectorValueChange = useCallback(
    (value: string): void => handleValueChange(selectedAddress, value),
    [handleValueChange, selectedAddress]
  )

  const closeContextMenu = useCallback((): void => setContextMenu(null), [])

  useEffect(() => {
    const displayName = `${state.fileName}${modified ? ' *' : ''}`
    document.title = `${displayName} - TableBoy Studio`
    window.tableFiles?.setDocumentState({ fileName: state.fileName, modified })
  }, [modified, state.fileName])

  useEffect(() => {
    if (!notice || notice.persistent) return

    const timeout = window.setTimeout(() => setNotice(null), NOTICE_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    const tableFiles = window.tableFiles
    if (!tableFiles) return

    return tableFiles.onSaveBeforeClose(() => {
      void saveDocument().then((saved) => tableFiles.completeCloseSave(saved))
    })
  }, [saveDocument])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (event.key === 'F1') {
        event.preventDefault()
        setDialog('shortcuts')
        return
      }

      const target = event.target
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (event.key === 'Delete' && !editingText && selectedValue.length > 0) {
        event.preventDefault()
        handleClearSelected()
        return
      }

      if (!(event.ctrlKey || event.metaKey)) return

      switch (event.key.toLocaleLowerCase()) {
        case 'z':
          event.preventDefault()
          if (event.shiftKey) {
            if (state.future.length > 0) handleRedo()
          } else if (state.past.length > 0) {
            handleUndo()
          }
          break
        case 'y':
          if (state.future.length === 0) return
          event.preventDefault()
          handleRedo()
          break
        case 'n':
          event.preventDefault()
          void handleNew()
          break
        case 'o':
          event.preventDefault()
          void handleOpen()
          break
        case 's':
          event.preventDefault()
          if (validation.valid) {
            if (event.shiftKey) void handleSaveAs()
            else void handleSave()
          }
          break
        case 'f':
          event.preventDefault()
          handleFocusSearch()
          break
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [
    handleNew,
    handleOpen,
    handleClearSelected,
    handleFocusSearch,
    handleRedo,
    handleSave,
    handleSaveAs,
    handleUndo,
    state.future.length,
    state.past.length,
    selectedValue.length,
    validation.valid
  ])

  const handleCharacterSelect = useCallback(
    (option: CharacterOption): void => {
      if (!contextMenu) return
      dispatch({ type: 'SET_VALUE', address: contextMenu.address, value: option.value })
      setContextMenu(null)
    },
    [contextMenu]
  )

  const showStatusBar = statusBarVisible && activeWorkspace === 'table-editor'

  return (
    <div
      className={`app-shell${showStatusBar ? '' : ' app-shell--without-status'}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
    >
      <FileDropOverlay visible={fileDragActive} />
      <MenuBar
        canSave={validation.valid}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canClearSelected={selectedValue.length > 0}
        hasEntries={entryMap.size > 0}
        inspectorVisible={inspectorVisible}
        statusBarVisible={statusBarVisible}
        mode={state.mode}
        onNew={handleNew}
        onOpen={handleOpen}
        onOpenRom={handleOpenRom}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExit={() => window.close()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearSelected={handleClearSelected}
        onClearTable={handleClearTable}
        onValidateTable={handleValidateTable}
        onShowStatistics={handleShowStatistics}
        onSearch={handleFocusSearch}
        onOpenRomSearch={() => setActiveWorkspace('rom-search')}
        onOpenCharacterCatalog={handleOpenCharacterCatalog}
        onToggleInspector={() => setInspectorVisible((visible) => !visible)}
        onToggleStatusBar={() => setStatusBarVisible((visible) => !visible)}
        onShowShortcuts={() => setDialog('shortcuts')}
        onShowAbout={() => setDialog('about')}
      />
      <Toolbar
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        query={query}
        validationValid={validation.valid}
        mode={state.mode}
        canChangeMode={state.entries.length === 0}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSearch={handleSearch}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onQueryChange={setQuery}
        onModeChange={handleModeChange}
      />

      {notice ? (
        <div className="notice" role="status">
          <span>{notice.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      ) : null}

      {activeWorkspace === 'table-editor' ? (
        <main
          className={`editor-workspace${inspectorVisible ? '' : ' editor-workspace--without-inspector'}`}
        >
          <TableEditor
            mode={state.mode}
            page={page}
            availablePages={availablePages}
            selectedAddress={selectedAddress}
            values={values}
            onPageChange={handlePageChange}
            onSelect={setSelectedAddress}
            onValueChange={handleValueChange}
            onContextMenu={handleCellContextMenu}
          />
          {inspectorVisible ? (
            <CharacterInspector
              address={selectedAddress}
              mode={state.mode}
              value={selectedValue}
              onValueChange={handleInspectorValueChange}
            />
          ) : null}
        </main>
      ) : (
        <RomSearchPanel
          state={romSearch.state}
          tableEntries={state.entries}
          onBack={() => setActiveWorkspace('table-editor')}
          onOpenDocument={() => void romSearch.openDocument()}
          onCloseDocument={() => void romSearch.closeDocument()}
          onSearch={(request) => void romSearch.startSearch(request)}
          onCancel={() => void romSearch.cancelActiveSearch()}
          onSelectResult={romSearch.selectResult}
        />
      )}

      {showStatusBar ? (
        <StatusBar
          selectedAddress={selectedAddress}
          mode={state.mode}
          usedEntries={entryMap.size}
          modified={modified}
          validationValid={validation.valid}
          fileName={state.fileName}
        />
      ) : null}

      {contextMenu ? (
        <HexContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedAddress={contextMenu.address}
          mode={state.mode}
          categories={characterCatalog}
          onClose={closeContextMenu}
          onEditValue={() => {
            const address = contextMenu.address
            setContextMenu(null)
            requestAnimationFrame(() => {
              const cell = document.querySelector<HTMLInputElement>(
                `[data-address="${formatTableAddress(address, state.mode)}"]`
              )
              cell?.focus()
              cell?.select()
            })
          }}
          onClear={() => {
            handleValueChange(contextMenu.address, '')
            setContextMenu(null)
          }}
          onSelectCharacter={handleCharacterSelect}
        />
      ) : null}

      {dialog ? <AppDialog kind={dialog} onClose={closeDialog} /> : null}
    </div>
  )
}
