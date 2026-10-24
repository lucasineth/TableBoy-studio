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

function toDocumentError(error: TableParseError): TableDocumentError {
  return { line: error.line, content: error.content, message: error.message }
}
