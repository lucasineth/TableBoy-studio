import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent
} from 'react'

import { createEightBitEntryMap, toByteHex } from '../../core/table/index.ts'
import { characterCatalog } from '../../core/characters/CharacterCatalog.ts'
import { applyCharacterSequence } from '../../core/characters/applyCharacterSequence.ts'
import type { CharacterCategory, CharacterOption } from '../../core/characters/CharacterCategory.ts'
import type { OpenedTableFile } from '../../shared/tableFileApi.ts'
import { AppDialog, type AppDialogKind } from './components/AppDialog/AppDialog.tsx'
import { CharacterInspector } from './components/CharacterInspector/CharacterInspector.tsx'
import { HexContextMenu } from './components/ContextMenu/HexContextMenu.tsx'
import { FileDropOverlay } from './components/FileDropOverlay/FileDropOverlay.tsx'
import { HexTable } from './components/HexTable/HexTable.tsx'
import { MenuBar } from './components/MenuBar/MenuBar.tsx'
import { StatusBar } from './components/StatusBar/StatusBar.tsx'
import { Toolbar } from './components/Toolbar/Toolbar.tsx'
import {
  createSampleTable,
  formatTableDocumentErrors,
  parseEightBitDocument,
  serializeTableDocument,
  validateTableDocument
} from './services/tableDocument.ts'
import { createEditorState, editorReducer, isEditorModified } from './state/editorState.ts'

interface ContextMenuState {
  byte: number
  x: number
  y: number
}

interface NoticeState {
  message: string
  persistent: boolean
}

const NOTICE_DURATION_MS = 3000

