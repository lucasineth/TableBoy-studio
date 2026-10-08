import { parentPort } from 'node:worker_threads'

import {
  BinarySearchEngine,
  RelativeSearchEngine,
  SearchError,
  StringScanner,
  TableSearchEngine,
  type RelativeSearchOptions,
  type SearchCancellation,
  type SearchOptions,
  type TableSearchOptions
} from '../../core/search/index.ts'
import { serializeSearchError } from './SearchErrorSerialization.ts'
import type {
  BinarySearchRequest,
  RelativeSearchRequest,
  SearchCoordinatorToWorkerMessage,
  SearchJobId,
  SearchRequest,
  SearchWorkerToCoordinatorMessage,
  TableSearchRequest
} from './SearchProtocol.ts'

if (!parentPort) throw new Error('Search worker must run inside a worker thread.')
const port = parentPort

const documents = new Map<string, Uint8Array>()
let activeJobId: SearchJobId | undefined

function post(message: SearchWorkerToCoordinatorMessage): void {
  port.postMessage(message)
}

function cancellationFrom(buffer: SharedArrayBuffer): SearchCancellation {
  const flag = new Int32Array(buffer)
  return {
    get aborted(): boolean {
      return Atomics.load(flag, 0) !== 0
    }
  }
}

function requireDocument(documentId: string): Uint8Array {
  const document = documents.get(documentId)
  if (!document) {
    throw Object.assign(new Error(`Search document ${JSON.stringify(documentId)} is not loaded.`), {
      code: 'DOCUMENT_NOT_FOUND'
    })
  }
  return document
}

function runBinary(
  jobId: SearchJobId,
  input: Uint8Array,
  request: BinarySearchRequest,
  cancellation: SearchCancellation,
  countResults: (count: number) => void
): void {
  const options: SearchOptions = {
    ...request.options,
    signal: cancellation,
    onProgress: (progress) => post({ type: 'search:progress', jobId, progress }),
    onResults: (results) => {
      countResults(results.length)
      post({ type: 'search:results', jobId, searchType: 'binary', results })
    }
  }
  new BinarySearchEngine().search(input, request.pattern, options)
}

function runTable(
  jobId: SearchJobId,
  input: Uint8Array,
  request: TableSearchRequest,
  cancellation: SearchCancellation,
  countResults: (count: number) => void
): void {
  const options: TableSearchOptions = {
    ...request.options,
    signal: cancellation,
    onProgress: (progress) => post({ type: 'search:progress', jobId, progress }),
    onResults: (results) => {
      countResults(results.length)
      post({ type: 'search:results', jobId, searchType: 'table', results })
    }
  }
  new TableSearchEngine().search(input, request.query, request.entries, options)
}

function runRelative(
  jobId: SearchJobId,
  input: Uint8Array,
  request: RelativeSearchRequest,
  cancellation: SearchCancellation,
  countResults: (count: number) => void
): void {
  const callbacks = {
    signal: cancellation,
    onProgress: (progress: Parameters<NonNullable<SearchOptions['onProgress']>>[0]) =>
      post({ type: 'search:progress', jobId, progress }),
    onResults: (results: Parameters<NonNullable<RelativeSearchOptions['onResults']>>[0]) => {
      countResults(results.length)
      post({ type: 'search:results', jobId, searchType: 'relative', results })
    }
  }
  const portable = request.options ?? {}
  const options: RelativeSearchOptions =
    portable.valueWidth === 2
      ? { ...portable, ...callbacks, valueWidth: 2, byteOrder: portable.byteOrder }
      : { ...portable, ...callbacks, valueWidth: 1 }

  const engine = new RelativeSearchEngine()
  if (request.inputMode === 'values') engine.searchValues(input, request.values, options)
  else engine.search(input, request.query, options)
}

function runSearch(
  jobId: SearchJobId,
  input: Uint8Array,
  request: SearchRequest,
  cancellation: SearchCancellation,
  countResults: (count: number) => void
): void {
  switch (request.type) {
    case 'strings':
      new StringScanner().scan(input, {
        ...request.options,
        signal: cancellation,
        onProgress: (progress) => post({ type: 'search:progress', jobId, progress }),
        onResults: (results) => {
          countResults(results.length)
          post({ type: 'search:results', jobId, searchType: 'strings', results })
        }
      })
      return
    case 'binary':
      return runBinary(jobId, input, request, cancellation, countResults)
    case 'table':
      return runTable(jobId, input, request, cancellation, countResults)
    case 'relative':
      return runRelative(jobId, input, request, cancellation, countResults)
  }
}

function executeSearch(
  message: Extract<SearchCoordinatorToWorkerMessage, { type: 'search:start' }>
): void {
  if (activeJobId) {
    post({
      type: 'search:error',
      jobId: message.jobId,
      error: {
        name: 'SearchWorkerError',
        code: 'WORKER_BUSY',
        message: 'The search worker already has an active job.'
      }
    })
    return
  }

  activeJobId = message.jobId
  let resultCount = 0
  try {
    const cancellation = cancellationFrom(message.cancellationBuffer)
    if (cancellation.aborted) throw new SearchError('SEARCH_ABORTED', 'The search was aborted.')
    runSearch(
      message.jobId,
      requireDocument(message.documentId),
      message.request,
      cancellation,
      (count) => {
        resultCount += count
      }
    )
    post({ type: 'search:complete', jobId: message.jobId, resultCount })
  } catch (error) {
    const serialized = serializeSearchError(error)
    if (serialized.code === 'SEARCH_ABORTED') {
      post({ type: 'search:cancelled', jobId: message.jobId, resultCount })
    } else {
      post({ type: 'search:error', jobId: message.jobId, error: serialized })
    }
  } finally {
    activeJobId = undefined
  }
}

port.on('message', (message: SearchCoordinatorToWorkerMessage) => {
  switch (message.type) {
    case 'document:load':
      try {
        documents.set(message.documentId, message.bytes)
        post({
          type: 'document:loaded',
          requestId: message.requestId,
          documentId: message.documentId
        })
      } catch (error) {
        post({
          type: 'document:error',
          requestId: message.requestId,
          error: serializeSearchError(error)
        })
      }
      break
    case 'document:release': {
      const released = documents.delete(message.documentId)
      post({
        type: 'document:released',
        requestId: message.requestId,
        documentId: message.documentId,
        released
      })
      break
    }
    case 'search:start':
      executeSearch(message)
      break
  }
})

post({ type: 'worker:ready' })
