import { SearchError } from './SearchError.ts'
import type {
  SearchCancellation,
  SearchOptions,
  SearchProgress,
  SearchResult
} from './SearchTypes.ts'

const MAX_PROGRESS_UPDATES = 100
const MIN_PROGRESS_INTERVAL = 1024
const RESULT_BATCH_SIZE = 128
const ABORT_CHECK_INTERVAL = 4096

interface NormalizedSearchOptions {
  startOffset: number
  endOffset: number
  maxResults?: number
  alignment: number
  signal?: SearchCancellation
  onProgress?: (progress: SearchProgress) => void
  onResults?: (results: readonly SearchResult[]) => void
}

export class BinarySearchEngine {
  search(input: Uint8Array, pattern: Uint8Array, options: SearchOptions = {}): SearchResult[] {
    if (pattern.length === 0) {
      throw new SearchError('EMPTY_PATTERN', 'The search pattern must contain at least one byte.')
    }

    const normalized = this.normalizeOptions(input.length, options)
    this.throwIfAborted(normalized.signal)

    const firstOffset = this.alignOffset(normalized.startOffset, normalized.alignment)
    const lastOffset = normalized.endOffset - pattern.length
    const total =
      firstOffset <= lastOffset
        ? Math.floor((lastOffset - firstOffset) / normalized.alignment) + 1
        : 0

    if (total === 0) {
      this.reportProgress(normalized, 0, 0)
      this.throwIfAborted(normalized.signal)
      return []
    }

    const results: SearchResult[] = []
    let batch: SearchResult[] = []
    let processed = 0
    let lastReported = -1
    const progressInterval = Math.max(
      MIN_PROGRESS_INTERVAL,
      Math.ceil(total / MAX_PROGRESS_UPDATES)
    )

    const emitProgress = (): void => {
      if (processed === lastReported) return
      this.reportProgress(normalized, processed, total)
      lastReported = processed
      this.throwIfAborted(normalized.signal)
    }

    const emitBatch = (): void => {
      if (batch.length === 0 || !normalized.onResults) return
      normalized.onResults(batch)
      batch = []
      this.throwIfAborted(normalized.signal)
    }

    emitProgress()

    while (processed < total) {
      this.throwIfAborted(normalized.signal)
      const candidatesInSegment = Math.min(progressInterval, total - processed)
      const segmentStart = firstOffset + processed * normalized.alignment
      const segmentEnd = segmentStart + (candidatesInSegment - 1) * normalized.alignment
      const segment = input.subarray(segmentStart, segmentEnd + 1)
      let candidateInSegment = segment.indexOf(pattern[0])
      let candidatesSinceAbortCheck = 0

      while (candidateInSegment >= 0) {
        const candidateOffset = segmentStart + candidateInSegment
        if (
          candidateOffset % normalized.alignment === 0 &&
          this.matchesAt(input, pattern, candidateOffset)
        ) {
          const result = { offset: candidateOffset, length: pattern.length }
          results.push(result)
          batch.push(result)

          if (batch.length === RESULT_BATCH_SIZE) emitBatch()

          if (results.length === normalized.maxResults) {
            processed = Math.floor((candidateOffset - firstOffset) / normalized.alignment) + 1
            emitBatch()
            emitProgress()
            return results
          }
        }

        candidatesSinceAbortCheck += 1
        if (candidatesSinceAbortCheck === ABORT_CHECK_INTERVAL) {
          this.throwIfAborted(normalized.signal)
          candidatesSinceAbortCheck = 0
        }
        candidateInSegment = segment.indexOf(pattern[0], candidateInSegment + 1)
      }

      processed += candidatesInSegment
      emitProgress()
    }

    emitBatch()
    emitProgress()
    return results
  }

  private normalizeOptions(inputLength: number, options: SearchOptions): NormalizedSearchOptions {
    const startOffset = options.startOffset ?? 0
    const endOffset = options.endOffset ?? inputLength
    const alignment = options.alignment ?? 1

    if (
      !Number.isSafeInteger(startOffset) ||
      !Number.isSafeInteger(endOffset) ||
      startOffset < 0 ||
      endOffset < startOffset ||
      endOffset > inputLength
    ) {
      throw new SearchError(
        'INVALID_SEARCH_RANGE',
        `Search range [${startOffset}, ${endOffset}) is outside the input bounds.`
      )
    }

    if (!Number.isSafeInteger(alignment) || alignment <= 0) {
      throw new SearchError('INVALID_ALIGNMENT', 'Alignment must be a positive integer.')
    }

    if (
      options.maxResults !== undefined &&
      (!Number.isSafeInteger(options.maxResults) || options.maxResults <= 0)
    ) {
      throw new SearchError('INVALID_MAX_RESULTS', 'maxResults must be a positive integer.')
    }

    return {
      startOffset,
      endOffset,
      maxResults: options.maxResults,
      alignment,
      signal: options.signal,
      onProgress: options.onProgress,
      onResults: options.onResults
    }
  }

  private alignOffset(offset: number, alignment: number): number {
    const remainder = offset % alignment
    return remainder === 0 ? offset : offset + alignment - remainder
  }

  private matchesAt(input: Uint8Array, pattern: Uint8Array, offset: number): boolean {
    if (input[offset] !== pattern[0]) return false

    for (let patternOffset = 1; patternOffset < pattern.length; patternOffset += 1) {
      if (input[offset + patternOffset] !== pattern[patternOffset]) return false
    }

    return true
  }

  private reportProgress(options: NormalizedSearchOptions, processed: number, total: number): void {
    if (!options.onProgress) return
    const percentage = total === 0 ? 100 : Math.min(100, (processed / total) * 100)
    options.onProgress({ processed, total, percentage })
  }

  private throwIfAborted(signal?: SearchCancellation): void {
    if (signal?.aborted) {
      throw new SearchError('SEARCH_ABORTED', 'The search was aborted.')
    }
  }
}
