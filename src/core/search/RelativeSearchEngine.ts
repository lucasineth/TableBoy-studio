import { BYTE_ORDERS, type ByteOrder } from '../bytes/index.ts'
import { RelativeSearchError } from './RelativeSearchError.ts'
import {
  compileTextRelativePattern,
  compileValueRelativePattern,
  type RelativePattern
} from './RelativePattern.ts'
import {
  DEFAULT_RELATIVE_MAX_RESULTS,
  type RelativeCharacterMapping,
  type RelativeSearchOptions,
  type RelativeSearchResult
} from './RelativeSearchTypes.ts'
import { SearchError } from './SearchError.ts'
import type { SearchCancellation } from './SearchTypes.ts'

const MAX_PROGRESS_UPDATES = 100
const MIN_PROGRESS_INTERVAL = 1024
const RESULT_BATCH_SIZE = 128
const ABORT_CHECK_INTERVAL = 4096

interface NormalizedRelativeSearchOptions {
  readonly startOffset: number
  readonly endOffset: number
  readonly maxResults: number
  readonly alignment: number
  readonly valueWidth: 1 | 2
  readonly byteOrder?: ByteOrder
  readonly signal?: SearchCancellation
  readonly onProgress?: RelativeSearchOptions['onProgress']
  readonly onResults?: RelativeSearchOptions['onResults']
}

type RelativeValueReader = (byteOffset: number) => number

export class RelativeSearchEngine {
  search(
    input: Uint8Array,
    query: string,
    options: RelativeSearchOptions = {}
  ): RelativeSearchResult[] {
    const normalized = this.normalizeOptions(input.length, options)
    const valueMask = normalized.valueWidth === 1 ? 0xff : 0xffff
    const pattern = compileTextRelativePattern(query, {
      valueMask,
      allowTwoSymbolQuery: options.allowTwoSymbolQuery === true,
      wildcards: options.wildcards === true,
      characterSequence: options.characterSequence
    })
    return this.scan(input, pattern, normalized, valueMask)
  }

  searchValues(
    input: Uint8Array,
    values: readonly number[],
    options: RelativeSearchOptions = {}
  ): RelativeSearchResult[] {
    if (options.wildcards !== undefined || options.characterSequence !== undefined) {
      throw new RelativeSearchError(
        'INCOMPATIBLE_OPTIONS',
        'Value Scan cannot use wildcard or character-sequence options.'
      )
    }
    const normalized = this.normalizeOptions(input.length, options)
    const valueMask = normalized.valueWidth === 1 ? 0xff : 0xffff
    const pattern = compileValueRelativePattern(
      values,
      valueMask,
      options.allowTwoSymbolQuery === true
    )
    return this.scan(input, pattern, normalized, valueMask)
  }

  private scan(
    input: Uint8Array,
    pattern: RelativePattern,
    normalized: NormalizedRelativeSearchOptions,
    valueMask: number
  ): RelativeSearchResult[] {
    this.throwIfAborted(normalized.signal)
    const readValue = this.createValueReader(input, normalized)
    const byteLength = pattern.positions.length * normalized.valueWidth
    const firstOffset = this.alignOffset(normalized.startOffset, normalized.alignment)
    const lastOffset = normalized.endOffset - byteLength
    const total =
      firstOffset <= lastOffset
        ? Math.floor((lastOffset - firstOffset) / normalized.alignment) + 1
        : 0

    if (total === 0) {
      this.reportProgress(normalized, 0, 0)
      this.throwIfAborted(normalized.signal)
      return []
    }

    const results: RelativeSearchResult[] = []
    let batch: RelativeSearchResult[] = []
    let processed = 0
    let lastReported = -1
    let nextAbortCheck = 0
    const progressInterval = Math.max(
      MIN_PROGRESS_INTERVAL,
      Math.ceil(total / MAX_PROGRESS_UPDATES)
    )
    let nextProgress = progressInterval

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

    for (let offset = firstOffset; offset <= lastOffset; offset += normalized.alignment) {
      if (processed === nextAbortCheck) {
        this.throwIfAborted(normalized.signal)
        nextAbortCheck += ABORT_CHECK_INTERVAL
      }

      if (this.matchesPattern(offset, pattern, readValue, normalized.valueWidth, valueMask)) {
        const mappings = this.inferMappings(offset, pattern, readValue, normalized.valueWidth)
        if (mappings) {
          const result: RelativeSearchResult = {
            offset,
            length: byteLength,
            matchedBytes: input.slice(offset, offset + byteLength),
            mappings
          }
          results.push(result)
          if (normalized.onResults) batch.push(result)

          if (batch.length === RESULT_BATCH_SIZE) emitBatch()

          if (results.length === normalized.maxResults) {
            processed += 1
            emitBatch()
            emitProgress()
            return results
          }
        }
      }

      processed += 1
      if (processed === nextProgress) {
        emitProgress()
        nextProgress += progressInterval
      }
    }

    emitBatch()
    emitProgress()
    return results
  }

