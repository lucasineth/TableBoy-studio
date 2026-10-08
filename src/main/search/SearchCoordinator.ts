import { randomUUID } from 'node:crypto'
import type { Worker } from 'node:worker_threads'

import type { BinaryDocument } from '../../core/binary/index.ts'
import { SearchCoordinatorError, SearchExecutionError } from './SearchCoordinatorError.ts'
import type {
  SearchCoordinatorToWorkerMessage,
  SearchDocumentId,
  SearchJobId,
  SearchRequest,
  SearchResultBatch,
  SearchWorkerToCoordinatorMessage,
  SerializedSearchError
} from './SearchProtocol.ts'

export const MAX_QUEUED_SEARCH_JOBS = 8

export interface SearchJobHandlers {
  readonly onProgress?: (
    progress: Extract<SearchWorkerToCoordinatorMessage, { type: 'search:progress' }>['progress']
  ) => void
  readonly onResults?: (batch: SearchResultBatch) => void
}

export interface SearchJobCompletion {
  readonly jobId: SearchJobId
  readonly status: 'completed' | 'cancelled'
  readonly resultCount: number
}

export interface SearchJob {
  readonly id: SearchJobId
  readonly completion: Promise<SearchJobCompletion>
  cancel(): boolean
}

type CoordinatorState = 'idle' | 'starting' | 'running' | 'failed' | 'disposing' | 'disposed'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
}

interface PendingDocumentOperation {
  readonly kind: 'load' | 'release'
  readonly documentId: SearchDocumentId
  readonly deferred: Deferred<boolean>
}

interface PendingSearchJob {
  readonly id: SearchJobId
  readonly documentId: SearchDocumentId
  readonly request: SearchRequest
  readonly handlers: SearchJobHandlers
  readonly cancellation: Int32Array
  readonly deferred: Deferred<SearchJobCompletion>
  settled: boolean
}

export type SearchWorkerFactory = () => Worker

export class SearchCoordinator {
  readonly #workerFactory: SearchWorkerFactory
  readonly #documents = new Set<SearchDocumentId>()
  readonly #documentOperations = new Map<string, PendingDocumentOperation>()
  readonly #queue: PendingSearchJob[] = []
  #state: CoordinatorState = 'idle'
  #worker?: Worker
  #startDeferred?: Deferred<void>
  #disposePromise?: Promise<void>
  #activeJob?: PendingSearchJob
  #failure?: SearchCoordinatorError

  constructor(workerFactory: SearchWorkerFactory) {
    this.#workerFactory = workerFactory
  }

  get isStarted(): boolean {
    return this.#state === 'running'
  }

  get isDisposed(): boolean {
    return this.#state === 'disposed'
  }

