export const TABLE_FILE_CHANNELS = {
  open: 'table:open',
  openPath: 'table:open-path',
  save: 'table:save',
  saveAs: 'table:save-as',
  confirmUnsaved: 'table:confirm-unsaved',
  documentState: 'table:document-state',
  saveBeforeClose: 'table:save-before-close',
  closeSaveCompleted: 'table:close-save-completed'
} as const

export interface OpenedTableFile {
  canceled: false
  filePath: string
  fileName: string
  contents: string
}

export interface CanceledFileOperation {
  canceled: true
}

export type OpenTableFileResult = OpenedTableFile | CanceledFileOperation

export interface SaveTableFileRequest {
  filePath: string
  contents: string
}

export interface SaveTableFileAsRequest {
  suggestedName: string
  contents: string
}

export interface SavedTableFile {
  canceled: false
  filePath: string
  fileName: string
}

export type SaveTableFileResult = SavedTableFile | CanceledFileOperation

export type UnsavedChangesDecision = 'save' | 'discard' | 'cancel'

export interface TableDocumentState {
  fileName: string
  modified: boolean
}

export interface TableFileApi {
  open(): Promise<OpenTableFileResult>
  openDroppedFile(file: File): Promise<OpenTableFileResult>
  save(request: SaveTableFileRequest): Promise<SaveTableFileResult>
  saveAs(request: SaveTableFileAsRequest): Promise<SaveTableFileResult>
  confirmUnsavedChanges(fileName: string): Promise<UnsavedChangesDecision>
  setDocumentState(state: TableDocumentState): void
  onSaveBeforeClose(listener: () => void): () => void
  completeCloseSave(saved: boolean): void
}
