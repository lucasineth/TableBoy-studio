import type { TableEntry } from '../../core/table/index.ts'
import {
  STRING_SCANNER_ENCODINGS,
  type StringScannerEncoding
} from '../../core/search/StringScannerTypes.ts'
import type { SearchStartRequest } from '../../shared/searchApi.ts'
import type {
  PortableRelativeSearchOptions,
  PortableSearchOptions,
  PortableTableSearchOptions,
  SearchRequest
} from './SearchProtocol.ts'
import { SearchIpcError } from './SearchIpcError.ts'

export const SEARCH_IPC_LIMITS = Object.freeze({
  documentIdLength: 128,
  jobIdLength: 128,
  queryLength: 4_096,
  characterSequenceLength: 4_096,
  relativeValues: 4_096,
  binaryPatternBytes: 64 * 1024,
  tableEntries: 65_536,
  tableKeyBytes: 32,
  tableValueLength: 1_024,
  tableCommentLength: 1_024,
  maxResults: 10_000,
  contextBytes: 4 * 1024,
  alignment: 4_096
})

export function readSearchStartRequest(value: unknown): {
  readonly documentId: string
  readonly request: unknown
} {
  assertPlainObject(value, 'Search start request must be a plain object.')
  const candidate = value as Partial<SearchStartRequest>
  return {
    documentId: assertIdentifier(candidate.documentId, 'documentId'),
    request: candidate.request
  }
}

export function assertSearchJobId(value: unknown): string {
  return assertIdentifier(value, 'jobId', SEARCH_IPC_LIMITS.jobIdLength)
}

export function sanitizeSearchRequest(value: unknown, documentSize: number): SearchRequest {
  assertPlainObject(value, 'Search request must be a plain object.')
  const type = (value as { type?: unknown }).type

  switch (type) {
    case 'strings':
      return sanitizeStringRequest(value, documentSize)
    case 'binary':
      return sanitizeBinaryRequest(value, documentSize)
    case 'table':
      return sanitizeTableRequest(value, documentSize)
    case 'relative':
      return sanitizeRelativeRequest(value, documentSize)
    default:
      throw invalid('Search request type must be binary, table, relative or strings.')
  }
}

function sanitizeStringRequest(
  value: Record<string, unknown>,
  documentSize: number
): SearchRequest {
  const common = sanitizeCommonOptions(value.options, documentSize)
  const options = (value.options ?? {}) as Record<string, unknown>
  const encoding = options.encoding ?? 'ascii'
  if (
    typeof encoding !== 'string' ||
    !STRING_SCANNER_ENCODINGS.includes(encoding as StringScannerEncoding)
  )
    throw invalid('Unsupported String Scanner encoding.')
  const minLength = optionalInteger(options.minLength, 'minLength', 1) ?? 4
  const maxLength = optionalInteger(options.maxLength, 'maxLength', 1)
  if (maxLength !== undefined && maxLength < minLength)
    throw invalid('Maximum length must be at least minimum length.')
  for (const key of ['includeSpaces', 'includeNumbers', 'includePunctuation']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean')
      throw invalid(`${key} must be a boolean.`)
  }
  return {
    type: 'strings',
    options: {
      ...common,
      encoding: encoding as StringScannerEncoding,
      minLength,
      maxLength,
      includeSpaces: options.includeSpaces as boolean | undefined,
      includeNumbers: options.includeNumbers as boolean | undefined,
      includePunctuation: options.includePunctuation as boolean | undefined
    }
  }
}

function sanitizeBinaryRequest(
  value: Record<string, unknown>,
  documentSize: number
): SearchRequest {
  const pattern = value.pattern
  if (!(pattern instanceof Uint8Array)) {
    throw invalid('Binary search pattern must be a Uint8Array.')
  }
  if (pattern.length > SEARCH_IPC_LIMITS.binaryPatternBytes) {
    throw limit(
      `Binary search pattern cannot exceed ${SEARCH_IPC_LIMITS.binaryPatternBytes} bytes.`
    )
  }
  return {
    type: 'binary',
    pattern: pattern.slice(),
    options: sanitizeCommonOptions(value.options, documentSize)
  }
}

