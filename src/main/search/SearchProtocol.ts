import type { ByteOrder } from '../../core/bytes/index.ts'
import type {
  RelativeSearchResult,
  SearchProgress,
  SearchResult,
  StringScannerResult,
  StringScannerEncoding,
  TableSearchResult
} from '../../core/search/index.ts'
import type { TableEntry } from '../../core/table/index.ts'

export type SearchJobId = string
export type SearchDocumentId = string
export type SearchRequestId = string

export interface PortableSearchOptions {
  readonly startOffset?: number
  readonly endOffset?: number
  readonly maxResults?: number
  readonly alignment?: number
}

export interface PortableTableSearchOptions extends PortableSearchOptions {
  readonly contextBytes?: number
}

interface PortableRelativeSearchCommonOptions extends PortableSearchOptions {
  readonly allowTwoSymbolQuery?: boolean
  readonly wildcards?: boolean
  readonly characterSequence?: string
}

export type PortableRelativeSearchOptions = PortableRelativeSearchCommonOptions &
  (
    | { readonly valueWidth?: 1; readonly byteOrder?: never }
    | { readonly valueWidth: 2; readonly byteOrder: ByteOrder }
  )

export interface BinarySearchRequest {
  readonly type: 'binary'
  readonly pattern: Uint8Array
  readonly options?: PortableSearchOptions
}

export interface TableSearchRequest {
  readonly type: 'table'
  readonly query: string
  readonly entries: readonly TableEntry[]
  readonly options?: PortableTableSearchOptions
}

export interface RelativeTextSearchRequest {
  readonly type: 'relative'
  readonly inputMode?: 'text'
  readonly query: string
  readonly options?: PortableRelativeSearchOptions
}

export interface RelativeValueSearchRequest {
  readonly type: 'relative'
  readonly inputMode: 'values'
  readonly values: readonly number[]
  readonly options?: PortableRelativeSearchOptions
}

export type RelativeSearchRequest = RelativeTextSearchRequest | RelativeValueSearchRequest

export interface StringScanRequest {
  readonly type: 'strings'
  readonly options?: PortableSearchOptions & {
    readonly encoding?: StringScannerEncoding
    readonly minLength?: number
    readonly maxLength?: number
    readonly includeSpaces?: boolean
    readonly includeNumbers?: boolean
    readonly includePunctuation?: boolean
  }
}

export type SearchRequest =
  BinarySearchRequest | TableSearchRequest | RelativeSearchRequest | StringScanRequest

export interface SerializedSearchError {
  readonly name: string
  readonly code?: string
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

export type SearchResultBatch =
  | { readonly searchType: 'strings'; readonly results: readonly StringScannerResult[] }
  | { readonly searchType: 'binary'; readonly results: readonly SearchResult[] }
  | { readonly searchType: 'table'; readonly results: readonly TableSearchResult[] }
  | { readonly searchType: 'relative'; readonly results: readonly RelativeSearchResult[] }

export type SearchCoordinatorToWorkerMessage =
  | {
      readonly type: 'document:load'
      readonly requestId: SearchRequestId
      readonly documentId: SearchDocumentId
      readonly bytes: Uint8Array
    }
  | {
      readonly type: 'document:release'
      readonly requestId: SearchRequestId
      readonly documentId: SearchDocumentId
    }
  | {
      readonly type: 'search:start'
      readonly jobId: SearchJobId
      readonly documentId: SearchDocumentId
      readonly request: SearchRequest
      readonly cancellationBuffer: SharedArrayBuffer
    }

export type SearchWorkerToCoordinatorMessage =
  | { readonly type: 'worker:ready' }
  | {
      readonly type: 'document:loaded'
      readonly requestId: SearchRequestId
      readonly documentId: SearchDocumentId
    }
  | {
      readonly type: 'document:released'
      readonly requestId: SearchRequestId
      readonly documentId: SearchDocumentId
      readonly released: boolean
    }
  | {
      readonly type: 'document:error'
      readonly requestId: SearchRequestId
      readonly error: SerializedSearchError
    }
  | {
      readonly type: 'search:progress'
      readonly jobId: SearchJobId
      readonly progress: SearchProgress
    }
  | ({ readonly type: 'search:results'; readonly jobId: SearchJobId } & SearchResultBatch)
  | {
      readonly type: 'search:complete'
      readonly jobId: SearchJobId
      readonly resultCount: number
    }
  | {
      readonly type: 'search:cancelled'
      readonly jobId: SearchJobId
      readonly resultCount: number
    }
  | {
      readonly type: 'search:error'
      readonly jobId: SearchJobId
      readonly error: SerializedSearchError
    }
