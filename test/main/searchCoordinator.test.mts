import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import test from 'node:test'

import { BinaryDocument } from '../../src/core/binary/index.ts'
import type { TableEntry } from '../../src/core/table/index.ts'
import {
  MAX_QUEUED_SEARCH_JOBS,
  SearchCoordinator,
  SearchCoordinatorError,
  SearchExecutionError,
  type SearchJob,
  type SearchResultBatch
} from '../../src/main/search/index.ts'

function createWorker(): Worker {
  return new Worker(new URL('../../src/main/search/searchWorker.ts', import.meta.url), {
    execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types']
  })
}

async function startedCoordinator(onWorker?: (worker: Worker) => void): Promise<SearchCoordinator> {
  const coordinator = new SearchCoordinator(() => {
    const worker = createWorker()
    onWorker?.(worker)
    return worker
  })
  await coordinator.start()
  return coordinator
}

function binaryResults(batches: readonly SearchResultBatch[]): number[] {
  return batches.flatMap((batch) =>
    batch.searchType === 'binary' ? batch.results.map((result) => result.offset) : []
  )
}

test('starts and disposes the worker lifecycle idempotently', async () => {
  const coordinator = new SearchCoordinator(createWorker)
  await coordinator.start()
  await coordinator.start()
  assert.equal(coordinator.isStarted, true)

  const firstDispose = coordinator.dispose()
  const secondDispose = coordinator.dispose()
  assert.equal(firstDispose, secondDispose)
  await firstDispose
  assert.equal(coordinator.isDisposed, true)

  await assert.rejects(
    coordinator.start(),
    (error) => error instanceof SearchCoordinatorError && error.code === 'COORDINATOR_DISPOSED'
  )
  assert.throws(
    () => coordinator.search('missing', { type: 'binary', pattern: Uint8Array.of(0) }),
    (error) => error instanceof SearchCoordinatorError && error.code === 'COORDINATOR_DISPOSED'
  )
})

test('requires start before document or search operations', async () => {
  const coordinator = new SearchCoordinator(createWorker)
  await assert.rejects(
    coordinator.loadDocument('doc', new BinaryDocument(Uint8Array.of(1))),
    (error) => error instanceof SearchCoordinatorError && error.code === 'COORDINATOR_NOT_STARTED'
  )
  assert.throws(
    () => coordinator.search('doc', { type: 'binary', pattern: Uint8Array.of(1) }),
    (error) => error instanceof SearchCoordinatorError && error.code === 'COORDINATOR_NOT_STARTED'
  )
  await coordinator.dispose()
})

test('loads one document session, reuses it and releases it', async () => {
  const coordinator = await startedCoordinator()
  try {
    const document = new BinaryDocument(Uint8Array.of(0xaa, 0xbb, 0xaa))
    await coordinator.loadDocument('rom', document)

    const first = coordinator.search('rom', { type: 'binary', pattern: Uint8Array.of(0xaa) })
    const second = coordinator.search('rom', { type: 'binary', pattern: Uint8Array.of(0xbb) })
    assert.deepEqual(await first.completion, {
      jobId: first.id,
      status: 'completed',
      resultCount: 2
    })
    assert.deepEqual(await second.completion, {
      jobId: second.id,
      status: 'completed',
      resultCount: 1
    })

    assert.equal(document.readByte(0), 0xaa)
    assert.equal(await coordinator.releaseDocument('rom'), true)
    assert.equal(await coordinator.releaseDocument('rom'), false)
    assert.throws(
      () => coordinator.search('rom', { type: 'binary', pattern: Uint8Array.of(0xaa) }),
      (error) => error instanceof SearchCoordinatorError && error.code === 'DOCUMENT_NOT_FOUND'
    )
  } finally {
    await coordinator.dispose()
  }
})

test('delivers binary progress and incremental result batches', async () => {
  const coordinator = await startedCoordinator()
  try {
    await coordinator.loadDocument('binary', new BinaryDocument(new Uint8Array(302)))
    const progress: number[] = []
    const batches: SearchResultBatch[] = []
    const job = coordinator.search(
      'binary',
      { type: 'binary', pattern: Uint8Array.of(0) },
      {
        onProgress(value) {
          progress.push(value.percentage)
        },
        onResults(batch) {
          batches.push(batch)
        }
      }
    )

    const completion = await job.completion
    assert.equal(completion.resultCount, 302)
    assert.deepEqual(
      binaryResults(batches),
      Array.from({ length: 302 }, (_, index) => index)
    )
    assert.equal(progress[0], 0)
    assert.equal(progress.at(-1), 100)
  } finally {
    await coordinator.dispose()
  }
})

