import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import { attachBinaryDocumentLifecycle } from './binary/BinaryDocumentLifecycle.ts'
import { binaryDocumentRegistry, registerBinaryDocumentIpc } from './binary/binaryDocumentIpc.ts'
import { protectTableWindow, registerTableFileIpc } from './ipc/tableFileIpc.ts'
import { createSearchCoordinator } from './search/createSearchCoordinator.ts'
import { SearchIpcController } from './search/SearchIpcController.ts'
import { attachSearchOwnerLifecycle, registerSearchIpc } from './search/searchIpc.ts'

const searchCoordinator = createSearchCoordinator()
const searchIpcController = new SearchIpcController(binaryDocumentRegistry, searchCoordinator)

function createWindow(): BrowserWindow {
  const icon = is.dev
    ? join(__dirname, '../../build/icon.png')
    : join(process.resourcesPath, 'icon.png')

  const mainWindow = new BrowserWindow({
    width: 900,
    height: 690,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  protectTableWindow(mainWindow)
  attachBinaryDocumentLifecycle(mainWindow.webContents, binaryDocumentRegistry)
  attachSearchOwnerLifecycle(mainWindow.webContents, searchIpcController)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.tableboy.studio')
  await searchCoordinator.start()
  registerTableFileIpc()
  registerBinaryDocumentIpc()
  registerSearchIpc(searchIpcController)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  void searchIpcController.dispose().finally(() => searchCoordinator.dispose())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
