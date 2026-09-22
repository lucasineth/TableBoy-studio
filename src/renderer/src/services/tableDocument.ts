import {
  createTableDocument,
  TableParser,
  TableValidator,
  TableWriter,
  type TableDocument,
  type TableEntry,
  type TableParseError,
  type TableValidationResult
} from '../../../core/table/index.ts'

const SAMPLE_TABLE = ['41=A', '42=B', '43=C', 'F1=Ã', 'F2=Õ', 'F4=ã', 'F5=õ'].join('\n')

const parser = new TableParser()
const writer = new TableWriter()
const validator = new TableValidator()

export interface ParsedTableDocumentResult {
  document: TableDocument | null
  errors: TableDocumentError[]
}

export interface TableDocumentError {
  line?: number
  content?: string
  message: string
}

export function createSampleDocument(): TableDocument {
  const entries = parser.parse(SAMPLE_TABLE).entries
  return { mode: '8-bit', entries: cloneEntries(entries) }
}

export function parseTableDocument(source: string): ParsedTableDocumentResult {
  const parsed = parser.parse(source)
  const errors: TableDocumentError[] = parsed.errors.map(toDocumentError)
  if (errors.length > 0) return { document: null, errors }

  const detection = createTableDocument(parsed.entries)
  errors.push(...detection.issues.map((issue) => ({ message: issue.message })))
  return { document: detection.document, errors }
}

export function validateTableDocument(entries: readonly TableEntry[]): TableValidationResult {
  return validator.validate(entries)
}

export function serializeTableDocument(document: TableDocument): string {
  return writer.writeDocument(document)
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
