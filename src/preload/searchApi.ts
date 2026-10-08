import type { SearchApi } from '../shared/searchApi.ts'
import { SEARCH_CHANNELS } from '../shared/searchApi.ts'

type IpcListener = (event: unknown, payload: unknown) => void

export interface SearchIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: IpcListener): unknown
  removeListener(channel: string, listener: IpcListener): unknown
}

export function createSearchApi(ipc: SearchIpcRenderer): SearchApi {
  const subscribe = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
    const wrapped: IpcListener = (_event, payload) => listener(payload as T)
    ipc.on(channel, wrapped)
    return () => ipc.removeListener(channel, wrapped)
  }

  const api: SearchApi = {
    start: (documentId, request) =>
      ipc.invoke(SEARCH_CHANNELS.start, { documentId, request }) as ReturnType<SearchApi['start']>,
    cancel: (jobId) => ipc.invoke(SEARCH_CHANNELS.cancel, jobId) as ReturnType<SearchApi['cancel']>,
    onProgress: (listener) => subscribe(SEARCH_CHANNELS.progress, listener),
    onResults: (listener) => subscribe(SEARCH_CHANNELS.results, listener),
    onComplete: (listener) => subscribe(SEARCH_CHANNELS.complete, listener),
    onCancelled: (listener) => subscribe(SEARCH_CHANNELS.cancelled, listener),
    onError: (listener) => subscribe(SEARCH_CHANNELS.error, listener)
  }
  return Object.freeze(api)
}