export default function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState(createSampleTable(), 'example.tbl')
  )
  const [selectedByte, setSelectedByte] = useState(0xf1)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [fileDragActive, setFileDragActive] = useState(false)
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const [statusBarVisible, setStatusBarVisible] = useState(true)
  const [dialog, setDialog] = useState<AppDialogKind | null>(null)
  const dragDepthRef = useRef(0)

  const entryMap = useMemo(() => createEightBitEntryMap(state.entries), [state.entries])
  const values = useMemo(
    () => new Map(Array.from(entryMap, ([byte, entry]) => [byte, entry.value])),
    [entryMap]
  )
  const validation = useMemo(() => validateTableDocument(state.entries), [state.entries])
  const selectedValue = values.get(selectedByte) ?? ''
  const modified = isEditorModified(state)

  const handleValueChange = useCallback((byte: number, value: string): void => {
    dispatch({ type: 'SET_VALUE', byte, value })
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
        const contents = serializeTableDocument(state.entries)
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
    [state.entries, state.fileName, state.filePath, validation.valid]
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
    setSelectedByte(0)
    setNotice({ message: 'Created a new empty 8-bit table.', persistent: false })
  }, [confirmDocumentReplacement])

  const loadOpenedTable = useCallback((opened: OpenedTableFile): boolean => {
    const result = parseEightBitDocument(opened.contents)
    if (result.errors.length > 0) {
      setNotice({
        message: `Could not open ${opened.fileName}:\n${formatTableDocumentErrors(result.errors)}`,
        persistent: true
      })
      return false
    }

    dispatch({
      type: 'LOAD',
      entries: result.entries,
      filePath: opened.filePath,
      fileName: opened.fileName
    })
    setSelectedByte(result.entries[0]?.key[0] ?? 0)
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

    const hexadecimalMatch = /^(?:0x)?([0-9a-f]{2})$/i.exec(normalizedQuery)
    const match = hexadecimalMatch
      ? Number.parseInt(hexadecimalMatch[1], 16)
      : Array.from(values).find(([, value]) =>
          value.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())
        )?.[0]

    if (match === undefined) {
      setNotice({ message: `No entry found for “${normalizedQuery}”.`, persistent: false })
      return
    }

    setSelectedByte(match)
    setNotice({ message: `Selected byte ${toByteHex(match)}.`, persistent: false })
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`[data-byte="${toByteHex(match)}"]`)?.focus()
    })
  }, [query, values])

  const handleUndo = useCallback((): void => {
    dispatch({ type: 'UNDO' })
  }, [])

  const handleRedo = useCallback((): void => {
    dispatch({ type: 'REDO' })
  }, [])

  const handleClearSelected = useCallback((): void => {
    handleValueChange(selectedByte, '')
  }, [handleValueChange, selectedByte])

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
        message: `Table is valid. ${entryMap.size} mapped entries and ${256 - entryMap.size} free cells.`,
        persistent: false
      })
      return
    }

    setNotice({
      message: validation.issues.map((issue) => issue.message).join('\n'),
      persistent: true
    })
  }, [entryMap.size, validation])

  const handleShowStatistics = useCallback((): void => {
    setNotice({
      message: `8-bit table · ${entryMap.size} used · ${256 - entryMap.size} free · ${Math.round(
        (entryMap.size / 256) * 100
      )}% occupied`,
      persistent: false
    })
  }, [entryMap.size])

  const handleFocusSearch = useCallback((): void => {
    const searchInput = document.querySelector<HTMLInputElement>('.toolbar__search input')
    searchInput?.focus()
    searchInput?.select()
  }, [])

  const handleOpenCharacterCatalog = useCallback((): void => {
    setContextMenu({
      byte: selectedByte,
      x: Math.round(window.innerWidth / 2),
      y: 88
    })
  }, [selectedByte])

  const closeDialog = useCallback((): void => setDialog(null), [])

  const handleCellContextMenu = useCallback((byte: number, x: number, y: number): void => {
    setContextMenu({ byte, x, y })
  }, [])

  const handleInspectorValueChange = useCallback(
    (value: string): void => handleValueChange(selectedByte, value),
    [handleValueChange, selectedByte]
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
      dispatch({ type: 'SET_VALUE', byte: contextMenu.byte, value: option.value })
      setContextMenu(null)
    },
    [contextMenu]
  )

  const handleCharacterSequence = useCallback(
    (category: CharacterCategory): void => {
      if (!contextMenu) return

      const result = applyCharacterSequence(state.entries, contextMenu.byte, category.characters)

      if (!result.ok) {
        setNotice({
          message: `${category.label} requires ${result.requiredCells} cells, but only ${result.availableCells} remain before FF.`,
          persistent: false
        })
        setContextMenu(null)
        return
      }

      if (result.overwrittenBytes.length > 0) {
        const ranges = formatByteRanges(result.overwrittenBytes)
        const confirmed = window.confirm(
          `As células ${ranges} já possuem valores.\nDeseja substituir as entradas existentes?`
        )
        if (!confirmed) {
          setContextMenu(null)
          return
        }
      }

      dispatch({ type: 'APPLY_ENTRIES', entries: result.entries })
      setContextMenu(null)
    },
    [contextMenu, state.entries]
  )

  return (
    <div
      className={`app-shell${statusBarVisible ? '' : ' app-shell--without-status'}`}
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
        onNew={handleNew}
        onOpen={handleOpen}
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
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSearch={handleSearch}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onQueryChange={setQuery}
      />

      {notice ? (
        <div className="notice" role="status">
          <span>{notice.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      ) : null}

      <main
        className={`editor-workspace${inspectorVisible ? '' : ' editor-workspace--without-inspector'}`}
      >
        <HexTable
          selectedByte={selectedByte}
          values={values}
          onSelect={setSelectedByte}
          onValueChange={handleValueChange}
          onContextMenu={handleCellContextMenu}
        />
        {inspectorVisible ? (
          <CharacterInspector
            byte={selectedByte}
            value={selectedValue}
            onValueChange={handleInspectorValueChange}
          />
        ) : null}
      </main>

      {statusBarVisible ? (
        <StatusBar
          selectedByte={selectedByte}
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
          selectedByte={contextMenu.byte}
          categories={characterCatalog}
          onClose={closeContextMenu}
          onApplySequence={handleCharacterSequence}
          onSelectCharacter={handleCharacterSelect}
        />
      ) : null}

      {dialog ? <AppDialog kind={dialog} onClose={closeDialog} /> : null}
    </div>
  )
}

function formatByteRanges(bytes: readonly number[]): string {
  if (bytes.length === 0) return ''

  const sortedBytes = [...new Set(bytes)].sort((left, right) => left - right)
  const ranges: string[] = []
  let start = sortedBytes[0]
  let end = start

  for (const byte of sortedBytes.slice(1)) {
    if (byte === end + 1) {
      end = byte
      continue
    }

    ranges.push(start === end ? toByteHex(start) : `${toByteHex(start)}-${toByteHex(end)}`)
    start = byte
    end = byte
  }

  ranges.push(start === end ? toByteHex(start) : `${toByteHex(start)}-${toByteHex(end)}`)
  return ranges.join(', ')
}
