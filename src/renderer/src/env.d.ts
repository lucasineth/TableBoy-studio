import type { BinaryDocumentApi } from '../../shared/binaryDocumentApi.ts'
import type { TableFileApi } from '../../shared/tableFileApi.ts'
import type { SearchApi } from '../../shared/searchApi.ts'

declare global {
  interface Window {
    tableFiles?: TableFileApi
    binaryDocuments?: BinaryDocumentApi
    searchAPI?: SearchApi
  }
}

export {}
