import type { CharacterEncodingId } from './CharacterEncoding.ts'

export type CharacterEncodingErrorCode =
  | 'UNREPRESENTABLE_CHARACTER'
  | 'INVALID_BYTE_SEQUENCE'
  | 'INCOMPLETE_BYTE_SEQUENCE'
  | 'UNKNOWN_ENCODING'

export type CharacterEncodingErrorFragment = string | readonly number[]

interface CharacterEncodingErrorOptions {
  encodingId?: CharacterEncodingId | string
  position?: number
  fragment?: CharacterEncodingErrorFragment
}

export class CharacterEncodingError extends Error {
  readonly code: CharacterEncodingErrorCode
  readonly reason: string
  readonly encodingId?: CharacterEncodingId | string
  readonly position?: number
  readonly fragment?: CharacterEncodingErrorFragment

  constructor(
    code: CharacterEncodingErrorCode,
    reason: string,
    options: CharacterEncodingErrorOptions = {}
  ) {
    super(reason)
    this.name = 'CharacterEncodingError'
    this.code = code
    this.reason = reason
    this.encodingId = options.encodingId
    this.position = options.position
    this.fragment = Array.isArray(options.fragment) ? [...options.fragment] : options.fragment
  }
}