  start(): Promise<void> {
    if (this.#state === 'running') return Promise.resolve()
    if (this.#state === 'starting') return this.#startDeferred!.promise
    if (this.#state === 'disposed' || this.#state === 'disposing') {
      return Promise.reject(this.disposedError())
    }
    if (this.#state === 'failed') return Promise.reject(this.#failure)

    this.#state = 'starting'
    this.#startDeferred = deferred<void>()
    try {
      const worker = this.#workerFactory()
      this.#worker = worker
      worker.on('message', this.handleMessage)
      worker.on('error', this.handleWorkerError)
      worker.on('exit', this.handleWorkerExit)
    } catch (error) {
      this.failWorker('WORKER_CRASHED', errorMessage(error))
    }
    return this.#startDeferred.promise
  }

  async loadDocument(documentId: SearchDocumentId, document: BinaryDocument): Promise<void> {
    this.requireRunning()
    if (this.#documents.has(documentId)) {
      throw new SearchCoordinatorError(
        'DOCUMENT_ALREADY_LOADED',
        `Search document ${JSON.stringify(documentId)} is already loaded.`
      )
    }

    const bytes = document.readRange(0, document.size)
    if (!(bytes.buffer instanceof ArrayBuffer)) {
      throw new TypeError('BinaryDocument ranges must use a transferable ArrayBuffer.')
    }
    const requestId = randomUUID()
    const operation: PendingDocumentOperation = {
      kind: 'load',
      documentId,
      deferred: deferred<boolean>()
    }
    this.#documentOperations.set(requestId, operation)
    this.post({ type: 'document:load', requestId, documentId, bytes }, [bytes.buffer])
    await operation.deferred.promise
  }

  async releaseDocument(documentId: SearchDocumentId): Promise<boolean> {
    this.requireRunning()
    if (!this.#documents.has(documentId)) return false

    if (this.#activeJob?.documentId === documentId) this.cancelJob(this.#activeJob.id)
    for (const job of [...this.#queue]) {
      if (job.documentId === documentId) this.cancelJob(job.id)
    }

    const requestId = randomUUID()
    const operation: PendingDocumentOperation = {
      kind: 'release',
      documentId,
      deferred: deferred<boolean>()
    }
    this.#documentOperations.set(requestId, operation)
    this.post({ type: 'document:release', requestId, documentId })
    return operation.deferred.promise
  }

  search(
    documentId: SearchDocumentId,
    request: SearchRequest,
    handlers: SearchJobHandlers = {}
  ): SearchJob {
    this.requireRunning()
    if (!this.#documents.has(documentId)) {
      throw new SearchCoordinatorError(
        'DOCUMENT_NOT_FOUND',
        `Search document ${JSON.stringify(documentId)} is not loaded.`
      )
    }
    if (this.#activeJob && this.#queue.length >= MAX_QUEUED_SEARCH_JOBS) {
      throw new SearchCoordinatorError(
        'SEARCH_QUEUE_FULL',
        `The search queue cannot contain more than ${MAX_QUEUED_SEARCH_JOBS} waiting jobs.`
      )
    }

    const job: PendingSearchJob = {
      id: randomUUID(),
      documentId,
      request: structuredClone(request),
      handlers,
      cancellation: new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
      deferred: deferred<SearchJobCompletion>(),
      settled: false
    }
    this.#queue.push(job)
    this.dispatchNext()

    return Object.freeze({
      id: job.id,
      completion: job.deferred.promise,
      cancel: (): boolean => this.cancelJob(job.id)
    })
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise
    if (this.#state === 'disposed') return Promise.resolve()

    this.#disposePromise = this.performDispose()
    return this.#disposePromise
  }

  private readonly handleMessage = (message: SearchWorkerToCoordinatorMessage): void => {
    switch (message.type) {
      case 'worker:ready':
        if (this.#state === 'starting') {
          this.#state = 'running'
          this.#startDeferred?.resolve()
        }
        break
      case 'document:loaded':
        this.completeDocumentOperation(message.requestId, true)
        break
      case 'document:released':
        this.completeDocumentOperation(message.requestId, message.released)
        break
      case 'document:error':
        this.failDocumentOperation(message.requestId, message.error)
        break
      case 'search:progress':
        if (this.#activeJob?.id === message.jobId) {
          this.#activeJob.handlers.onProgress?.(message.progress)
        }
        break
      case 'search:results':
        if (this.#activeJob?.id === message.jobId) {
          this.#activeJob.handlers.onResults?.({
            searchType: message.searchType,
            results: message.results
          } as SearchResultBatch)
        }
        break
      case 'search:complete':
        this.finishActiveJob(message.jobId, 'completed', message.resultCount)
        break
      case 'search:cancelled':
        this.finishActiveJob(message.jobId, 'cancelled', message.resultCount)
        break
      case 'search:error':
        this.failActiveJob(message.jobId, new SearchExecutionError(message.error))
        break
    }
  }

  private readonly handleWorkerError = (error: Error): void => {
    if (this.#state !== 'disposing' && this.#state !== 'disposed') {
      this.failWorker('WORKER_CRASHED', error.message)
    }
  }

  private readonly handleWorkerExit = (exitCode: number): void => {
    if (this.#state !== 'disposing' && this.#state !== 'disposed' && this.#state !== 'failed') {
      this.failWorker(
        'WORKER_TERMINATED',
        `The search worker exited unexpectedly with code ${exitCode}.`
      )
    }
  }

  private completeDocumentOperation(requestId: string, result: boolean): void {
    const operation = this.#documentOperations.get(requestId)
    if (!operation) return
    this.#documentOperations.delete(requestId)
    if (operation.kind === 'load') this.#documents.add(operation.documentId)
    else this.#documents.delete(operation.documentId)
    operation.deferred.resolve(result)
  }

  private failDocumentOperation(requestId: string, error: SerializedSearchError): void {
    const operation = this.#documentOperations.get(requestId)
    if (!operation) return
    this.#documentOperations.delete(requestId)
    operation.deferred.reject(new SearchExecutionError(error))
  }

  private dispatchNext(): void {
    if (this.#activeJob || this.#state !== 'running') return
    const job = this.#queue.shift()
    if (!job) return
    this.#activeJob = job
    const message: SearchCoordinatorToWorkerMessage = {
      type: 'search:start',
      jobId: job.id,
      documentId: job.documentId,
      request: job.request,
      cancellationBuffer: job.cancellation.buffer as SharedArrayBuffer
    }
    this.post(message)
  }

  private cancelJob(jobId: SearchJobId): boolean {
    if (this.#activeJob?.id === jobId) {
      if (Atomics.load(this.#activeJob.cancellation, 0) !== 0) return false
      Atomics.store(this.#activeJob.cancellation, 0, 1)
      return true
    }

    const queuedIndex = this.#queue.findIndex((job) => job.id === jobId)
    if (queuedIndex < 0) return false
    const [job] = this.#queue.splice(queuedIndex, 1)
    this.settleJob(job, { jobId, status: 'cancelled', resultCount: 0 })
    return true
  }

  private finishActiveJob(
    jobId: SearchJobId,
    status: SearchJobCompletion['status'],
    resultCount: number
  ): void {
    if (this.#activeJob?.id !== jobId) return
    const job = this.#activeJob
    this.#activeJob = undefined
    this.settleJob(job, { jobId, status, resultCount })
    this.dispatchNext()
  }

  private failActiveJob(jobId: SearchJobId, error: Error): void {
    if (this.#activeJob?.id !== jobId) return
    const job = this.#activeJob
    this.#activeJob = undefined
    this.rejectJob(job, error)
    this.dispatchNext()
  }

  private settleJob(job: PendingSearchJob, completion: SearchJobCompletion): void {
    if (job.settled) return
    job.settled = true
    job.deferred.resolve(completion)
  }

  private rejectJob(job: PendingSearchJob, error: Error): void {
    if (job.settled) return
    job.settled = true
    job.deferred.reject(error)
  }

  private failWorker(code: 'WORKER_CRASHED' | 'WORKER_TERMINATED', message: string): void {
    if (this.#state === 'failed' || this.#state === 'disposed') return
    const failure = new SearchCoordinatorError(code, message)
    this.#failure = failure
    this.#state = 'failed'
    this.#startDeferred?.reject(failure)
    if (this.#activeJob) this.rejectJob(this.#activeJob, failure)
    this.#activeJob = undefined
    for (const job of this.#queue.splice(0)) this.rejectJob(job, failure)
    for (const operation of this.#documentOperations.values()) {
      operation.deferred.reject(failure)
    }
    this.#documentOperations.clear()
    this.#documents.clear()
  }

  private async performDispose(): Promise<void> {
    const previousState = this.#state
    this.#state = 'disposing'
    const disposed = this.disposedError()
    this.#startDeferred?.reject(disposed)

    if (this.#activeJob) {
      Atomics.store(this.#activeJob.cancellation, 0, 1)
      this.settleJob(this.#activeJob, {
        jobId: this.#activeJob.id,
        status: 'cancelled',
        resultCount: 0
      })
    }
    this.#activeJob = undefined
    for (const job of this.#queue.splice(0)) {
      this.settleJob(job, { jobId: job.id, status: 'cancelled', resultCount: 0 })
    }
    for (const operation of this.#documentOperations.values()) {
      operation.deferred.reject(disposed)
    }
    this.#documentOperations.clear()
    this.#documents.clear()

    const worker = this.#worker
    this.#worker = undefined
    if (worker && previousState !== 'disposed') {
      worker.removeAllListeners()
      await worker.terminate()
    }
    this.#state = 'disposed'
  }

  private post(message: SearchCoordinatorToWorkerMessage, transferList?: ArrayBuffer[]): void {
    this.#worker!.postMessage(message, transferList)
  }

  private requireRunning(): void {
    if (this.#state === 'disposed' || this.#state === 'disposing') throw this.disposedError()
    if (this.#state === 'failed') throw this.#failure
    if (this.#state !== 'running') {
      throw new SearchCoordinatorError(
        'COORDINATOR_NOT_STARTED',
        'The search coordinator must be started before use.'
      )
    }
  }

  private disposedError(): SearchCoordinatorError {
    return new SearchCoordinatorError(
      'COORDINATOR_DISPOSED',
      'The search coordinator has been disposed.'
    )
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to create the search worker.'
}
