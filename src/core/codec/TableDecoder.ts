import type { TableEntry } from '../table/TableEntry.ts'
import { TableCodecError } from './CodecError.ts'
import { createDecoderIndex } from './TableCodecIndex.ts'

const ERROR_FRAGMENT_BYTES = 8

export class TableDecoder {
  decode(input: Uint8Array | readonly number[], entries: readonly TableEntry[]): string {
    const bytes = validatedBytes(input)
    if (bytes.length === 0) return ''
    if (entries.length === 0) {
      throw new TableCodecError('EMPTY_TABLE', 'Cannot decode bytes with an empty table.', {
        position: 0,
        fragment: bytes.slice(0, ERROR_FRAGMENT_BYTES)
      })
    }

    const index = createDecoderIndex(entries)
    let decoded = ''
    let offset = 0

    while (offset < bytes.length) {
      const candidates = index.get(bytes[offset]) ?? []
      const match = candidates.find((entry) => matchesKey(bytes, offset, entry.key))

      if (match) {
        decoded += match.value
        offset += match.key.length
        continue
      }

      const remaining = bytes.slice(offset)
      if (candidates.some((entry) => isIncompletePrefix(remaining, entry.key))) {
        throw new TableCodecError(
          'INCOMPLETE_SEQUENCE',
          `Byte sequence at offset ${offset} ends before a complete table key.`,
          { position: offset, fragment: remaining }
        )
      }

      const fragment = bytes.slice(offset, offset + ERROR_FRAGMENT_BYTES)
      throw new TableCodecError(
        'UNKNOWN_BYTE',
        `No table entry matches the byte at offset ${offset}: ${toHex(bytes[offset])}.`,
        { position: offset, fragment }
      )
    }

    return decoded
  }
}

function validatedBytes(input: Uint8Array | readonly number[]): number[] {
  const bytes = Array.from(input)
  const invalidIndex = bytes.findIndex((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)

  if (invalidIndex >= 0) {
    throw new TableCodecError(
      'INVALID_INPUT_BYTE',
      `Input byte at offset ${invalidIndex} must be an integer between 0 and 255.`,
      { position: invalidIndex, fragment: [bytes[invalidIndex]] }
    )
  }

  return bytes
}

function matchesKey(bytes: readonly number[], offset: number, key: readonly number[]): boolean {
  if (key.length > bytes.length - offset) return false
  return key.every((byte, index) => bytes[offset + index] === byte)
}

function isIncompletePrefix(remaining: readonly number[], key: readonly number[]): boolean {
  return key.length > remaining.length && remaining.every((byte, index) => key[index] === byte)
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase()
}
