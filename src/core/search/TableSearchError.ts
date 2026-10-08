export type TableSearchErrorCode = 'EMPTY_QUERY' | 'INVALID_CONTEXT_BYTES'

export class TableSearchError extends Error {
  readonly code: TableSearchErrorCode

  constructor(code: TableSearchErrorCode, message: string) {
    super(message)
    this.name = 'TableSearchError'
    this.code = code
  }
}
