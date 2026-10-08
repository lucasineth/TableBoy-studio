import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { createSearchApi, type SearchIpcRenderer } from '../../src/preload/searchApi.ts'
import { SEARCH_CHANNELS } from '../../src/shared/searchApi.ts'

class FakeIpcRenderer extends EventEmitter implements SearchIpcRenderer {
  readonly invocations: Array<{ channel: string; args: unknown[] }> = []

  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    this.invocations.push({ channel, args })
    return Promise.resolve({ ok: true })
  }

  override on(channel: string, listener: (event: unknown, payload: unknown) => void): this {
    return super.on(channel, listener)
  }

  override removeListener(
    channel: string,
    listener: (event: unknown, payload: unknown) => void
  ): this {
    return super.removeListener(channel, listener)
  }
}

test('preload API invokes only the public start and cancel channels', async () => {
  const ipc = new FakeIpcRenderer()
  const api = createSearchApi(ipc)
  const request = { type: 'binary' as const, pattern: Uint8Array.of(0x81) }

  await api.start('doc', request)
  await api.cancel('job')

  assert.deepEqual(ipc.invocations, [
    { channel: SEARCH_CHANNELS.start, args: [{ documentId: 'doc', request }] },
    { channel: SEARCH_CHANNELS.cancel, args: ['job'] }
  ])
})

test('subscriptions hide Electron events and return working unsubscribe functions', () => {
  const ipc = new FakeIpcRenderer()
  const api = createSearchApi(ipc)
  const received: unknown[] = []
  const unsubscribe = api.onProgress((payload) => received.push(payload))
  const payload = { jobId: 'job', progress: { processed: 1, total: 2, percentage: 50 } }
  const electronEvent = { sender: 'must-not-leak' }

  ipc.emit(SEARCH_CHANNELS.progress, electronEvent, payload)
  unsubscribe()
  ipc.emit(SEARCH_CHANNELS.progress, electronEvent, { jobId: 'ignored' })

  assert.deepEqual(received, [payload])
  assert.notEqual(received[0], electronEvent)
  assert.equal(ipc.listenerCount(SEARCH_CHANNELS.progress), 0)
})

test('all event APIs subscribe to their dedicated channels', () => {
  const ipc = new FakeIpcRenderer()
  const api = createSearchApi(ipc)
  const unsubscribers = [
    api.onResults(() => undefined),
    api.onComplete(() => undefined),
    api.onCancelled(() => undefined),
    api.onError(() => undefined)
  ]

  assert.equal(ipc.listenerCount(SEARCH_CHANNELS.results), 1)
  assert.equal(ipc.listenerCount(SEARCH_CHANNELS.complete), 1)
  assert.equal(ipc.listenerCount(SEARCH_CHANNELS.cancelled), 1)
  assert.equal(ipc.listenerCount(SEARCH_CHANNELS.error), 1)
  unsubscribers.forEach((unsubscribe) => unsubscribe())
})
