import type { SerializedSearchError } from './SearchProtocol.ts'

export type SearchCoordinatorErrorCode =
  | 'COORDINATOR_NOT_STARTED'
  | 'COORDINATOR_DISPOSED'
  | 'DOCUMENT_ALREADY_LOADED'
  | 'DOCUMENT_NOT_FOUND'
  | 'SEARCH_QUEUE_FULL'
  | 'WORKER_CRASHED'
  | 'WORKER_TERMINATED'

export class SearchCoordinatorError extends Error {
  readonly code: SearchCoordinatorErrorCode

  constructor(code: SearchCoordinatorErrorCode, message: string) {
    super(message)
    this.name = 'SearchCoordinatorError'
    this.code = code
  }
}

export class SearchExecutionError extends Error {
  readonly code?: string
  readonly serialized: SerializedSearchError

  constructor(serialized: SerializedSearchError) {
    super(serialized.message)
    this.name = serialized.name
    this.code = serialized.code
    this.serialized = serialized
  }
}