test('executes table search with tokens and preserves codec error details', async () => {
  const coordinator = await startedCoordinator()
  const entries: TableEntry[] = [
    { key: [0x41], value: 'A' },
    { key: [0xf1, 0x00], value: '[PLAYER]' }
  ]
  try {
    await coordinator.loadDocument(
      'table',
      new BinaryDocument(Uint8Array.of(0x41, 0xf1, 0x00, 0x41))
    )
    const batches: SearchResultBatch[] = []
    const tokenJob = coordinator.search(
      'table',
      { type: 'table', query: 'A[PLAYER]', entries },
      { onResults: (batch) => batches.push(batch) }
    )
    assert.equal((await tokenJob.completion).resultCount, 1)
    const tableBatch = batches.find((batch) => batch.searchType === 'table')
    assert.equal(
      tableBatch?.searchType === 'table' ? tableBatch.results[0].matchedText : '',
      'A[PLAYER]'
    )

    const invalidJob = coordinator.search('table', {
      type: 'table',
      query: 'Ç',
      entries
    })
    await assert.rejects(
      invalidJob.completion,
      (error) =>
        error instanceof SearchExecutionError &&
        error.code === 'UNMAPPED_TEXT' &&
        error.serialized.details?.position === 0 &&
        error.serialized.details?.fragment === 'Ç'
    )
  } finally {
    await coordinator.dispose()
  }
})

test('executes relative search in 8-bit and 16-bit LE/BE modes', async () => {
  const coordinator = await startedCoordinator()
  try {
    const bytes = Uint8Array.from([
      0x81, 0x82, 0x83, 0xff, 0x40, 0x81, 0x41, 0x81, 0x42, 0x81, 0xff, 0x81, 0x40, 0x81, 0x41,
      0x81, 0x42
    ])
    await coordinator.loadDocument('relative', new BinaryDocument(bytes))

    const batches: SearchResultBatch[] = []
    const jobs = [
      coordinator.search(
        'relative',
        { type: 'relative', query: 'ABC', options: { startOffset: 0, endOffset: 3 } },
        { onResults: (batch) => batches.push(batch) }
      ),
      coordinator.search(
        'relative',
        {
          type: 'relative',
          query: 'ABC',
          options: {
            startOffset: 4,
            endOffset: 10,
            valueWidth: 2,
            byteOrder: 'little-endian'
          }
        },
        { onResults: (batch) => batches.push(batch) }
      ),
      coordinator.search(
        'relative',
        {
          type: 'relative',
          query: 'ABC',
          options: {
            startOffset: 11,
            endOffset: 17,
            valueWidth: 2,
            byteOrder: 'big-endian'
          }
        },
        { onResults: (batch) => batches.push(batch) }
      )
    ]
    const completions = await Promise.all(jobs.map((job) => job.completion))
    assert.deepEqual(
      completions.map(({ resultCount }) => resultCount),
      [1, 1, 1]
    )

    const mappings = batches.flatMap((batch) =>
      batch.searchType === 'relative' ? batch.results.map((result) => result.mappings) : []
    )
    assert.equal(mappings.length, 3)
    assert.deepEqual(
      mappings.map((mapping) => mapping.map(({ value }) => value)),
      [
        [0x81, 0x82, 0x83],
        [0x8140, 0x8141, 0x8142],
        [0x8140, 0x8141, 0x8142]
      ]
    )
  } finally {
    await coordinator.dispose()
  }
})

test('executes wildcard, custom-sequence and Value Scan through the worker', async () => {
  const coordinator = await startedCoordinator()
  try {
    await coordinator.loadDocument(
      'advanced-relative',
      new BinaryDocument(Uint8Array.of(0x81, 0xee, 0x83, 0, 0x91, 0x92, 0x93, 0, 0x90, 0xa0, 0xb0))
    )
    const requests = [
      {
        type: 'relative' as const,
        query: 'A?C',
        options: { startOffset: 0, endOffset: 3, wildcards: true }
      },
      {
        type: 'relative' as const,
        query: 'ABC',
        options: { startOffset: 4, endOffset: 7, characterSequence: 'ABC' }
      },
      {
        type: 'relative' as const,
        inputMode: 'values' as const,
        values: [0x10, 0x20, 0x30],
        options: { startOffset: 8, endOffset: 11 }
      }
    ]
    const completions = []
    for (const request of requests) {
      const job = coordinator.search('advanced-relative', request)
      completions.push(await job.completion)
    }
    assert.deepEqual(
      completions.map(({ resultCount }) => resultCount),
      [1, 1, 1]
    )
  } finally {
    await coordinator.dispose()
  }
})

