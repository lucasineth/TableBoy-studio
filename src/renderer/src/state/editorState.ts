import {
  createTableEntryMap,
  setTableValue,
  type TableDocument,
  type TableEntry
} from '../../../core/table/index.ts'
import type { TableMode } from '../../../core/table/TableMode.ts'

interface HistorySnapshot {
  entries: TableEntry[]
  mode: TableMode
  revision: number
}

export interface EditorState {
  entries: TableEntry[]
  mode: TableMode
  filePath: string | null
  fileName: string
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  revision: number
  nextRevision: number
  savedRevision: number
}

export type EditorAction =
  | { type: 'SET_VALUE'; address: number; value: string }
  | { type: 'APPLY_ENTRIES'; entries: TableEntry[] }
  | { type: 'LOAD'; document: TableDocument; filePath: string; fileName: string }
  | { type: 'NEW' }
  | { type: 'SET_MODE'; mode: TableMode }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED'; filePath: string; fileName: string }

const MAX_HISTORY_LENGTH = 100

export function createEditorState(
  document: TableDocument = { mode: '8-bit', entries: [] },
  fileName = 'Untitled.tbl',
  filePath: string | null = null
): EditorState {
  return {
    entries: document.entries,
    mode: document.mode,
    filePath,
    fileName,
    past: [],
    future: [],
    revision: 0,
    nextRevision: 1,
    savedRevision: 0
  }
}

export function isEditorModified(state: EditorState): boolean {
  return state.revision !== state.savedRevision
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_VALUE': {
      const currentValue =
        createTableEntryMap(state.entries, state.mode).get(action.address)?.value ?? ''
      if (currentValue === action.value) return state
      return commitEntries(
        state,
        setTableValue(state.entries, action.address, action.value, state.mode)
      )
    }
    case 'APPLY_ENTRIES':
      return commitEntries(state, action.entries)
    case 'LOAD':
      return createEditorState(action.document, action.fileName, action.filePath)
    case 'NEW':
      return createEditorState()
    case 'SET_MODE':
      return state.entries.length === 0 ? { ...state, mode: action.mode } : state
    case 'UNDO': {
      const snapshot = state.past.at(-1)
      if (!snapshot) return state
      return {
        ...state,
        entries: snapshot.entries,
        mode: snapshot.mode,
        revision: snapshot.revision,
        past: state.past.slice(0, -1),
        future: [
          ...state.future.slice(-(MAX_HISTORY_LENGTH - 1)),
          { entries: state.entries, mode: state.mode, revision: state.revision }
        ]
      }
    }
    case 'REDO': {
      const snapshot = state.future.at(-1)
      if (!snapshot) return state
      return {
        ...state,
        entries: snapshot.entries,
        mode: snapshot.mode,
        revision: snapshot.revision,
        past: [
          ...state.past.slice(-(MAX_HISTORY_LENGTH - 1)),
          { entries: state.entries, mode: state.mode, revision: state.revision }
        ],
        future: state.future.slice(0, -1)
      }
    }
    case 'MARK_SAVED':
      return {
        ...state,
        filePath: action.filePath,
        fileName: action.fileName,
        savedRevision: state.revision
      }
  }
}

function commitEntries(state: EditorState, entries: TableEntry[]): EditorState {
  const snapshot: HistorySnapshot = {
    entries: state.entries,
    mode: state.mode,
    revision: state.revision
  }
  return {
    ...state,
    entries,
    revision: state.nextRevision,
    nextRevision: state.nextRevision + 1,
    past: [...state.past.slice(-(MAX_HISTORY_LENGTH - 1)), snapshot],
    future: []
  }
}
