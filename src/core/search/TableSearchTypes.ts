import type { SearchOptions } from './SearchTypes.ts'

export interface TableSearchContext {
  readonly before: Uint8Array
  readonly after: Uint8Array
  readonly decodedText?: string
}

export interface TableSearchResult {
  readonly offset: number
  readonly length: number
  readonly matchedBytes: Uint8Array
  readonly matchedText: string
  readonly context?: TableSearchContext
}

export interface TableSearchOptions extends Omit<SearchOptions, 'onResults'> {
  readonly contextBytes?: number
  readonly onResults?: (results: readonly TableSearchResult[]) => void
}
