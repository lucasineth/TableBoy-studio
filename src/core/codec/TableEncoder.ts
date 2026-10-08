import type { TableEntry } from '../table/TableEntry.ts'
import { TableCodecError } from './CodecError.ts'
import { createEncoderIndex } from './TableCodecIndex.ts'

const ERROR_FRAGMENT_CODE_POINTS = 8

export class TableEncoder {
  encode(text: string, entries: readonly TableEntry[]): Uint8Array {
    if (text.length === 0) return new Uint8Array()
    if (entries.length === 0) {
      throw new TableCodecError('EMPTY_TABLE', 'Cannot encode text with an empty table.', {
        position: 0,
        fragment: textFragment(text, 0)
      })
    }

    const index = createEncoderIndex(entries)
    const encoded: number[] = []
    let codeUnitOffset = 0

    while (codeUnitOffset < text.length) {
      const candidates = index.get(text[codeUnitOffset]) ?? []
      const match = candidates.find((entry) => text.startsWith(entry.value, codeUnitOffset))

      if (!match) {
        const position = codePointPosition(text, codeUnitOffset)
        const fragment = textFragment(text, codeUnitOffset)
        throw new TableCodecError(
          'UNMAPPED_TEXT',
          `No table entry represents the text at position ${position}: ${JSON.stringify(fragment)}.`,
          { position, fragment }
        )
      }

      encoded.push(...match.key)
      codeUnitOffset += match.value.length
    }

    return Uint8Array.from(encoded)
  }
}

function codePointPosition(text: string, codeUnitOffset: number): number {
  return Array.from(text.slice(0, codeUnitOffset)).length
}

function textFragment(text: string, codeUnitOffset: number): string {
  return Array.from(text.slice(codeUnitOffset)).slice(0, ERROR_FRAGMENT_CODE_POINTS).join('')
}
