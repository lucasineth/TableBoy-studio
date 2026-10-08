export {
  MAX_QUEUED_SEARCH_JOBS,
  SearchCoordinator,
  type SearchJob,
  type SearchJobCompletion,
  type SearchJobHandlers,
  type SearchWorkerFactory
} from './SearchCoordinator.ts'
export {
  SearchCoordinatorError,
  SearchExecutionError,
  type SearchCoordinatorErrorCode
} from './SearchCoordinatorError.ts'
export { SearchIpcController, type SearchEventTarget } from './SearchIpcController.ts'
export { SearchIpcError, type SearchIpcErrorCode } from './SearchIpcError.ts'
export { SEARCH_IPC_LIMITS } from './SearchIpcPolicy.ts'
export type {
  BinarySearchRequest,
  PortableRelativeSearchOptions,
  PortableSearchOptions,
  PortableTableSearchOptions,
  RelativeSearchRequest,
  SearchDocumentId,
  SearchJobId,
  SearchRequest,
  SearchResultBatch,
  SearchWorkerToCoordinatorMessage,
  SerializedSearchError,
  TableSearchRequest
} from './SearchProtocol.ts'
