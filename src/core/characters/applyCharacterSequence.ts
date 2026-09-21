import {
  MAX_8_BIT_VALUE,
  assertByte,
  createEightBitEntryMap,
  setEightBitValue
} from '../table/EightBitTable.ts'
import type { TableEntry } from '../table/TableEntry.ts'
import type { CharacterOption } from './CharacterCategory.ts'

export interface AppliedCharacterSequence {
  ok: true
  entries: TableEntry[]
  startByte: number
  endByte: number
  overwrittenBytes: number[]
}

export interface CharacterSequenceOverflow {
  ok: false
  reason: 'OVERFLOW'
  availableCells: number
  requiredCells: number
}

export type ApplyCharacterSequenceResult = AppliedCharacterSequence | CharacterSequenceOverflow

export function applyCharacterSequence(
  table: readonly TableEntry[],
  startByte: number,
  characters: readonly CharacterOption[]
): ApplyCharacterSequenceResult {
  assertByte(startByte)

  const availableCells = MAX_8_BIT_VALUE - startByte + 1
  if (characters.length > availableCells) {
    return {
      ok: false,
      reason: 'OVERFLOW',
      availableCells,
      requiredCells: characters.length
    }
  }

  const entryMap = createEightBitEntryMap(table)
  const overwrittenBytes: number[] = []
  let entries = [...table]

  characters.forEach((character, index) => {
    const targetByte = startByte + index
    if (entryMap.has(targetByte)) overwrittenBytes.push(targetByte)
    entries = setEightBitValue(entries, targetByte, character.value)
  })

  return {
    ok: true,
    entries,
    startByte,
    endByte: startByte + Math.max(0, characters.length - 1),
    overwrittenBytes
  }
}
