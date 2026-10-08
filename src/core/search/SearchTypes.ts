export interface SearchResult {
  readonly offset: number
  readonly length: number
}

export interface SearchProgress {
  readonly processed: number
  readonly total: number
  readonly percentage: number
}

/** Minimal cancellation contract implemented by AbortSignal and worker-backed flags. */
export interface SearchCancellation {
  readonly aborted: boolean
}

export interface SearchOptions {
  readonly startOffset?: number
  readonly endOffset?: number
  readonly maxResults?: number
  readonly alignment?: number
  readonly signal?: SearchCancellation
  readonly onProgress?: (progress: SearchProgress) => void
  readonly onResults?: (results: readonly SearchResult[]) => void
}
