import {
  TableParser,
  TableValidator,
  TableWriter,
  type TableEntry,
  type TableParseError,
  type TableValidationResult
} from '../../../core/table/index.ts'

const SAMPLE_TABLE = ['41=A', '42=B', '43=C', 'F1=Ã', 'F2=Õ', 'F4=ã', 'F5=õ'].join('\n')

const parser = new TableParser()
const writer = new TableWriter()
const validator = new TableValidator()

export interface TableDocumentResult {
  entries: TableEntry[]
  errors: TableDocumentError[]
}

export interface TableDocumentError {
  line?: number
  content?: string
  message: string
}

export function createSampleTable(): TableEntry[] {
  return cloneEntries(parser.parse(SAMPLE_TABLE).entries)
}

export function parseEightBitDocument(source: string): TableDocumentResult {
  const parsed = parser.parse(source)
  const errors: TableDocumentError[] = parsed.errors.map(toDocumentError)
  const unsupportedEntries = parsed.entries.filter((entry) => entry.key.length !== 1)

  if (unsupportedEntries.length > 0) {
    errors.push({
      message: `${unsupportedEntries.length} variable-width entr${unsupportedEntries.length === 1 ? 'y is' : 'ies are'} not supported in 8-bit mode.`
    })
  }

  return {
    entries: cloneEntries(parsed.entries.filter((entry) => entry.key.length === 1)),
    errors
  }
}

export function validateTableDocument(entries: readonly TableEntry[]): TableValidationResult {
  return validator.validate(entries)
}

export function serializeTableDocument(entries: readonly TableEntry[]): string {
  return writer.write(entries)
}

export function formatTableDocumentErrors(errors: readonly TableDocumentError[]): string {
  return errors
    .map((error) => {
      const location = error.line === undefined ? '' : `Line ${error.line}: `
      const content = error.content === undefined ? '' : `\n  ${error.content}`
      return `${location}${error.message}${content}`
    })
    .join('\n')
}

function cloneEntries(entries: readonly TableEntry[]): TableEntry[] {
  return entries.map((entry) => ({ ...entry, key: [...entry.key] }))
}

function toDocumentError(error: TableParseError): TableDocumentError {
  return { line: error.line, content: error.content, message: error.message }
}
