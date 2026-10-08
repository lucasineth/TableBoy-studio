export type RelativeSearchErrorCode =
  | 'EMPTY_QUERY'
  | 'QUERY_TOO_SHORT'
  | 'INVALID_VALUE_WIDTH'
  | 'INVALID_BYTE_ORDER'
  | 'INCOMPATIBLE_OPTIONS'
  | 'EMPTY_CHARACTER_SEQUENCE'
  | 'DUPLICATE_SEQUENCE_SYMBOL'
  | 'SYMBOL_NOT_IN_SEQUENCE'
  | 'INVALID_WILDCARD_ESCAPE'
  | 'INSUFFICIENT_CONSTRAINTS'
  | 'EMPTY_VALUES'
  | 'INVALID_RELATIVE_VALUE'

export class RelativeSearchError extends Error {
  readonly code: RelativeSearchErrorCode

  constructor(code: RelativeSearchErrorCode, message: string) {
    super(message)
    this.name = 'RelativeSearchError'
    this.code = code
  }
}
