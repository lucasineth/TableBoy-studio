import { performance } from 'node:perf_hooks'
import { Worker } from 'node:worker_threads'

import { BinaryDocument } from '../../src/core/binary/index.ts'
import { SearchCoordinator } from '../../src/main/search/SearchCoordinator.ts'

const MIB = 1024 * 1024
const sizeMiB = 64

function createWorker(): Worker {
  return new Worker(new URL('../../src/main/search/searchWorker.ts', import.meta.url), {
    execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types']
  })
}

async function timed<T>(operation: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const startedAt = performance.now()
  const value = await operation()
  return { value, durationMs: performance.now() - startedAt }
}

const source = new Uint8Array(sizeMiB * MIB)
const document = new BinaryDocument(source)
const coordinator = new SearchCoordinator(createWorker)
await coordinator.start()

const arrayBuffersBeforeLoad = process.memoryUsage().arrayBuffers
const load = await timed(() => coordinator.loadDocument('benchmark-rom', document))
const arrayBuffersAfterLoad = process.memoryUsage().arrayBuffers

const runSearch = async (): Promise<number> => {
  const job = coordinator.search('benchmark-rom', {
    type: 'relative',
    query: 'SEARCH!!',
    options: { valueWidth: 2, byteOrder: 'little-endian', alignment: 1 }
  })
  const completion = await job.completion
  return completion.resultCount
}

let maximumTimerDelayMs = 0
let expectedTimerAt = performance.now() + 10
const timer = setInterval(() => {
  const now = performance.now()
  maximumTimerDelayMs = Math.max(maximumTimerDelayMs, now - expectedTimerAt)
  expectedTimerAt = now + 10
}, 10)

const firstSearch = await timed(runSearch)
const secondSearch = await timed(runSearch)
clearInterval(timer)

const cancellationStartedAt = performance.now()
const cancelledJob = coordinator.search('benchmark-rom', {
  type: 'relative',
  query: 'SEARCH!!',
  options: { valueWidth: 2, byteOrder: 'little-endian', alignment: 1 }
})
await new Promise((resolve) => setTimeout(resolve, 50))
const cancellationRequestedAt = performance.now()
cancelledJob.cancel()
const cancellation = await cancelledJob.completion
const cancellationObservedAt = performance.now()

await coordinator.releaseDocument('benchmark-rom')
await coordinator.dispose()

console.log('Search worker benchmark (synthetic read-only document)')
console.log(
  JSON.stringify(
    {
      documentMiB: sizeMiB,
      loadAndTransferMs: Number(load.durationMs.toFixed(2)),
      mainArrayBuffersDeltaMiB: Number(
        ((arrayBuffersAfterLoad - arrayBuffersBeforeLoad) / MIB).toFixed(2)
      ),
      workerSessionBytes: sizeMiB * MIB,
      firstSearchMs: Number(firstSearch.durationMs.toFixed(2)),
      secondSearchMs: Number(secondSearch.durationMs.toFixed(2)),
      firstResultCount: firstSearch.value,
      secondResultCount: secondSearch.value,
      maximumCoordinatorTimerDelayMs: Number(maximumTimerDelayMs.toFixed(2)),
      cancellationStatus: cancellation.status,
      cancellationRequestAfterMs: Number(
        (cancellationRequestedAt - cancellationStartedAt).toFixed(2)
      ),
      cancellationObservedAfterRequestMs: Number(
        (cancellationObservedAt - cancellationRequestedAt).toFixed(2)
      )
    },
    null,
    2
  )
)
