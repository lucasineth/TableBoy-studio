import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'

import {
  BINARY_DOCUMENT_CHANNELS,
  type BinaryReadRangeRequest
} from '../../shared/binaryDocumentApi.ts'
import { loadBinaryDocument } from './binaryFileService.ts'
import { BinaryDocumentRegistry } from './BinaryDocumentRegistry.ts'
import { assertIpcReadRangeLength } from './binaryIpcPolicy.ts'

export const binaryDocumentRegistry = new BinaryDocumentRegistry()

const BINARY_FILE_FILTERS = [
  { name: 'ROM and binary files', extensions: ['gb', 'gbc', 'gba', 'nds', 'bin', 'rom'] },
  { name: 'All files', extensions: ['*'] }
]

export function registerBinaryDocumentIpc(
  registry: BinaryDocumentRegistry = binaryDocumentRegistry
): void {
  ipcMain.handle(BINARY_DOCUMENT_CHANNELS.open, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) throw new Error('Binary documents require an owning window.')
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: BINARY_FILE_FILTERS
    }
    const result = await dialog.showOpenDialog(owner, options)

    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    const loaded = await loadBinaryDocument(result.filePaths[0])
    try {
      const document = registry.register(event.sender.id, loaded.name, loaded.document)
      return { canceled: false, document }
    } catch (error) {
      loaded.document.close()
      throw error
    }
  })

  ipcMain.handle(BINARY_DOCUMENT_CHANNELS.close, (event, documentId: unknown) => {
    assertDocumentId(documentId)
    return registry.close(event.sender.id, documentId)
  })

  ipcMain.handle(BINARY_DOCUMENT_CHANNELS.readRange, (event, request: unknown) => {
    assertReadRangeRequest(request)
    assertIpcReadRangeLength(request.length)
    return registry
      .getDocument(event.sender.id, request.documentId)
      .readRange(request.offset, request.length)
  })
}

function assertDocumentId(documentId: unknown): asserts documentId is string {
  if (typeof documentId !== 'string' || documentId.length === 0) {
    throw new TypeError('Invalid binary document ID.')
  }
}

function assertReadRangeRequest(request: unknown): asserts request is BinaryReadRangeRequest {
  if (!request || typeof request !== 'object') {
    throw new TypeError('Invalid binary range request.')
  }

  const candidate = request as Partial<BinaryReadRangeRequest>
  assertDocumentId(candidate.documentId)
  if (!Number.isSafeInteger(candidate.offset) || !Number.isSafeInteger(candidate.length)) {
    throw new TypeError('Binary range offset and length must be integers.')
  }
}
