import type { SearchProgress } from '../core/search/index.ts'
import type {
  SearchRequest,
  SearchResultBatch,
  SerializedSearchError
} from '../main/search/SearchProtocol.ts'

export type { SearchRequest, SerializedSearchError } from '../main/search/SearchProtocol.ts'

export const SEARCH_CHANNELS = {
  start: 'search:start',
  cancel: 'search:cancel',
  progress: 'search:progress',
  results: 'search:results',
  complete: 'search:complete',
  cancelled: 'search:cancelled',
  error: 'search:error'
} as const

export interface SearchStartRequest {
  readonly documentId: string
  readonly request: SearchRequest
}

export type SearchStartResponse =
  | { readonly ok: true; readonly jobId: string }
  | { readonly ok: false; readonly error: SerializedSearchError }

export type SearchCancelResponse =
  | { readonly ok: true; readonly cancelled: boolean }
  | { readonly ok: false; readonly error: SerializedSearchError }

export interface SearchProgressEvent {
  readonly jobId: string
  readonly progress: SearchProgress
}

export type SearchResultsEvent = { readonly jobId: string } & SearchResultBatch

export interface SearchCompleteEvent {
  readonly jobId: string
  readonly resultCount: number
}

export interface SearchCancelledEvent {
  readonly jobId: string
  readonly resultCount: number
}

export interface SearchErrorEvent {
  readonly jobId: string
  readonly error: SerializedSearchError
}

export interface SearchApi {
  start(documentId: string, request: SearchRequest): Promise<SearchStartResponse>
  cancel(jobId: string): Promise<SearchCancelResponse>
  onProgress(listener: (event: SearchProgressEvent) => void): () => void
  onResults(listener: (event: SearchResultsEvent) => void): () => void
  onComplete(listener: (event: SearchCompleteEvent) => void): () => void
  onCancelled(listener: (event: SearchCancelledEvent) => void): () => void
  onError(listener: (event: SearchErrorEvent) => void): () => void
}
