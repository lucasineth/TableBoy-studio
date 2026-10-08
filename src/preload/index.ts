import { contextBridge, ipcRenderer, webUtils } from 'electron'

import { BINARY_DOCUMENT_CHANNELS, type BinaryDocumentApi } from '../shared/binaryDocumentApi.ts'
import { TABLE_FILE_CHANNELS, type TableFileApi } from '../shared/tableFileApi.ts'
import { createSearchApi } from './searchApi.ts'

const binaryDocuments: BinaryDocumentApi = {
  open: () => ipcRenderer.invoke(BINARY_DOCUMENT_CHANNELS.open),
  close: (documentId) => ipcRenderer.invoke(BINARY_DOCUMENT_CHANNELS.close, documentId),
  readRange: (request) => ipcRenderer.invoke(BINARY_DOCUMENT_CHANNELS.readRange, request)
}

const tableFiles: TableFileApi = {
  open: () => ipcRenderer.invoke(TABLE_FILE_CHANNELS.open),
  openDroppedFile: (file) =>
    ipcRenderer.invoke(TABLE_FILE_CHANNELS.openPath, webUtils.getPathForFile(file)),
  save: (request) => ipcRenderer.invoke(TABLE_FILE_CHANNELS.save, request),
  saveAs: (request) => ipcRenderer.invoke(TABLE_FILE_CHANNELS.saveAs, request),
  confirmUnsavedChanges: (fileName) =>
    ipcRenderer.invoke(TABLE_FILE_CHANNELS.confirmUnsaved, fileName),
  setDocumentState: (state) => ipcRenderer.send(TABLE_FILE_CHANNELS.documentState, state),
  onSaveBeforeClose: (listener) => {
    const wrappedListener = (): void => listener()
    ipcRenderer.on(TABLE_FILE_CHANNELS.saveBeforeClose, wrappedListener)
    return () => ipcRenderer.removeListener(TABLE_FILE_CHANNELS.saveBeforeClose, wrappedListener)
  },
  completeCloseSave: (saved) => ipcRenderer.send(TABLE_FILE_CHANNELS.closeSaveCompleted, saved)
}

const searchAPI = createSearchApi(ipcRenderer)

if (!process.contextIsolated) {
  throw new Error('TableBoy Studio requires Electron context isolation.')
}

contextBridge.exposeInMainWorld('tableFiles', Object.freeze(tableFiles))
contextBridge.exposeInMainWorld('binaryDocuments', Object.freeze(binaryDocuments))
contextBridge.exposeInMainWorld('searchAPI', searchAPI)
