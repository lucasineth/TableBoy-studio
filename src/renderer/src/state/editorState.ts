import {
  createEightBitEntryMap,
  setEightBitValue,
  type TableEntry
} from '../../../core/table/index.ts'

interface HistorySnapshot {
  entries: TableEntry[]
  revision: number
}

export interface EditorState {
  entries: TableEntry[]
  filePath: string | null
  fileName: string
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  revision: number
  nextRevision: number
  savedRevision: number
}

export type EditorAction =
  | { type: 'SET_VALUE'; byte: number; value: string }
  | { type: 'APPLY_ENTRIES'; entries: TableEntry[] }
  | { type: 'LOAD'; entries: TableEntry[]; filePath: string; fileName: string }
  | { type: 'NEW' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED'; filePath: string; fileName: string }

const MAX_HISTORY_LENGTH = 100

export function createEditorState(
  entries: TableEntry[] = [],
  fileName = 'Untitled.tbl',
  filePath: string | null = null
): EditorState {
  return {
    entries,
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
      const currentValue = createEightBitEntryMap(state.entries).get(action.byte)?.value ?? ''
      if (currentValue === action.value) return state
      return commitEntries(state, setEightBitValue(state.entries, action.byte, action.value))
    }
    case 'APPLY_ENTRIES':
      return commitEntries(state, action.entries)
    case 'LOAD':
      return createEditorState(action.entries, action.fileName, action.filePath)
    case 'NEW':
      return createEditorState()
    case 'UNDO': {
      const snapshot = state.past.at(-1)
      if (!snapshot) return state
      return {
        ...state,
        entries: snapshot.entries,
        revision: snapshot.revision,
        past: state.past.slice(0, -1),
        future: [
          ...state.future.slice(-(MAX_HISTORY_LENGTH - 1)),
          { entries: state.entries, revision: state.revision }
        ]
      }
    }
    case 'REDO': {
      const snapshot = state.future.at(-1)
      if (!snapshot) return state
      return {
        ...state,
        entries: snapshot.entries,
        revision: snapshot.revision,
        past: [
          ...state.past.slice(-(MAX_HISTORY_LENGTH - 1)),
          { entries: state.entries, revision: state.revision }
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
  const snapshot: HistorySnapshot = { entries: state.entries, revision: state.revision }
  return {
    ...state,
    entries,
    revision: state.nextRevision,
    nextRevision: state.nextRevision + 1,
    past: [...state.past.slice(-(MAX_HISTORY_LENGTH - 1)), snapshot],
    future: []
  }
}
