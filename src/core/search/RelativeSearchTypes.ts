import type { ByteOrder } from '../bytes/index.ts'
import type { SearchOptions } from './SearchTypes.ts'

export const DEFAULT_RELATIVE_MAX_RESULTS = 10_000

export interface RelativeCharacterMapping {
  readonly character: string
  readonly value: number
}

export interface RelativeSearchResult {
  readonly offset: number
  readonly length: number
  readonly matchedBytes: Uint8Array
  readonly mappings: readonly RelativeCharacterMapping[]
}

interface RelativeSearchCommonOptions extends Omit<SearchOptions, 'onResults'> {
  readonly allowTwoSymbolQuery?: boolean
  readonly wildcards?: boolean
  readonly characterSequence?: string
  readonly onResults?: (results: readonly RelativeSearchResult[]) => void
}

export type RelativeSearchOptions = RelativeSearchCommonOptions &
  (
    | { readonly valueWidth?: 1; readonly byteOrder?: never }
    | { readonly valueWidth: 2; readonly byteOrder: ByteOrder }
  )
