import {
  addressFromKey,
  keyFromAddress,
  pageFromAddress,
  type TableAddress
} from './TableAddress.ts'
import type { TableEntry } from './TableEntry.ts'
import { keyLengthForMode, type TableMode } from './TableMode.ts'

export interface TableDocument {
  mode: TableMode
  entries: TableEntry[]
}

export type TableDocumentIssueCode = 'UNSUPPORTED_KEY_SIZE' | 'MIXED_KEY_WIDTHS'

export interface TableDocumentIssue {
  code: TableDocumentIssueCode
  message: string
  entryIndexes: number[]
}

export interface TableDocumentDetectionResult {
  document: TableDocument | null
  issues: TableDocumentIssue[]
}

export function createTableDocument(entries: readonly TableEntry[]): TableDocumentDetectionResult {
  if (entries.length === 0) {
    return { document: { mode: '8-bit', entries: [] }, issues: [] }
  }

  const unsupportedEntryIndexes = entries.flatMap((entry, index) =>
    entry.key.length === 1 || entry.key.length === 2 ? [] : [index]
  )

  if (unsupportedEntryIndexes.length > 0) {
    return {
      document: null,
      issues: [
        {
          code: 'UNSUPPORTED_KEY_SIZE',
          message: 'The 8-bit/16-bit editor accepts only keys containing exactly one or two bytes.',
          entryIndexes: unsupportedEntryIndexes
        }
      ]
    }
  }

  const keyLengths = new Set(entries.map((entry) => entry.key.length))
  if (keyLengths.size > 1) {
    return {
      document: null,
      issues: [
        {
          code: 'MIXED_KEY_WIDTHS',
          message: 'A table cannot mix 8-bit and 16-bit keys in the same document.',
          entryIndexes: entries.map((_, index) => index)
        }
      ]
    }
  }

  const mode: TableMode = entries[0].key.length === 1 ? '8-bit' : '16-bit'
  return {
    document: { mode, entries: cloneTableEntries(entries) },
    issues: []
  }
}

export function createTableEntryMap(
  entries: readonly TableEntry[],
  mode: TableMode
): Map<TableAddress, TableEntry> {
  const entryMap = new Map<TableAddress, TableEntry>()
  const expectedLength = keyLengthForMode(mode)

  entries.forEach((entry) => {
    if (entry.key.length !== expectedLength) return

    try {
      entryMap.set(addressFromKey(entry.key, mode), entry)
    } catch {
      // Invalid entries remain the validator's responsibility.
    }
  })

  return entryMap
}

export function setTableValue(
  entries: readonly TableEntry[],
  address: TableAddress,
  value: string,
  mode: TableMode
): TableEntry[] {
  const key = keyFromAddress(address, mode)
  const entryIndex = entries.findIndex(
    (entry) =>
      entry.key.length === key.length && entry.key.every((byte, index) => byte === key[index])
  )

  if (value.length === 0) {
    return entryIndex < 0 ? [...entries] : entries.filter((_, index) => index !== entryIndex)
  }

  if (entryIndex >= 0) {
    return entries.map((entry, index) => (index === entryIndex ? { ...entry, value } : entry))
  }

  return [...entries, { key, value }]
}

export function pagesInDocument(document: TableDocument): number[] {
  if (document.mode === '8-bit') return [0]

  return [
    ...new Set(
      document.entries
        .filter((entry) => entry.key.length === 2)
        .map((entry) => pageFromAddress(addressFromKey(entry.key, document.mode), document.mode))
    )
  ].sort((left, right) => left - right)
}

export function cloneTableEntries(entries: readonly TableEntry[]): TableEntry[] {
  return entries.map((entry) => ({ ...entry, key: [...entry.key] }))
}
