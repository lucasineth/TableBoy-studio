import { ipcMain } from 'electron'

import { SEARCH_CHANNELS } from '../../shared/searchApi.ts'
import type { SearchIpcController } from './SearchIpcController.ts'

export interface SearchOwnerLifecycle {
  readonly id: number
  once(event: 'destroyed', listener: () => void): unknown
}

export function registerSearchIpc(controller: SearchIpcController): void {
  ipcMain.handle(SEARCH_CHANNELS.start, (event, payload: unknown) =>
    controller.start(event.sender, payload)
  )
  ipcMain.handle(SEARCH_CHANNELS.cancel, (event, jobId: unknown) =>
    controller.cancel(event.sender, jobId)
  )
}

export function attachSearchOwnerLifecycle(
  owner: SearchOwnerLifecycle,
  controller: SearchIpcController
): void {
  const ownerId = owner.id
  owner.once('destroyed', () => controller.destroyOwner(ownerId))
}
