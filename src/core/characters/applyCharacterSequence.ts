import { assertTableAddress } from '../table/TableAddress.ts'
import { createTableEntryMap, setTableValue } from '../table/TableDocument.ts'
import type { TableEntry } from '../table/TableEntry.ts'
import { maxAddressForMode, type TableMode } from '../table/TableMode.ts'
import type { CharacterOption } from './CharacterCategory.ts'

export type ApplyCharacterSequenceResult =
  | {
      ok: true
      entries: TableEntry[]
      startAddress: number
      endAddress: number
      overwrittenAddresses: number[]
    }
  | { ok: false; availableCells: number; requiredCells: number }

export function applyCharacterSequence(
  table: readonly TableEntry[],
  startAddress: number,
  characters: readonly CharacterOption[],
  mode: TableMode = '8-bit'
): ApplyCharacterSequenceResult {
  assertTableAddress(startAddress, mode)
  const availableCells = maxAddressForMode(mode) - startAddress + 1
  if (characters.length > availableCells) {
    return { ok: false, availableCells, requiredCells: characters.length }
  }

  const entryMap = createTableEntryMap(table, mode)
  const overwrittenAddresses: number[] = []
  let entries = [...table]
  characters.forEach((character, index) => {
    const address = startAddress + index
    if (entryMap.has(address)) overwrittenAddresses.push(address)
    entries = setTableValue(entries, address, character.value, mode)
  })
  return {
    ok: true,
    entries,
    startAddress,
    endAddress: startAddress + Math.max(0, characters.length - 1),
    overwrittenAddresses
  }
}
