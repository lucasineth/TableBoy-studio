import type { TableEntry } from '../table/TableEntry.ts'
import { TableValidator } from '../table/TableValidator.ts'
import { TableCodecError } from './CodecError.ts'

export function createEncoderIndex(
  entries: readonly TableEntry[]
): ReadonlyMap<string, readonly TableEntry[]> {
  validateTable(entries)
  assertUniqueValues(entries)

  const index = new Map<string, TableEntry[]>()
  entries.forEach((entry) => {
    const firstCodeUnit = entry.value[0]
    const candidates = index.get(firstCodeUnit) ?? []
    candidates.push(entry)
    index.set(firstCodeUnit, candidates)
  })

  index.forEach((candidates) => {
    candidates.sort((left, right) => right.value.length - left.value.length)
  })
  return index
}

export function createDecoderIndex(
  entries: readonly TableEntry[]
): ReadonlyMap<number, readonly TableEntry[]> {
  validateTable(entries)

  const index = new Map<number, TableEntry[]>()
  entries.forEach((entry) => {
    const firstByte = entry.key[0]
    const candidates = index.get(firstByte) ?? []
    candidates.push(entry)
    index.set(firstByte, candidates)
  })

  index.forEach((candidates) => {
    candidates.sort((left, right) => right.key.length - left.key.length)
  })
  return index
}

function validateTable(entries: readonly TableEntry[]): void {
  const validation = new TableValidator().validate(entries)
  if (validation.valid) return

  const entryIndexes = new Set<number>()
  validation.issues.forEach((issue) => {
    entryIndexes.add(issue.entryIndex)
    if (issue.duplicateOfIndex !== undefined) entryIndexes.add(issue.duplicateOfIndex)
  })

  throw new TableCodecError(
    'INVALID_TABLE',
    validation.issues.map((issue) => issue.message).join(' '),
    { entryIndexes: [...entryIndexes].sort((left, right) => left - right) }
  )
}

function assertUniqueValues(entries: readonly TableEntry[]): void {
  const firstIndexByValue = new Map<string, number>()

  entries.forEach((entry, entryIndex) => {
    const previousIndex = firstIndexByValue.get(entry.value)
    if (previousIndex === undefined) {
      firstIndexByValue.set(entry.value, entryIndex)
      return
    }

    throw new TableCodecError(
      'AMBIGUOUS_VALUE',
      `Text value ${JSON.stringify(entry.value)} is assigned to more than one byte sequence.`,
      { entryIndexes: [previousIndex, entryIndex] }
    )
  })
}
