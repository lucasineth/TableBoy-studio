import type { CharacterEncodingId } from '../encoding/CharacterEncoding.ts'
import type { SearchOptions, SearchResult } from './SearchTypes.ts'

export const STRING_SCANNER_ENCODINGS = [
  'ascii',
  'windows-1252',
  'cp437',
  'cp850',
  'shift-jis'
] as const
export type StringScannerEncoding = 'ascii' | CharacterEncodingId
export const STRING_PREVIEW_CHARACTERS = 256
export const STRING_PREVIEW_BYTES = 512

export interface StringScannerResult extends SearchResult {
  readonly encoding: StringScannerEncoding
  readonly text: string
  readonly characterLength: number
  /** Original bytes of the bounded preview; length remains the full byte range. */
  readonly matchedBytes: Uint8Array
  readonly previewTruncated: boolean
}

export interface StringScannerOptions extends Omit<SearchOptions, 'onResults'> {
  readonly encoding?: StringScannerEncoding
  readonly minLength?: number
  readonly maxLength?: number
  readonly includeSpaces?: boolean
  readonly includeNumbers?: boolean
  readonly includePunctuation?: boolean
  readonly onResults?: (results: readonly StringScannerResult[]) => void
}

export class StringScannerError extends Error {
  readonly code: 'INVALID_STRING_ENCODING' | 'INVALID_STRING_LENGTH'
  constructor(code: StringScannerError['code'], message: string) {
    super(message)
    this.name = 'StringScannerError'
    this.code = code
  }
}
