import {
  BrowserWindow,
  dialog,
  ipcMain,
  type MessageBoxOptions,
  type OpenDialogOptions
} from 'electron'

import {
  TABLE_FILE_CHANNELS,
  type SaveTableFileAsRequest,
  type SaveTableFileRequest,
  type TableDocumentState,
  type UnsavedChangesDecision
} from '../../shared/tableFileApi.ts'
import {
  ensureTableExtension,
  isTableFilePath,
  readTableFile,
  tableFileName,
  writeTableFile
} from './tableFileService.ts'

const TABLE_FILE_FILTERS = [
  { name: 'Table files', extensions: ['tbl'] },
  { name: 'All files', extensions: ['*'] }
]

const documentStates = new Map<number, TableDocumentState>()
const closingStates = new WeakMap<
  BrowserWindow,
  { allowClose: boolean; promptOpen: boolean; awaitingSave: boolean }
>()

export function registerTableFileIpc(): void {
  ipcMain.handle(TABLE_FILE_CHANNELS.open, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: TABLE_FILE_FILTERS
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    return openTableFile(result.filePaths[0])
  })

  ipcMain.handle(TABLE_FILE_CHANNELS.openPath, async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.length === 0 || !isTableFilePath(filePath)) {
      throw new TypeError('Only .tbl files can be opened by drag and drop.')
    }

    return openTableFile(filePath)
  })

  ipcMain.handle(TABLE_FILE_CHANNELS.save, async (_event, request: SaveTableFileRequest) => {
    assertSaveRequest(request)
    await writeTableFile(request.filePath, request.contents)
    return {
      canceled: false,
      filePath: request.filePath,
      fileName: tableFileName(request.filePath)
    }
  })

  ipcMain.handle(TABLE_FILE_CHANNELS.saveAs, async (event, request: SaveTableFileAsRequest) => {
    assertSaveAsRequest(request)
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      defaultPath: request.suggestedName,
      filters: [{ name: 'Table files', extensions: ['tbl'] }]
    }
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) return { canceled: true }

    const filePath = ensureTableExtension(result.filePath)
    await writeTableFile(filePath, request.contents)
    return { canceled: false, filePath, fileName: tableFileName(filePath) }
  })

  ipcMain.handle(TABLE_FILE_CHANNELS.confirmUnsaved, async (event, fileName: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    return showUnsavedChangesDialog(owner, normalizedFileName(fileName))
  })

  ipcMain.on(TABLE_FILE_CHANNELS.documentState, (event, state: TableDocumentState) => {
    if (!isDocumentState(state)) return
    documentStates.set(event.sender.id, state)
  })

  ipcMain.on(TABLE_FILE_CHANNELS.closeSaveCompleted, (event, saved: boolean) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return

    const closingState = closingStates.get(owner)
    if (!closingState) return

    closingState.awaitingSave = false
    if (!saved) return

    closingState.allowClose = true
    owner.close()
  })
}

async function openTableFile(filePath: string) {
  return {
    canceled: false as const,
    filePath,
    fileName: tableFileName(filePath),
    contents: await readTableFile(filePath)
  }
}

export function protectTableWindow(window: BrowserWindow): void {
  const state = { allowClose: false, promptOpen: false, awaitingSave: false }
  const webContentsId = window.webContents.id
  closingStates.set(window, state)

  window.on('close', (event) => {
    if (state.allowClose) return

    const documentState = documentStates.get(window.webContents.id)
    if (!documentState?.modified) return

    event.preventDefault()
    if (state.promptOpen || state.awaitingSave) return

    state.promptOpen = true
    void showUnsavedChangesDialog(window, documentState.fileName).then((decision) => {
      state.promptOpen = false

      if (decision === 'discard') {
        state.allowClose = true
        window.close()
        return
      }

      if (decision === 'save') {
        state.awaitingSave = true
        window.webContents.send(TABLE_FILE_CHANNELS.saveBeforeClose)
      }
    })
  })

  window.webContents.once('destroyed', () => {
    documentStates.delete(webContentsId)
  })
}

async function showUnsavedChangesDialog(
  owner: BrowserWindow | null,
  fileName: string
): Promise<UnsavedChangesDecision> {
  const options: MessageBoxOptions = {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: `Save changes to "${fileName}"?`,
    detail: 'Your changes will be lost if you do not save them.'
  }
  const result = owner
    ? await dialog.showMessageBox(owner, options)
    : await dialog.showMessageBox(options)

  return (['save', 'discard', 'cancel'] as const)[result.response] ?? 'cancel'
}

function normalizedFileName(fileName: unknown): string {
  return typeof fileName === 'string' && fileName.trim().length > 0 ? fileName : 'Untitled.tbl'
}

function isDocumentState(state: unknown): state is TableDocumentState {
  if (!state || typeof state !== 'object') return false
  const candidate = state as Partial<TableDocumentState>
  return typeof candidate.fileName === 'string' && typeof candidate.modified === 'boolean'
}

function assertSaveRequest(request: SaveTableFileRequest): void {
  if (
    !request ||
    typeof request.filePath !== 'string' ||
    request.filePath.length === 0 ||
    typeof request.contents !== 'string'
  ) {
    throw new TypeError('Invalid table save request.')
  }
}

function assertSaveAsRequest(request: SaveTableFileAsRequest): void {
  if (
    !request ||
    typeof request.suggestedName !== 'string' ||
    typeof request.contents !== 'string'
  ) {
    throw new TypeError('Invalid table Save As request.')
  }
}
