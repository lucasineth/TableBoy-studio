import { getCharacterEncoding } from '../encoding/EncodingRegistry.ts'
import { CharacterEncodingError } from '../encoding/EncodingError.ts'
import { SearchError } from './SearchError.ts'
import {
  STRING_PREVIEW_BYTES,
  STRING_PREVIEW_CHARACTERS,
  STRING_SCANNER_ENCODINGS,
  StringScannerError,
  type StringScannerOptions,
  type StringScannerResult
} from './StringScannerTypes.ts'

const LETTER_OR_MARK = /^[\p{L}\p{M}]$/u
const SPACE = /^\p{Zs}$/u
const NUMBER = /^\p{N}$/u
const PUNCTUATION_OR_SYMBOL = /^[\p{P}\p{S}]$/u

/** Finds maximal runs of allowed, strictly decoded characters. No normalization. */
export class StringScanner {
  scan(input: Uint8Array, options: StringScannerOptions = {}): StringScannerResult[] {
    const encoding = options.encoding ?? 'ascii'
    if (!STRING_SCANNER_ENCODINGS.includes(encoding)) {
      throw new StringScannerError(
        'INVALID_STRING_ENCODING',
        'Select an explicit supported encoding.'
      )
    }
    const start = options.startOffset ?? 0
    const end = options.endOffset ?? input.length
    const alignment = options.alignment ?? 1
    const limit = options.maxResults ?? 10_000
    const minimum = options.minLength ?? 4
    const maximum = options.maxLength ?? Infinity
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end > input.length
    ) {
      throw new SearchError(
        'INVALID_SEARCH_RANGE',
        'String scan range is outside the input bounds.'
      )
    }
    if (!Number.isSafeInteger(alignment) || alignment < 1)
      throw new SearchError('INVALID_ALIGNMENT', 'Alignment must be a positive integer.')
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new SearchError('INVALID_MAX_RESULTS', 'maxResults must be a positive integer.')
    if (
      !Number.isSafeInteger(minimum) ||
      minimum < 1 ||
      (options.maxLength !== undefined && (!Number.isSafeInteger(maximum) || maximum < minimum))
    ) {
      throw new StringScannerError(
        'INVALID_STRING_LENGTH',
        'Lengths must be positive integers and maximum must be at least minimum.'
      )
    }
    const abort = (): void => {
      if (options.signal?.aborted) throw new SearchError('SEARCH_ABORTED', 'The scan was aborted.')
    }
    const codec = encoding === 'ascii' ? undefined : getCharacterEncoding(encoding)
    // At most 256 single-byte or 65,536 two-byte tokens; never proportional to the input.
    const decoded = new Map<number, string | null>()
    const token = (offset: number): { text: string | null; width: number } => {
      const first = input[offset]
      const lead =
        encoding === 'shift-jis' &&
        ((first >= 0x81 && first <= 0x9f) || (first >= 0xe0 && first <= 0xfc))
      if (lead && offset + 1 >= end) return { text: null, width: 1 }
      const width = lead ? 2 : 1
      const key = width === 2 ? 256 + (first << 8) + input[offset + 1] : first
      if (!decoded.has(key)) {
        let text: string | null = null
        try {
          text = codec
            ? codec.decode(input.subarray(offset, offset + width))
            : first >= 0x20 && first <= 0x7e
              ? String.fromCharCode(first)
              : null
        } catch (error) {
          if (!(error instanceof CharacterEncodingError)) throw error
        }
        decoded.set(key, text)
      }
      const text = decoded.get(key)!
      return { text, width: text === null ? 1 : width }
    }
    const allowed = (symbol: string): boolean =>
      LETTER_OR_MARK.test(symbol) ||
      ((options.includeSpaces ?? true) && SPACE.test(symbol)) ||
      ((options.includeNumbers ?? true) && NUMBER.test(symbol)) ||
      ((options.includePunctuation ?? true) && PUNCTUATION_OR_SYMBOL.test(symbol))

    const results: StringScannerResult[] = []
    let batch: StringScannerResult[] = []
    let runStart = start
    let characters = 0
    let preview = ''
    let previewCharacters = 0
    let previewEnd = start
    const total = end - start
    const interval = Math.max(4096, Math.ceil(total / 100))
    let nextProgress = interval
    let nextAbort = start
    const progress = (offset: number): void => {
      const processed = offset - start
      options.onProgress?.({
        processed,
        total,
        percentage: total === 0 ? 100 : (processed / total) * 100
      })
      abort()
    }
    const emit = (): void => {
      if (batch.length && options.onResults) options.onResults(batch)
      batch = []
      abort()
    }
    const finish = (offset: number): void => {
      if (characters >= minimum && characters <= maximum && runStart % alignment === 0) {
        const result: StringScannerResult = {
          offset: runStart,
          length: offset - runStart,
          characterLength: characters,
          encoding,
          text: preview,
          matchedBytes: input.slice(runStart, previewEnd),
          previewTruncated: previewEnd !== offset
        }
        results.push(result)
        if (options.onResults) batch.push(result)
        if (batch.length === 128) emit()
      }
      characters = 0
      preview = ''
      previewCharacters = 0
    }
    abort()
    progress(start)
    let offset = start
    while (offset < end) {
      if (offset >= nextAbort) {
        abort()
        nextAbort = offset + 4096
      }
      const current = token(offset)
      const symbols = current.text === null ? [] : Array.from(current.text)
      if (symbols.length && symbols.every(allowed)) {
        if (characters === 0) {
          runStart = offset
          previewEnd = offset
        }
        characters += symbols.length
        if (
          previewEnd === offset &&
          previewCharacters + symbols.length <= STRING_PREVIEW_CHARACTERS &&
          offset + current.width - runStart <= STRING_PREVIEW_BYTES
        ) {
          preview += current.text
          previewCharacters += symbols.length
          previewEnd = offset + current.width
        }
      } else {
        finish(offset)
        if (results.length === limit) {
          emit()
          progress(offset)
          return results
        }
      }
      offset += current.width
      if (offset - start >= nextProgress) {
        progress(offset)
        nextProgress = offset - start + interval
      }
    }
    finish(end)
    emit()
    progress(end)
    return results
  }
}