function sanitizeTableRequest(value: Record<string, unknown>, documentSize: number): SearchRequest {
  const query = sanitizeQuery(value.query)
  if (!Array.isArray(value.entries)) throw invalid('Table entries must be an array.')
  if (value.entries.length > SEARCH_IPC_LIMITS.tableEntries) {
    throw limit(`Table search cannot exceed ${SEARCH_IPC_LIMITS.tableEntries} entries.`)
  }

  return {
    type: 'table',
    query,
    entries: value.entries.map(sanitizeTableEntry),
    options: sanitizeTableOptions(value.options, documentSize)
  }
}

function sanitizeRelativeRequest(
  value: Record<string, unknown>,
  documentSize: number
): SearchRequest {
  const inputMode = value.inputMode ?? 'text'
  if (inputMode !== 'text' && inputMode !== 'values') {
    throw invalid('Relative search inputMode must be text or values.')
  }
  const options = sanitizeRelativeOptions(value.options, documentSize, inputMode)
  if (inputMode === 'text') {
    return { type: 'relative', inputMode: 'text', query: sanitizeQuery(value.query), options }
  }

  if (!Array.isArray(value.values)) throw invalid('Value Scan values must be an array.')
  if (value.values.length > SEARCH_IPC_LIMITS.relativeValues) {
    throw limit(`Value Scan cannot exceed ${SEARCH_IPC_LIMITS.relativeValues} values.`)
  }
  const maximum = options.valueWidth === 2 ? 0xffff : 0xff
  const values = value.values.map((entry, index) => {
    if (!Number.isSafeInteger(entry) || entry < 0 || entry > maximum) {
      throw invalid(`Value Scan entry ${index} must be an integer between 0 and ${maximum}.`)
    }
    return entry
  })
  return { type: 'relative', inputMode: 'values', values, options }
}

function sanitizeTableEntry(value: unknown, index: number): TableEntry {
  assertPlainObject(value, `Table entry ${index} must be a plain object.`)
  if (!Array.isArray(value.key) || value.key.length === 0) {
    throw invalid(`Table entry ${index} must contain a non-empty byte key.`)
  }
  if (value.key.length > SEARCH_IPC_LIMITS.tableKeyBytes) {
    throw limit(`Table entry ${index} key cannot exceed ${SEARCH_IPC_LIMITS.tableKeyBytes} bytes.`)
  }
  const key = value.key.map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throw invalid(`Table entry ${index} contains an invalid byte.`)
    }
    return byte
  })
  if (typeof value.value !== 'string') {
    throw invalid(`Table entry ${index} value must be a string.`)
  }
  if (value.value.length > SEARCH_IPC_LIMITS.tableValueLength) {
    throw limit(
      `Table entry ${index} value cannot exceed ${SEARCH_IPC_LIMITS.tableValueLength} characters.`
    )
  }
  if (value.comment !== undefined && typeof value.comment !== 'string') {
    throw invalid(`Table entry ${index} comment must be a string.`)
  }
  if (
    typeof value.comment === 'string' &&
    value.comment.length > SEARCH_IPC_LIMITS.tableCommentLength
  ) {
    throw limit(
      `Table entry ${index} comment cannot exceed ${SEARCH_IPC_LIMITS.tableCommentLength} characters.`
    )
  }
  return value.comment === undefined
    ? { key, value: value.value }
    : { key, value: value.value, comment: value.comment as string }
}

function sanitizeQuery(value: unknown): string {
  if (typeof value !== 'string') throw invalid('Search query must be a string.')
  if (value.length > SEARCH_IPC_LIMITS.queryLength) {
    throw limit(`Search query cannot exceed ${SEARCH_IPC_LIMITS.queryLength} characters.`)
  }
  return value
}

