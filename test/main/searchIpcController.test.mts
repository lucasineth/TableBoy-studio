import assert from 'node:assert/strict'
import test from 'node:test'

import { BinaryDocument } from '../../src/core/binary/index.ts'
import type { SearchProgress } from '../../src/core/search/index.ts'
import { BinaryDocumentRegistry } from '../../src/main/binary/BinaryDocumentRegistry.ts'
import type {
  SearchCoordinatorPort,
  SearchEventTarget
} from '../../src/main/search/SearchIpcController.ts'
import { SearchIpcController } from '../../src/main/search/SearchIpcController.ts'
import {
  SearchCoordinatorError,
  SearchExecutionError
} from '../../src/main/search/SearchCoordinatorError.ts'
import type {
  SearchJob,
  SearchJobCompletion,
  SearchJobHandlers
} from '../../src/main/search/SearchCoordinator.ts'
import type { SearchRequest, SearchResultBatch } from '../../src/main/search/SearchProtocol.ts'
import { SEARCH_CHANNELS } from '../../src/shared/searchApi.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
}

class FakeTarget implements SearchEventTarget {
  readonly id: number
  readonly events: Array<{ channel: string; payload: unknown }> = []
  destroyed = false

  constructor(id: number) {
    this.id = id
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  send(channel: string, payload: unknown): void {
    this.events.push({ channel, payload })
  }
}

class FakeJob implements SearchJob {
  readonly id: string
  readonly completion: Promise<SearchJobCompletion>
  readonly #deferred: Deferred<SearchJobCompletion>
  cancelCalls = 0
  settled = false

  constructor(id: string) {
    this.id = id
    this.#deferred = deferred<SearchJobCompletion>()
    this.completion = this.#deferred.promise
  }

  cancel(): boolean {
    this.cancelCalls += 1
    if (this.settled) return false
    this.finish('cancelled', 0)
    return true
  }

  finish(status: SearchJobCompletion['status'] = 'completed', resultCount = 0): void {
    if (this.settled) return
    this.settled = true
    this.#deferred.resolve({ jobId: this.id, status, resultCount })
  }

  fail(error: Error): void {
    if (this.settled) return
    this.settled = true
    this.#deferred.reject(error)
  }
}

interface FakeSearchRecord {
  readonly documentId: string
  readonly request: SearchRequest
  readonly handlers: SearchJobHandlers
  readonly job: FakeJob
}

class FakeCoordinator implements SearchCoordinatorPort {
  readonly loads: string[] = []
  readonly releases: string[] = []
  readonly searches: FakeSearchRecord[] = []
  loadGate?: Deferred<void>
  loadError?: Error
  searchError?: Error
  #nextJob = 1

  async loadDocument(documentId: string): Promise<void> {
    this.loads.push(documentId)
    await this.loadGate?.promise
    if (this.loadError) throw this.loadError
  }

  async releaseDocument(documentId: string): Promise<boolean> {
    this.releases.push(documentId)
    return true
  }

  search(documentId: string, request: SearchRequest, handlers: SearchJobHandlers = {}): SearchJob {
    if (this.searchError) throw this.searchError
    const job = new FakeJob(`job-${this.#nextJob++}`)
    this.searches.push({ documentId, request, handlers, job })
    return job
  }

  progress(index: number, progress: SearchProgress): void {
    this.searches[index].handlers.onProgress?.(progress)
  }