  private matchesPattern(
    offset: number,
    pattern: RelativePattern,
    readValue: RelativeValueReader,
    valueWidth: 1 | 2,
    valueMask: number
  ): boolean {
    const anchorValue = readValue(offset + pattern.anchorIndex * valueWidth)
    for (const constraint of pattern.constraints) {
      const value = readValue(offset + constraint.index * valueWidth)
      if (((value - anchorValue) & valueMask) !== constraint.delta) {
        return false
      }
    }
    return true
  }

  private inferMappings(
    offset: number,
    pattern: RelativePattern,
    readValue: RelativeValueReader,
    valueWidth: 1 | 2
  ): RelativeCharacterMapping[] | undefined {
    const valueByCharacter = new Map<string, number>()
    const characterByValue = new Map<number, string>()
    const mappings: RelativeCharacterMapping[] = []

    for (let index = 0; index < pattern.positions.length; index += 1) {
      const position = pattern.positions[index]
      if (position.kind === 'wildcard' || position.symbol === undefined) continue
      const character = position.symbol
      const value = readValue(offset + index * valueWidth)
      const mappedValue = valueByCharacter.get(character)
      const mappedCharacter = characterByValue.get(value)

      if (
        (mappedValue !== undefined && mappedValue !== value) ||
        (mappedCharacter !== undefined && mappedCharacter !== character)
      ) {
        return undefined
      }

      if (mappedValue === undefined) {
        valueByCharacter.set(character, value)
        characterByValue.set(value, character)
        mappings.push({ character, value })
      }
    }

    return mappings
  }

  private normalizeOptions(
    inputLength: number,
    options: RelativeSearchOptions
  ): NormalizedRelativeSearchOptions {
    const startOffset = options.startOffset ?? 0
    const endOffset = options.endOffset ?? inputLength
    const alignment = options.alignment ?? 1
    const maxResults = options.maxResults ?? DEFAULT_RELATIVE_MAX_RESULTS
    const valueWidth = options.valueWidth ?? 1
    const byteOrder = options.byteOrder

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
    if (!Number.isSafeInteger(maxResults) || maxResults <= 0) {
      throw new SearchError('INVALID_MAX_RESULTS', 'maxResults must be a positive integer.')
    }
    if (valueWidth !== 1 && valueWidth !== 2) {
      throw new RelativeSearchError(
        'INVALID_VALUE_WIDTH',
        'Relative search valueWidth must be 1 or 2.'
      )
    }
    if (valueWidth === 1 && byteOrder !== undefined) {
      throw new RelativeSearchError(
        'INCOMPATIBLE_OPTIONS',
        'byteOrder cannot be specified for an 8-bit relative search.'
      )
    }
    if (
      valueWidth === 2 &&
      (byteOrder === undefined || !BYTE_ORDERS.includes(byteOrder as ByteOrder))
    ) {
      throw new RelativeSearchError(
        'INVALID_BYTE_ORDER',
        'A 16-bit relative search requires little-endian or big-endian byte order.'
      )
    }

    return {
      startOffset,
      endOffset,
      maxResults,
      alignment,
      valueWidth,
      byteOrder,
      signal: options.signal,
      onProgress: options.onProgress,
      onResults: options.onResults
    }
  }

  private createValueReader(
    input: Uint8Array,
    options: NormalizedRelativeSearchOptions
  ): RelativeValueReader {
    if (options.valueWidth === 1) return (byteOffset) => input[byteOffset]

    // Byte order has already been validated. These expressions intentionally
    // mirror readUint16 without repeating its range checks in the hot loop.
    if (options.byteOrder === 'little-endian') {
      return (byteOffset) => input[byteOffset] | (input[byteOffset + 1] << 8)
    }
    return (byteOffset) => (input[byteOffset] << 8) | input[byteOffset + 1]
  }

  private alignOffset(offset: number, alignment: number): number {
    const remainder = offset % alignment
    return remainder === 0 ? offset : offset + alignment - remainder
  }

  private reportProgress(
    options: NormalizedRelativeSearchOptions,
    processed: number,
    total: number
  ): void {
    if (!options.onProgress) return
    const percentage = total === 0 ? 100 : Math.min(100, (processed / total) * 100)
    options.onProgress({ processed, total, percentage })
  }

  private throwIfAborted(signal?: SearchCancellation): void {
    if (signal?.aborted) throw new SearchError('SEARCH_ABORTED', 'The search was aborted.')
  }
}