function sanitizeCommonOptions(value: unknown, documentSize: number): PortableSearchOptions {
  if (value === undefined) return {}
  assertPlainObject(value, 'Search options must be a plain object.')

  const startOffset = optionalInteger(value.startOffset, 'startOffset', 0)
  const endOffset = optionalInteger(value.endOffset, 'endOffset', 0)
  const maxResults = optionalInteger(value.maxResults, 'maxResults', 1)
  const alignment = optionalInteger(value.alignment, 'alignment', 1)

  if (startOffset !== undefined && startOffset > documentSize) {
    throw invalid('startOffset is outside the document bounds.')
  }
  if (endOffset !== undefined && endOffset > documentSize) {
    throw invalid('endOffset is outside the document bounds.')
  }
  if ((endOffset ?? documentSize) < (startOffset ?? 0)) {
    throw invalid('endOffset must be greater than or equal to startOffset.')
  }
  if (maxResults !== undefined && maxResults > SEARCH_IPC_LIMITS.maxResults) {
    throw limit(`maxResults cannot exceed ${SEARCH_IPC_LIMITS.maxResults}.`)
  }
  if (alignment !== undefined && alignment > SEARCH_IPC_LIMITS.alignment) {
    throw limit(`alignment cannot exceed ${SEARCH_IPC_LIMITS.alignment}.`)
  }

  return { startOffset, endOffset, maxResults, alignment }
}

function sanitizeTableOptions(value: unknown, documentSize: number): PortableTableSearchOptions {
  const common = sanitizeCommonOptions(value, documentSize)
  if (value === undefined) return common
  const options = value as Record<string, unknown>
  const contextBytes = optionalInteger(options.contextBytes, 'contextBytes', 0)
  if (contextBytes !== undefined && contextBytes > SEARCH_IPC_LIMITS.contextBytes) {
    throw limit(`contextBytes cannot exceed ${SEARCH_IPC_LIMITS.contextBytes}.`)
  }
  return { ...common, contextBytes }
}

function sanitizeRelativeOptions(
  value: unknown,
  documentSize: number,
  inputMode: 'text' | 'values'
): PortableRelativeSearchOptions {
  const common = sanitizeCommonOptions(value, documentSize)
  if (value === undefined) return common
  const options = value as Record<string, unknown>
  const allowTwoSymbolQuery = options.allowTwoSymbolQuery
  if (allowTwoSymbolQuery !== undefined && typeof allowTwoSymbolQuery !== 'boolean') {
    throw invalid('allowTwoSymbolQuery must be a boolean.')
  }
  const wildcards = options.wildcards
  if (wildcards !== undefined && typeof wildcards !== 'boolean') {
    throw invalid('wildcards must be a boolean.')
  }
  const characterSequence = options.characterSequence
  if (characterSequence !== undefined && typeof characterSequence !== 'string') {
    throw invalid('characterSequence must be a string.')
  }
  if (
    typeof characterSequence === 'string' &&
    characterSequence.length > SEARCH_IPC_LIMITS.characterSequenceLength
  ) {
    throw limit(
      `characterSequence cannot exceed ${SEARCH_IPC_LIMITS.characterSequenceLength} characters.`
    )
  }
  if (inputMode === 'values' && (wildcards !== undefined || characterSequence !== undefined)) {
    throw invalid('Value Scan cannot use wildcard or character-sequence options.')
  }
  const valueWidth = options.valueWidth ?? 1
  if (valueWidth !== 1 && valueWidth !== 2) throw invalid('valueWidth must be 1 or 2.')

  if (valueWidth === 1) {
    if (options.byteOrder !== undefined) {
      throw invalid('byteOrder cannot be supplied for an 8-bit relative search.')
    }
    return {
      ...common,
      allowTwoSymbolQuery,
      wildcards,
      characterSequence,
      valueWidth: 1
    }
  }

  if (options.byteOrder !== 'little-endian' && options.byteOrder !== 'big-endian') {
    throw invalid('A 16-bit relative search requires an explicit byteOrder.')
  }
  return {
    ...common,
    allowTwoSymbolQuery,
    wildcards,
    characterSequence,
    valueWidth: 2,
    byteOrder: options.byteOrder
  }
}

function optionalInteger(value: unknown, name: string, minimum: number): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw invalid(`${name} must be an integer greater than or equal to ${minimum}.`)
  }
  return value as number
}

function assertIdentifier(
  value: unknown,
  name: string,
  maximum = SEARCH_IPC_LIMITS.documentIdLength
): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw invalid(`${name} must be a non-empty string no longer than ${maximum} characters.`)
  }
  return value
}

function assertPlainObject(
  value: unknown,
  message: string
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(message)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw invalid(message)
}

function invalid(message: string): SearchIpcError {
  return new SearchIpcError('INVALID_SEARCH_REQUEST', message)
}

function limit(message: string): SearchIpcError {
  return new SearchIpcError('SEARCH_IPC_LIMIT_EXCEEDED', message)
}