  results(index: number, batch: SearchResultBatch): void {
    this.searches[index].handlers.onResults?.(batch)
  }
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function registerDocument(
  registry: BinaryDocumentRegistry,
  ownerId: number,
  bytes: Uint8Array = Uint8Array.of(0x81, 0x82, 0x83)
): string {
  return registry.register(ownerId, 'synthetic.bin', new BinaryDocument(bytes)).id
}

function startPayload(documentId: string, request: SearchRequest, extra = {}): unknown {
  return { documentId, request, ...extra }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

test('authorizes exclusively with target.id and hides cross-window document existence', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(10)
  const other = new FakeTarget(20)
  const documentId = registerDocument(registry, owner.id)
  const request = { type: 'binary' as const, pattern: Uint8Array.of(0x81) }

  const authorized = await controller.start(
    owner,
    startPayload(documentId, request, { ownerId: other.id })
  )
  const foreign = await controller.start(other, startPayload(documentId, request))
  const missing = await controller.start(other, startPayload('missing', request))

  assert.equal(authorized.ok, true)
  assert.equal(foreign.ok, false)
  assert.equal(missing.ok, false)
  if (!foreign.ok && !missing.ok) {
    assert.equal(foreign.error.code, 'DOCUMENT_NOT_FOUND')
    assert.equal(missing.error.code, 'DOCUMENT_NOT_FOUND')
    assert.equal(foreign.error.message, missing.error.message)
  }
  coordinator.searches[0].job.finish()
  await controller.dispose()
})

test('starts binary, table and relative 8/16-bit searches through one reused session', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(1)
  const documentId = registerDocument(registry, owner.id, new Uint8Array(100))
  const requests: SearchRequest[] = [
    { type: 'binary', pattern: Uint8Array.of(1) },
    { type: 'table', query: 'A', entries: [{ key: [1], value: 'A' }] },
    { type: 'relative', query: 'ABC', options: { valueWidth: 1 } },
    {
      type: 'relative',
      query: 'ABC',
      options: { valueWidth: 2, byteOrder: 'little-endian' }
    },
    {
      type: 'relative',
      query: 'ABC',
      options: { valueWidth: 2, byteOrder: 'big-endian' }
    }
  ]

  const responses = []
  for (const request of requests) {
    responses.push(await controller.start(owner, startPayload(documentId, request)))
  }

  assert.ok(responses.every((response) => response.ok))
  assert.equal(coordinator.loads.length, 1)
  assert.deepEqual(
    coordinator.searches.map(({ request }) => request.type),
    ['binary', 'table', 'relative', 'relative', 'relative']
  )
  coordinator.searches.forEach(({ job }) => job.finish())
  await controller.dispose()
})

test('forwards progress, batches, completion, cancellation and serialized errors', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(1)
  const documentId = registerDocument(registry, owner.id)
  const request = { type: 'binary' as const, pattern: Uint8Array.of(0x81) }

  const completed = await controller.start(owner, startPayload(documentId, request))
  assert.equal(completed.ok, true)
  coordinator.progress(0, { processed: 1, total: 2, percentage: 50 })
  coordinator.results(0, {
    searchType: 'binary',
    results: [{ offset: 0, length: 1 }]
  })
  coordinator.searches[0].job.finish('completed', 1)
  await flush()

  const cancelled = await controller.start(owner, startPayload(documentId, request))
  assert.equal(cancelled.ok, true)
  if (cancelled.ok) controller.cancel(owner, cancelled.jobId)
  await flush()

  const failed = await controller.start(owner, startPayload(documentId, request))
  assert.equal(failed.ok, true)
  coordinator.searches[2].job.fail(
    new SearchExecutionError({
      name: 'TableCodecError',
      code: 'UNMAPPED_TEXT',
      message: 'Text is not mapped.',
      details: { position: 0, fragment: 'Ç', reason: 'No table entry.' }
    })
  )
  await flush()

  assert.deepEqual(
    owner.events.map(({ channel }) => channel),
    [
      SEARCH_CHANNELS.progress,
      SEARCH_CHANNELS.results,
      SEARCH_CHANNELS.complete,
      SEARCH_CHANNELS.cancelled,
      SEARCH_CHANNELS.error
    ]
  )
  const errorEvent = owner.events.at(-1)?.payload as {
    error?: { code?: string; details?: Record<string, unknown> }
  }
  assert.equal(errorEvent.error?.code, 'UNMAPPED_TEXT')
  assert.deepEqual(errorEvent.error?.details, {
    position: 0,
    fragment: 'Ç',
    reason: 'No table entry.'
  })
  await controller.dispose()
})

test('isolates documents, jobs, cancellation and events between two windows', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const windowA = new FakeTarget(1)
  const windowB = new FakeTarget(2)
  const documentA = registerDocument(registry, windowA.id)
  const documentB = registerDocument(registry, windowB.id)
  const request = { type: 'binary' as const, pattern: Uint8Array.of(0x81) }

  const jobA = await controller.start(windowA, startPayload(documentA, request))
  const jobB = await controller.start(windowB, startPayload(documentB, request))
  assert.equal((await controller.start(windowA, startPayload(documentB, request))).ok, false)
  assert.equal((await controller.start(windowB, startPayload(documentA, request))).ok, false)
  assert.equal(jobA.ok && jobB.ok ? controller.cancel(windowA, jobB.jobId).cancelled : true, false)

  coordinator.results(0, { searchType: 'binary', results: [{ offset: 1, length: 1 }] })
  coordinator.results(1, { searchType: 'binary', results: [{ offset: 2, length: 1 }] })
  assert.equal(
    (windowA.events[0].payload as { results: Array<{ offset: number }> }).results[0].offset,
    1
  )
  assert.equal(
    (windowB.events[0].payload as { results: Array<{ offset: number }> }).results[0].offset,
    2
  )

  coordinator.searches[0].job.finish()
  coordinator.searches[1].job.finish()
  await controller.dispose()
})

