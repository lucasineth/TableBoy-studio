export type SearchIpcErrorCode =
  'INVALID_SEARCH_REQUEST' | 'SEARCH_IPC_LIMIT_EXCEEDED' | 'OWNER_DESTROYED'

export class SearchIpcError extends Error {
  readonly code: SearchIpcErrorCode

  constructor(code: SearchIpcErrorCode, message: string) {
    super(message)
    this.name = 'SearchIpcError'
    this.code = code
  }
}
