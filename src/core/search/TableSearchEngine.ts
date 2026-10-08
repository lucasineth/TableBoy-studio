import { TableCodecError, TableDecoder, TableEncoder } from '../codec/index.ts'
import type { TableEntry } from '../table/index.ts'
import { BinarySearchEngine } from './BinarySearchEngine.ts'
import { TableSearchError } from './TableSearchError.ts'
import type { SearchOptions, SearchResult } from './SearchTypes.ts'
import type {
  TableSearchContext,
  TableSearchOptions,
  TableSearchResult
} from './TableSearchTypes.ts'

export class TableSearchEngine {
  readonly #encoder = new TableEncoder()
  readonly #decoder = new TableDecoder()
  readonly #binarySearch = new BinarySearchEngine()

  search(
    input: Uint8Array,
    query: string,
    entries: readonly TableEntry[],
    options: TableSearchOptions = {}
  ): TableSearchResult[] {
    if (query.length === 0) {
      throw new TableSearchError('EMPTY_QUERY', 'The table search query cannot be empty.')
    }

    const contextBytes = options.contextBytes ?? 0
    if (!Number.isSafeInteger(contextBytes) || contextBytes < 0) {
      throw new TableSearchError(
        'INVALID_CONTEXT_BYTES',
        'contextBytes must be a non-negative integer.'
      )
    }

    const pattern = this.#encoder.encode(query, entries)
    const enrichedResults: TableSearchResult[] = []
    const enrich = (result: SearchResult): TableSearchResult =>
      this.createResult(input, query, entries, result, contextBytes)
    const onResults = options.onResults
      ? (batch: readonly SearchResult[]): void => {
          const enrichedBatch = batch.map(enrich)
          enrichedResults.push(...enrichedBatch)
          options.onResults?.(enrichedBatch)
        }
      : undefined
    const searchOptions: SearchOptions = {
      startOffset: options.startOffset,
      endOffset: options.endOffset,
      maxResults: options.maxResults,
      alignment: options.alignment,
      signal: options.signal,
      onProgress: options.onProgress,
      onResults
    }

    const binaryResults = this.#binarySearch.search(input, pattern, searchOptions)
    return onResults ? enrichedResults : binaryResults.map(enrich)
  }

  private createResult(
    input: Uint8Array,
    query: string,
    entries: readonly TableEntry[],
    result: SearchResult,
    contextBytes: number
  ): TableSearchResult {
    const matchEnd = result.offset + result.length
    const matchedBytes = input.slice(result.offset, matchEnd)
    const context =
      contextBytes > 0
        ? this.createContext(input, entries, result.offset, matchEnd, contextBytes)
        : undefined

    return {
      offset: result.offset,
      length: result.length,
      matchedBytes,
      matchedText: query,
      context
    }
  }

  private createContext(
    input: Uint8Array,
    entries: readonly TableEntry[],
    matchStart: number,
    matchEnd: number,
    contextBytes: number
  ): TableSearchContext {
    const contextStart = Math.max(0, matchStart - contextBytes)
    const contextEnd = Math.min(input.length, matchEnd + contextBytes)
    const before = input.slice(contextStart, matchStart)
    const after = input.slice(matchEnd, contextEnd)

    try {
      return {
        before,
        after,
        decodedText: this.#decoder.decode(input.subarray(contextStart, contextEnd), entries)
      }
    } catch (error) {
      if (!(error instanceof TableCodecError)) throw error
      return { before, after }
    }
  }
}
