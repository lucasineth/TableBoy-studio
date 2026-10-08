import { CharacterEncodingError } from './EncodingError.ts'
import { IconvCharacterEncoding } from './IconvCharacterEncoding.ts'

const UNDEFINED_WINDOWS_1252_BYTES = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d])

export class Windows1252Encoding extends IconvCharacterEncoding {
  constructor() {
    super('windows-1252', 'Windows-1252', 'windows', 'windows-1252')
  }

  protected override validateDecodingInput(bytes: readonly number[]): void {
    const invalidIndex = bytes.findIndex((byte) => UNDEFINED_WINDOWS_1252_BYTES.has(byte))
    if (invalidIndex < 0) return

    throw new CharacterEncodingError(
      'INVALID_BYTE_SEQUENCE',
      `Windows-1252 byte ${toHex(bytes[invalidIndex])} at offset ${invalidIndex} is undefined.`,
      {
        encodingId: this.id,
        position: invalidIndex,
        fragment: [bytes[invalidIndex]]
      }
    )
  }
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase()
}
