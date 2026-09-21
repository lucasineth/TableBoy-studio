import type { TableEntry } from './TableEntry.ts'

export type TableValidationCode = 'EMPTY_KEY' | 'INVALID_BYTE' | 'EMPTY_VALUE' | 'DUPLICATE_KEY'

export interface TableValidationIssue {
  code: TableValidationCode
  message: string
  entryIndex: number
  duplicateOfIndex?: number
}

export interface TableValidationResult {
  valid: boolean
  issues: TableValidationIssue[]
}

export class TableValidator {
  validate(entries: readonly TableEntry[]): TableValidationResult {
    const issues: TableValidationIssue[] = []
    const firstIndexByKey = new Map<string, number>()

    entries.forEach((entry, entryIndex) => {
      issues.push(...this.validateEntry(entry, entryIndex))

      if (!this.hasValidKey(entry)) return

      const key = this.keyIdentity(entry.key)
      const duplicateOfIndex = firstIndexByKey.get(key)

      if (duplicateOfIndex === undefined) {
        firstIndexByKey.set(key, entryIndex)
        return
      }

      issues.push({
        code: 'DUPLICATE_KEY',
        message: `Duplicate key ${this.keyToHex(entry.key)}.`,
        entryIndex,
        duplicateOfIndex
      })
    })

    return { valid: issues.length === 0, issues }
  }

  validateEntry(entry: TableEntry, entryIndex = 0): TableValidationIssue[] {
    const issues: TableValidationIssue[] = []

    if (entry.key.length === 0) {
      issues.push({
        code: 'EMPTY_KEY',
        message: 'A table entry must contain at least one key byte.',
        entryIndex
      })
    }

    entry.key.forEach((byte, byteIndex) => {
      if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
        issues.push({
          code: 'INVALID_BYTE',
          message: `Key byte at index ${byteIndex} must be an integer between 0 and 255.`,
          entryIndex
        })
      }
    })

    if (entry.value.length === 0) {
      issues.push({
        code: 'EMPTY_VALUE',
        message: 'A table entry value cannot be empty.',
        entryIndex
      })
    }

    return issues
  }

  keyToHex(key: readonly number[]): string {
    return key
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }

  private hasValidKey(entry: TableEntry): boolean {
    return (
      entry.key.length > 0 &&
      entry.key.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 0xff)
    )
  }

  private keyIdentity(key: readonly number[]): string {
    return key.join(',')
  }
}