test('cancels before execution and during a synchronous worker search', async () => {
  const coordinator = await startedCoordinator()
  try {
    await coordinator.loadDocument('large', new BinaryDocument(new Uint8Array(32 * 1024 * 1024)))

    const before = coordinator.search('large', { type: 'relative', query: 'SEARCH!!' })
    assert.equal(before.cancel(), true)
    assert.equal((await before.completion).status, 'cancelled')

    const startedAt = performance.now()
    const during = coordinator.search('large', {
      type: 'relative',
      query: 'SEARCH!!',
      options: { valueWidth: 2, byteOrder: 'little-endian' }
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(during.cancel(), true)
    const completion = await during.completion
    const durationMs = performance.now() - startedAt

    assert.equal(completion.status, 'cancelled')
    assert.ok(durationMs < 1_000, `Cancellation took ${durationMs.toFixed(2)} ms.`)
  } finally {
    await coordinator.dispose()
  }
})

test('queues a second job and enforces the bounded queue policy', async () => {
  const coordinator = await startedCoordinator()
  try {
    await coordinator.loadDocument('queue', new BinaryDocument(new Uint8Array(8 * 1024 * 1024)))
    const active = coordinator.search('queue', { type: 'relative', query: 'SEARCH!!' })
    const queued: SearchJob[] = []
    for (let index = 0; index < MAX_QUEUED_SEARCH_JOBS; index += 1) {
      queued.push(
        coordinator.search('queue', { type: 'binary', pattern: Uint8Array.of(index + 1) })
      )
    }
    assert.throws(
      () => coordinator.search('queue', { type: 'binary', pattern: Uint8Array.of(0xff) }),
      (error) => error instanceof SearchCoordinatorError && error.code === 'SEARCH_QUEUE_FULL'
    )

    active.cancel()
    for (const job of queued) job.cancel()
    assert.equal((await active.completion).status, 'cancelled')
    assert.deepEqual(
      await Promise.all(queued.map(async (job) => (await job.completion).status)),
      Array(MAX_QUEUED_SEARCH_JOBS).fill('cancelled')
    )
  } finally {
    await coordinator.dispose()
  }
})

test('serializes engine errors and rejects unknown documents', async () => {
  const coordinator = await startedCoordinator()
  try {
    await coordinator.loadDocument('errors', new BinaryDocument(Uint8Array.of(1, 2, 3)))
    const job = coordinator.search('errors', { type: 'binary', pattern: new Uint8Array() })
    await assert.rejects(
      job.completion,
      (error) => error instanceof SearchExecutionError && error.code === 'EMPTY_PATTERN'
    )
    assert.throws(
      () => coordinator.search('missing', { type: 'binary', pattern: Uint8Array.of(1) }),
      (error) => error instanceof SearchCoordinatorError && error.code === 'DOCUMENT_NOT_FOUND'
    )
  } finally {
    await coordinator.dispose()
  }
})

test('rejects pending jobs when the worker crashes', async () => {
  let worker: Worker | undefined
  const coordinator = await startedCoordinator((created) => {
    worker = created
  })
  try {
    await coordinator.loadDocument('crash', new BinaryDocument(new Uint8Array(32 * 1024 * 1024)))
    const job = coordinator.search('crash', { type: 'relative', query: 'SEARCH!!' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await worker!.terminate()

    await assert.rejects(
      job.completion,
      (error) =>
        error instanceof SearchCoordinatorError &&
        (error.code === 'WORKER_TERMINATED' || error.code === 'WORKER_CRASHED')
    )
  } finally {
    await coordinator.dispose()
  }
})

test('dispose cancels active jobs and releases coordinator document state', async () => {
  const coordinator = await startedCoordinator()
  await coordinator.loadDocument('dispose', new BinaryDocument(new Uint8Array(16 * 1024 * 1024)))
  const job = coordinator.search('dispose', { type: 'relative', query: 'SEARCH!!' })

  await coordinator.dispose()
  assert.equal((await job.completion).status, 'cancelled')
  assert.equal(coordinator.isDisposed, true)
})
