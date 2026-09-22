import { assertTableAddress } from '../table/TableAddress.ts'
import { createTableEntryMap, setTableValue } from '../table/TableDocument.ts'
import type { TableEntry } from '../table/TableEntry.ts'
import { maxAddressForMode, type TableMode } from '../table/TableMode.ts'
import type { CharacterOption } from './CharacterCategory.ts'

export interface AppliedCharacterSequence {
  ok: true
  entries: TableEntry[]
  startAddress: number
  endAddress: number
  overwrittenAddresses: number[]
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
  startAddress: number,
  characters: readonly CharacterOption[],
  mode: TableMode = '8-bit'
): ApplyCharacterSequenceResult {
  assertTableAddress(startAddress, mode)

  const availableCells = maxAddressForMode(mode) - startAddress + 1
  if (characters.length > availableCells) {
    return {
      ok: false,
      reason: 'OVERFLOW',
      availableCells,
      requiredCells: characters.length
    }
  }

  const entryMap = createTableEntryMap(table, mode)
  const overwrittenAddresses: number[] = []
  let entries = [...table]

  characters.forEach((character, index) => {
    const targetAddress = startAddress + index
    if (entryMap.has(targetAddress)) overwrittenAddresses.push(targetAddress)
    entries = setTableValue(entries, targetAddress, character.value, mode)
  })

  return {
    ok: true,
    entries,
    startAddress,
    endAddress: startAddress + Math.max(0, characters.length - 1),
    overwrittenAddresses
  }
}
