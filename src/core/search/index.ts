export { BinarySearchEngine } from './BinarySearchEngine.ts'
export { StringScanner } from './StringScanner.ts'
export {
  STRING_SCANNER_ENCODINGS,
  STRING_PREVIEW_BYTES,
  STRING_PREVIEW_CHARACTERS,
  StringScannerError,
  type StringScannerEncoding,
  type StringScannerOptions,
  type StringScannerResult
} from './StringScannerTypes.ts'
export { RelativeSearchEngine } from './RelativeSearchEngine.ts'
export { RelativeSearchError, type RelativeSearchErrorCode } from './RelativeSearchError.ts'
export {
  DEFAULT_RELATIVE_MAX_RESULTS,
  type RelativeCharacterMapping,
  type RelativeSearchOptions,
  type RelativeSearchResult
} from './RelativeSearchTypes.ts'
export { SearchError, type SearchErrorCode } from './SearchError.ts'
export type {
  SearchCancellation,
  SearchOptions,
  SearchProgress,
  SearchResult
} from './SearchTypes.ts'
export { TableSearchEngine } from './TableSearchEngine.ts'
export { TableSearchError, type TableSearchErrorCode } from './TableSearchError.ts'
export type {
  TableSearchContext,
  TableSearchOptions,
  TableSearchResult
} from './TableSearchTypes.ts'
