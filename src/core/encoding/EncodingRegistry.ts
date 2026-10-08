import type { CharacterEncoding } from './CharacterEncoding.ts'
import { CP437Encoding } from './CP437Encoding.ts'
import { CP850Encoding } from './CP850Encoding.ts'
import { CharacterEncodingError } from './EncodingError.ts'
import { ShiftJISEncoding } from './ShiftJISEncoding.ts'
import { Windows1252Encoding } from './Windows1252Encoding.ts'

export const windows1252 = new Windows1252Encoding()
export const cp437 = new CP437Encoding()
export const cp850 = new CP850Encoding()
export const shiftJis = new ShiftJISEncoding()

export const characterEncodings: readonly CharacterEncoding[] = [
  windows1252,
  cp437,
  cp850,
  shiftJis
]

const encodingById = new Map<string, CharacterEncoding>(
  characterEncodings.map((encoding) => [encoding.id, encoding])
)

export function getCharacterEncoding(id: string): CharacterEncoding {
  const normalizedId = id.trim().toLowerCase()
  const encoding = encodingById.get(normalizedId)
  if (encoding) return encoding

  const reason =
    normalizedId === 'ansi'
      ? 'ANSI does not identify a single encoding. Select an explicit code page such as Windows-1252.'
      : `Unknown character encoding: ${JSON.stringify(id)}.`
  throw new CharacterEncodingError('UNKNOWN_ENCODING', reason, { encodingId: id })
}
