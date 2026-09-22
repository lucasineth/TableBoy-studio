export type { TableEntry } from './TableEntry.ts'
export {
  addressFromKey,
  addressFromPagePosition,
  assertTableAddress,
  assertTablePage,
  formatTableAddress,
  HEX_MATRIX_SIZE,
  keyFromAddress,
  MAX_TABLE_PAGE,
  MIN_TABLE_ADDRESS,
  pageFromAddress,
  positionFromAddress,
  type HexPosition,
  type TableAddress
} from './TableAddress.ts'
export {
  cloneTableEntries,
  createTableDocument,
  createTableEntryMap,
  pagesInDocument,
  setTableValue,
  type TableDocument,
  type TableDocumentDetectionResult,
  type TableDocumentIssue,
  type TableDocumentIssueCode
} from './TableDocument.ts'
export {
  addressCountForMode,
  keyLengthForMode,
  maxAddressForMode,
  TABLE_MODES,
  type TableMode
} from './TableMode.ts'
export {
  assertByte,
  byteFromPosition,
  createEightBitEntryMap,
  MAX_8_BIT_VALUE,
  MIN_8_BIT_VALUE,
  positionFromByte,
  setEightBitValue,
  toByteHex
} from './EightBitTable.ts'
export {
  TableParser,
  type TableParseError,
  type TableParseErrorCode,
  type TableParseResult
} from './TableParser.ts'
export { TableValidationError, TableWriter } from './TableWriter.ts'
export {
  TableValidator,
  type TableValidationCode,
  type TableValidationIssue,
  type TableValidationResult
} from './TableValidator.ts'
