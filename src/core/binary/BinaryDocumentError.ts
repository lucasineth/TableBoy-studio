export type BinaryDocumentErrorCode =
  'INVALID_OFFSET' | 'INVALID_RANGE' | 'DOCUMENT_CLOSED' | 'INVALID_LENGTH'

export class BinaryDocumentError extends Error {
  readonly code: BinaryDocumentErrorCode

  constructor(code: BinaryDocumentErrorCode, message: string) {
    super(message)
    this.name = 'BinaryDocumentError'
    this.code = code
  }
}
