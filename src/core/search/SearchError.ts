export type SearchErrorCode =
  | 'INVALID_SEARCH_RANGE'
  | 'EMPTY_PATTERN'
  | 'INVALID_ALIGNMENT'
  | 'INVALID_MAX_RESULTS'
  | 'SEARCH_ABORTED'

export class SearchError extends Error {
  readonly code: SearchErrorCode

  constructor(code: SearchErrorCode, message: string) {
    super(message)
    this.name = 'SearchError'
    this.code = code
  }
}
