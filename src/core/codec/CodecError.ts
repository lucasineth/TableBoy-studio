export type TableCodecErrorCode =
  | 'EMPTY_TABLE'
  | 'INVALID_TABLE'
  | 'AMBIGUOUS_VALUE'
  | 'UNMAPPED_TEXT'
  | 'UNKNOWN_BYTE'
  | 'INCOMPLETE_SEQUENCE'
  | 'INVALID_INPUT_BYTE'

export type TableCodecErrorFragment = string | readonly number[]

interface TableCodecErrorOptions {
  position?: number
  fragment?: TableCodecErrorFragment
  entryIndexes?: readonly number[]
}

export class TableCodecError extends Error {
  readonly code: TableCodecErrorCode
  readonly reason: string
  readonly position?: number
  readonly fragment?: TableCodecErrorFragment
  readonly entryIndexes: readonly number[]

  constructor(code: TableCodecErrorCode, reason: string, options: TableCodecErrorOptions = {}) {
    super(reason)
    this.name = 'TableCodecError'
    this.code = code
    this.reason = reason
    this.position = options.position
    this.fragment = Array.isArray(options.fragment) ? [...options.fragment] : options.fragment
    this.entryIndexes = [...(options.entryIndexes ?? [])]
  }
}
