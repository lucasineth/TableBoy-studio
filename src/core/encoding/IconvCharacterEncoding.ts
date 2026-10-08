import iconv from 'iconv-lite'

import type {
  CharacterEncoding,
  CharacterEncodingFamily,
  CharacterEncodingId,
  EncodedBytes
} from './CharacterEncoding.ts'
import { CharacterEncodingError } from './EncodingError.ts'

const REPLACEMENT_CHARACTER = '\uFFFD'
const SUBSTITUTION_BYTE = 0x3f

export abstract class IconvCharacterEncoding implements CharacterEncoding {
  readonly id: CharacterEncodingId
  readonly label: string
  readonly family: CharacterEncodingFamily
  private readonly iconvName: string

  protected constructor(
    id: CharacterEncodingId,
    label: string,
    family: CharacterEncodingFamily,
    iconvName: string
  ) {
    this.id = id
    this.label = label
    this.family = family
    this.iconvName = iconvName
  }

  encode(text: string): Uint8Array {
    let position = 0
    for (const character of text) {
      const encoded = iconv.encode(character, this.iconvName)
      if (isSubstitution(character, encoded)) {
        throw new CharacterEncodingError(
          'UNREPRESENTABLE_CHARACTER',
          `${this.label} cannot represent the character at position ${position}: ${JSON.stringify(character)}.`,
          { encodingId: this.id, position, fragment: character }
        )
      }
      position += 1
    }

    return Uint8Array.from(iconv.encode(text, this.iconvName))
  }

  decode(input: EncodedBytes): string {
    const bytes = validatedBytes(input, this.id, this.label)
    this.validateDecodingInput?.(bytes)

    const decoded = this.decodeUnchecked(bytes)
    if (decoded.includes(REPLACEMENT_CHARACTER)) {
      throw new CharacterEncodingError(
        'INVALID_BYTE_SEQUENCE',
        `${this.label} cannot decode the supplied byte sequence.`,
        { encodingId: this.id, position: 0, fragment: bytes.slice(0, 8) }
      )
    }
    return decoded
  }

  protected validateDecodingInput?(bytes: readonly number[]): void

  protected decodeUnchecked(bytes: readonly number[]): string {
    return iconv.decode(Uint8Array.from(bytes), this.iconvName)
  }
}

function isSubstitution(character: string, encoded: Uint8Array): boolean {
  return character !== '?' && encoded.length === 1 && encoded[0] === SUBSTITUTION_BYTE
}

function validatedBytes(
  input: EncodedBytes,
  encodingId: CharacterEncodingId,
  label: string
): number[] {
  const bytes = Array.from(input)
  const invalidIndex = bytes.findIndex((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)

  if (invalidIndex >= 0) {
    throw new CharacterEncodingError(
      'INVALID_BYTE_SEQUENCE',
      `${label} input byte at offset ${invalidIndex} must be an integer between 0 and 255.`,
      { encodingId, position: invalidIndex, fragment: [bytes[invalidIndex]] }
    )
  }

  return bytes
}
