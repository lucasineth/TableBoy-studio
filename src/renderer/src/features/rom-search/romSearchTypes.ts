import type {
  RelativeSearchResult,
  SearchProgress,
  TableSearchResult
} from '../../../../core/search/index.ts'
import type { StringScannerResult } from '../../../../core/search/StringScannerTypes.ts'
import type { BinaryDocumentMetadata } from '../../../../shared/binaryDocumentApi.ts'
import type { SerializedSearchError } from '../../../../shared/searchApi.ts'

export type RomSearchMode = 'table' | 'relative' | 'strings'
export type RomSearchStatus = 'idle' | 'searching' | 'completed' | 'cancelled' | 'error'

export type RomSearchResultItem =
  | { readonly kind: 'strings'; readonly result: StringScannerResult }
  | { readonly kind: 'table'; readonly result: TableSearchResult }
  | { readonly kind: 'relative'; readonly result: RelativeSearchResult }

export interface RomSearchState {
  readonly document: BinaryDocumentMetadata | null
  readonly status: RomSearchStatus
  readonly runId: number
  readonly jobId: string | null
  readonly progress: SearchProgress | null
  readonly results: readonly RomSearchResultItem[]
  readonly resultCount: number
  readonly selectedResultOffset: number | null
  readonly error: SerializedSearchError | null
}

export type RomSearchAction =
  | { readonly type: 'DOCUMENT_OPENED'; readonly document: BinaryDocumentMetadata }
  | { readonly type: 'DOCUMENT_CLOSED' }
  | { readonly type: 'SEARCH_STARTING' }
  | { readonly type: 'SEARCH_STARTED'; readonly jobId: string }
  | { readonly type: 'PROGRESS'; readonly jobId: string; readonly progress: SearchProgress }
  | {
      readonly type: 'RESULTS'
      readonly jobId: string
      readonly results: readonly RomSearchResultItem[]
    }
  | {
      readonly type: 'COMPLETE'
      readonly jobId: string
      readonly resultCount: number
    }
  | {
      readonly type: 'CANCELLED'
      readonly jobId: string
      readonly resultCount: number
    }
  | { readonly type: 'ERROR'; readonly jobId?: string; readonly error: SerializedSearchError }
  | { readonly type: 'SELECT_RESULT'; readonly offset: number }

export const initialRomSearchState: RomSearchState = {
  document: null,
  status: 'idle',
  runId: 0,
  jobId: null,
  progress: null,
  results: [],
  resultCount: 0,
  selectedResultOffset: null,
  error: null
}

export function romSearchReducer(state: RomSearchState, action: RomSearchAction): RomSearchState {
  switch (action.type) {
    case 'DOCUMENT_OPENED':
      return { ...initialRomSearchState, document: action.document, runId: state.runId + 1 }
    case 'DOCUMENT_CLOSED':
      return { ...initialRomSearchState, runId: state.runId + 1 }
    case 'SEARCH_STARTING':
      return {
        ...state,
        status: 'searching',
        runId: state.runId + 1,
        jobId: null,
        progress: null,
        results: [],
        resultCount: 0,
        selectedResultOffset: null,
        error: null
      }
    case 'SEARCH_STARTED':
      return state.status === 'searching' ? { ...state, jobId: action.jobId } : state
    case 'PROGRESS':
      return ownsJob(state, action.jobId) ? { ...state, progress: action.progress } : state
    case 'RESULTS':
      return ownsJob(state, action.jobId)
        ? { ...state, results: [...state.results, ...action.results] }
        : state
    case 'COMPLETE':
      return ownsJob(state, action.jobId)
        ? { ...state, status: 'completed', jobId: null, resultCount: action.resultCount }
        : state
    case 'CANCELLED':
      return ownsJob(state, action.jobId)
        ? { ...state, status: 'cancelled', jobId: null, resultCount: action.resultCount }
        : state
    case 'ERROR':
      return action.jobId === undefined || ownsJob(state, action.jobId)
        ? { ...state, status: 'error', jobId: null, error: action.error }
        : state
    case 'SELECT_RESULT':
      return {
        ...state,
        selectedResultOffset: action.offset
      }
  }
}

function ownsJob(state: RomSearchState, jobId: string): boolean {
  return state.jobId === jobId
}
