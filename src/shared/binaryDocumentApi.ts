export const BINARY_DOCUMENT_CHANNELS = {
  open: 'binary:open',
  close: 'binary:close',
  readRange: 'binary:read-range'
} as const

export interface BinaryDocumentMetadata {
  id: string
  name: string
  size: number
}

export interface CanceledBinaryDocumentOpen {
  canceled: true
}

export interface OpenedBinaryDocument {
  canceled: false
  document: BinaryDocumentMetadata
}

export type OpenBinaryDocumentResult = CanceledBinaryDocumentOpen | OpenedBinaryDocument

export interface BinaryReadRangeRequest {
  documentId: string
  offset: number
  length: number
}

export interface BinaryDocumentApi {
  open(): Promise<OpenBinaryDocumentResult>
  close(documentId: string): Promise<boolean>
  readRange(request: BinaryReadRangeRequest): Promise<Uint8Array>
}