test('binary close cancels jobs and releases its worker session', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(1)
  const documentId = registerDocument(registry, owner.id)
  await controller.start(owner, startPayload(documentId, { type: 'relative', query: 'ABCDE' }))

  assert.equal(registry.close(owner.id, documentId), true)
  await flush()

  assert.equal(coordinator.searches[0].job.cancelCalls, 1)
  assert.deepEqual(coordinator.releases, [documentId])
  assert.deepEqual(owner.events, [])
  await controller.dispose()
})

test('owner destruction cancels jobs, releases sessions and suppresses later events', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(1)
  const documentId = registerDocument(registry, owner.id)
  await controller.start(owner, startPayload(documentId, { type: 'relative', query: 'ABCDE' }))

  owner.destroyed = true
  coordinator.progress(0, { processed: 1, total: 10, percentage: 10 })
  registry.closeAll(owner.id)
  await flush()

  assert.equal(coordinator.searches[0].job.cancelCalls, 1)
  assert.deepEqual(coordinator.releases, [documentId])
  assert.deepEqual(owner.events, [])
  const afterDestroy = await controller.start(
    owner,
    startPayload(documentId, { type: 'binary', pattern: Uint8Array.of(1) })
  )
  assert.equal(afterDestroy.ok, false)
  await controller.dispose()
})

test('close during document load cannot create an orphan worker session', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  coordinator.loadGate = deferred<void>()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(1)
  const documentId = registerDocument(registry, owner.id)

  const starting = controller.start(
    owner,
    startPayload(documentId, { type: 'binary', pattern: Uint8Array.of(1) })
  )
  await flush()
  registry.close(owner.id, documentId)
  coordinator.loadGate.resolve()
  const response = await starting
  await flush()

  assert.equal(response.ok, false)
  assert.deepEqual(coordinator.loads, [documentId])
  assert.deepEqual(coordinator.releases, [documentId])
  assert.equal(coordinator.searches.length, 0)
  await controller.dispose()
})

test('queue and worker failures remain serializable and transactional', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(1)
  const documentId = registerDocument(registry, owner.id)
  const request = { type: 'binary' as const, pattern: Uint8Array.of(1) }

  coordinator.searchError = new SearchCoordinatorError('SEARCH_QUEUE_FULL', 'Queue full.')
  const queueFull = await controller.start(owner, startPayload(documentId, request))
  assert.equal(queueFull.ok, false)
  if (!queueFull.ok) assert.equal(queueFull.error.code, 'SEARCH_QUEUE_FULL')

  coordinator.searchError = undefined
  const started = await controller.start(owner, startPayload(documentId, request))
  assert.equal(started.ok, true)
  coordinator.searches[0].job.fail(new SearchCoordinatorError('WORKER_CRASHED', 'Worker crashed.'))
  await flush()
  const payload = owner.events[0].payload as { error: { code?: string } }
  assert.equal(payload.error.code, 'WORKER_CRASHED')
  await controller.dispose()
})

test('a failed document load leaves no partial job or cached session', async () => {
  const registry = new BinaryDocumentRegistry()
  const coordinator = new FakeCoordinator()
  const controller = new SearchIpcController(registry, coordinator)
  const owner = new FakeTarget(1)
  const documentId = registerDocument(registry, owner.id)
  const request = { type: 'binary' as const, pattern: Uint8Array.of(1) }

  coordinator.loadError = new SearchCoordinatorError('WORKER_CRASHED', 'Load failed.')
  const failed = await controller.start(owner, startPayload(documentId, request))
  assert.equal(failed.ok, false)
  if (!failed.ok) assert.equal(failed.error.code, 'WORKER_CRASHED')
  assert.equal(coordinator.searches.length, 0)
  assert.deepEqual(coordinator.releases, [])

  coordinator.loadError = undefined
  const retried = await controller.start(owner, startPayload(documentId, request))
  assert.equal(retried.ok, true)
  assert.deepEqual(coordinator.loads, [documentId, documentId])
  coordinator.searches[0].job.finish()
  await controller.dispose()
})
