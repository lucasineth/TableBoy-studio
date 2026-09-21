import type { TableEntry } from './TableEntry.ts'
import { TableValidator, type TableValidationCode } from './TableValidator.ts'

export type TableParseErrorCode =
  'MISSING_SEPARATOR' | 'INVALID_HEX_KEY' | 'ODD_LENGTH_KEY' | TableValidationCode

export interface TableParseError {
  code: TableParseErrorCode
  message: string
  line: number
  content: string
  duplicateOfLine?: number
}

export interface TableParseResult {
  entries: TableEntry[]
  errors: TableParseError[]
}

interface ParsedValue {
  value: string
  comment?: string
}

const COMMENT_LINE_PATTERN = /^(?:#|;|\/\/)/
const INLINE_COMMENT_PATTERN = /\s+(?:#|;|\/\/)(.*)$/

export class TableParser {
  private readonly validator = new TableValidator()

  parse(source: string): TableParseResult {
    const entries: TableEntry[] = []
    const errors: TableParseError[] = []
    const sourceLineByEntryIndex: number[] = []

    source.split(/\r?\n/).forEach((content, lineIndex) => {
      const line = lineIndex + 1
      const trimmedLine = content.trim()

      if (trimmedLine.length === 0 || COMMENT_LINE_PATTERN.test(trimmedLine)) return

      const separatorIndex = content.indexOf('=')
      if (separatorIndex < 0) {
        errors.push({
          code: 'MISSING_SEPARATOR',
          message: 'Table entry must contain an equals sign.',
          line,
          content
        })
        return
      }

      const rawKey = content.slice(0, separatorIndex).trim()
      const parsedKey = this.parseKey(rawKey, line, content)

      if ('error' in parsedKey) {
        errors.push(parsedKey.error)
        return
      }

      const { value, comment } = this.parseValue(content.slice(separatorIndex + 1))
      const entry: TableEntry = { key: parsedKey.key, value }
      if (comment !== undefined) entry.comment = comment

      entries.push(entry)
      sourceLineByEntryIndex.push(line)
    })

    const validation = this.validator.validate(entries)
    validation.issues.forEach((issue) => {
      const entryIndex = issue.entryIndex
      const error: TableParseError = {
        code: issue.code,
        message: issue.message,
        line: sourceLineByEntryIndex[entryIndex],
        content: source.split(/\r?\n/)[sourceLineByEntryIndex[entryIndex] - 1]
      }

      if (issue.duplicateOfIndex !== undefined) {
        error.duplicateOfLine = sourceLineByEntryIndex[issue.duplicateOfIndex]
      }

      errors.push(error)
    })

    return { entries, errors }
  }

  private parseKey(
    rawKey: string,
    line: number,
    content: string
  ): { key: number[] } | { error: TableParseError } {
    if (!/^[0-9a-f]+$/i.test(rawKey)) {
      return {
        error: {
          code: 'INVALID_HEX_KEY',
          message: 'Table key must contain only hexadecimal digits.',
          line,
          content
        }
      }
    }

    if (rawKey.length % 2 !== 0) {
      return {
        error: {
          code: 'ODD_LENGTH_KEY',
          message: 'Table key must contain a whole number of bytes.',
          line,
          content
        }
      }
    }

    const key: number[] = []
    for (let index = 0; index < rawKey.length; index += 2) {
      key.push(Number.parseInt(rawKey.slice(index, index + 2), 16))
    }

    return { key }
  }

  private parseValue(rawValue: string): ParsedValue {
    const commentMatch = INLINE_COMMENT_PATTERN.exec(rawValue)
    if (!commentMatch || commentMatch.index === undefined) return { value: rawValue }

    return {
      value: rawValue.slice(0, commentMatch.index),
      comment: commentMatch[1].trim()
    }
  }
}
