import type { TableEntry } from './TableEntry.ts'
import {
  TableValidator,
  type TableValidationIssue,
  type TableValidationResult
} from './TableValidator.ts'

export class TableValidationError extends Error {
  readonly issues: TableValidationIssue[]

  constructor(result: TableValidationResult) {
    super('Cannot serialize an invalid table.')
    this.name = 'TableValidationError'
    this.issues = result.issues
  }
}

export class TableWriter {
  private readonly validator = new TableValidator()

  write(entries: readonly TableEntry[]): string {
    const validation = this.validator.validate(entries)
    if (!validation.valid) throw new TableValidationError(validation)

    return entries
      .map((entry) => {
        const mapping = `${this.validator.keyToHex(entry.key)}=${entry.value}`
        return entry.comment === undefined ? mapping : `${mapping} # ${entry.comment}`
      })
      .join('\n')
  }
}
