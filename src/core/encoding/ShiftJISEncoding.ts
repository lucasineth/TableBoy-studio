import { CharacterEncodingError } from './EncodingError.ts'
import { IconvCharacterEncoding } from './IconvCharacterEncoding.ts'

export class ShiftJISEncoding extends IconvCharacterEncoding {
  constructor() {
    super('shift-jis', 'Shift-JIS', 'japanese', 'shift_jis')
  }

  protected override validateDecodingInput(bytes: readonly number[]): void {
    let offset = 0
    while (offset < bytes.length) {
      const firstByte = bytes[offset]
      if (isSingleByte(firstByte)) {
        offset += 1
        continue
      }

      if (!isLeadByte(firstByte)) this.throwInvalid(bytes, offset)
      if (offset + 1 >= bytes.length) {
        throw new CharacterEncodingError(
          'INCOMPLETE_BYTE_SEQUENCE',
          `Shift-JIS lead byte at offset ${offset} is missing its trailing byte.`,
          { encodingId: this.id, position: offset, fragment: [firstByte] }
        )
      }

      const secondByte = bytes[offset + 1]
      if (!isTrailByte(secondByte)) this.throwInvalid(bytes, offset)

      const pair = bytes.slice(offset, offset + 2)
      if (this.decodeUnchecked(pair).includes('\uFFFD')) this.throwInvalid(bytes, offset)
      offset += 2
    }
  }

  private throwInvalid(bytes: readonly number[], offset: number): never {
    throw new CharacterEncodingError(
      'INVALID_BYTE_SEQUENCE',
      `Invalid Shift-JIS byte sequence at offset ${offset}.`,
      { encodingId: this.id, position: offset, fragment: bytes.slice(offset, offset + 2) }
    )
  }
}

function isSingleByte(byte: number): boolean {
  return byte <= 0x7f || (byte >= 0xa1 && byte <= 0xdf)
}

function isLeadByte(byte: number): boolean {
  return (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xfc)
}

function isTrailByte(byte: number): boolean {
  return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfc)
}
