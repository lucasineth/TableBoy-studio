import type { BinaryDocument } from '../../core/binary/index.ts'
import type {
  SearchCancelResponse,
  SearchErrorEvent,
  SearchStartResponse
} from '../../shared/searchApi.ts'
import { SEARCH_CHANNELS } from '../../shared/searchApi.ts'
import type {
  BinaryDocumentsClosedEvent,
  BinaryDocumentRegistry
} from '../binary/BinaryDocumentRegistry.ts'
import type { SearchJob, SearchJobHandlers, SearchJobCompletion } from './SearchCoordinator.ts'
import { serializeSearchError } from './SearchErrorSerialization.ts'
import { SearchIpcError } from './SearchIpcError.ts'
import {
  assertSearchJobId,
  readSearchStartRequest,
  sanitizeSearchRequest
} from './SearchIpcPolicy.ts'
import type { SearchRequest, SearchResultBatch } from './SearchProtocol.ts'

export interface SearchEventTarget {
  readonly id: number
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

export interface SearchCoordinatorPort {
  loadDocument(documentId: string, document: BinaryDocument): Promise<void>
  releaseDocument(documentId: string): Promise<boolean>
  search(documentId: string, request: SearchRequest, handlers?: SearchJobHandlers): SearchJob
}

interface DocumentSession {
  readonly ownerId: number
  readonly documentId: string
  loadPromise: Promise<void>
  loaded: boolean
}

interface OwnedSearchJob {
  readonly ownerId: number
  readonly documentId: string
  readonly target: SearchEventTarget
  readonly job: SearchJob
}

export class SearchIpcController {
  readonly #registry: BinaryDocumentRegistry
  readonly #coordinator: SearchCoordinatorPort
  readonly #sessions = new Map<string, DocumentSession>()
  readonly #jobs = new Map<string, OwnedSearchJob>()
  readonly #destroyedOwners = new Set<number>()
  readonly #unsubscribeRegistry: () => void
  #disposed = false

  constructor(registry: BinaryDocumentRegistry, coordinator: SearchCoordinatorPort) {
    this.#registry = registry
    this.#coordinator = coordinator
    this.#unsubscribeRegistry = registry.onDocumentsClosed(this.handleDocumentsClosed)
  }

  async start(target: SearchEventTarget, payload: unknown): Promise<SearchStartResponse> {
    try {
      this.assertAvailableOwner(target)
      const untrusted = readSearchStartRequest(payload)

      // Authorization intentionally precedes deep request validation so a foreign
      // document remains indistinguishable from a missing document.
      const document = this.#registry.getDocument(target.id, untrusted.documentId)
      const request = sanitizeSearchRequest(untrusted.request, document.size)
      const session = await this.ensureDocumentSession(target.id, untrusted.documentId, document)

      this.assertAvailableOwner(target)
      this.#registry.getDocument(target.id, untrusted.documentId)
      if (this.#sessions.get(untrusted.documentId) !== session) {
        throw new SearchIpcError('OWNER_DESTROYED', 'The binary document was closed during load.')
      }

      let jobId = ''
      const handlers: SearchJobHandlers = {
        onProgress: (progress) => {
          this.emitJobEvent(jobId, SEARCH_CHANNELS.progress, { jobId, progress })
        },
        onResults: (batch) => {
          this.emitResults(jobId, batch)
        }
      }
      const job = this.#coordinator.search(untrusted.documentId, request, handlers)
      jobId = job.id
      const ownedJob: OwnedSearchJob = {
        ownerId: target.id,
        documentId: untrusted.documentId,
        target,
        job
      }
      this.#jobs.set(job.id, ownedJob)
      void this.observeCompletion(ownedJob)
      return { ok: true, jobId: job.id }
    } catch (error) {
      return { ok: false, error: serializeSearchError(error) }
    }
  }

  cancel(target: SearchEventTarget, jobIdValue: unknown): SearchCancelResponse {
    try {
      this.assertAvailableOwner(target)
      const jobId = assertSearchJobId(jobIdValue)
      const owned = this.#jobs.get(jobId)
      if (!owned || owned.ownerId !== target.id) return { ok: true, cancelled: false }
      return { ok: true, cancelled: owned.job.cancel() }
    } catch (error) {
      return { ok: false, error: serializeSearchError(error) }
    }
  }

  destroyOwner(ownerId: number): void {
    if (this.#disposed) return
    this.#destroyedOwners.add(ownerId)

    for (const [jobId, owned] of this.#jobs) {
      if (owned.ownerId !== ownerId) continue
      this.#jobs.delete(jobId)
      owned.job.cancel()
    }
    for (const session of [...this.#sessions.values()]) {
      if (session.ownerId === ownerId) this.invalidateAndReleaseSession(session)
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsubscribeRegistry()
    for (const owned of this.#jobs.values()) owned.job.cancel()
    this.#jobs.clear()
    const sessions = [...this.#sessions.values()]
    this.#sessions.clear()
    await Promise.all(sessions.map((session) => this.releaseAfterLoad(session)))
  }

  private readonly handleDocumentsClosed = (event: BinaryDocumentsClosedEvent): void => {
    for (const documentId of event.documentIds) {
      for (const [jobId, owned] of this.#jobs) {
        if (owned.ownerId !== event.ownerId || owned.documentId !== documentId) continue
        this.#jobs.delete(jobId)
        owned.job.cancel()
      }
      const session = this.#sessions.get(documentId)
      if (session?.ownerId === event.ownerId) this.invalidateAndReleaseSession(session)
    }
  }

  private async ensureDocumentSession(
    ownerId: number,
    documentId: string,
    document: BinaryDocument
  ): Promise<DocumentSession> {
    const existing = this.#sessions.get(documentId)
    if (existing) {
      if (existing.ownerId !== ownerId) {
        throw new SearchIpcError('OWNER_DESTROYED', 'The search document is unavailable.')
      }
      await existing.loadPromise
      return existing
    }

    const session: DocumentSession = {
      ownerId,
      documentId,
      loadPromise: Promise.resolve(),
      loaded: false
    }
    this.#sessions.set(documentId, session)
    session.loadPromise = this.#coordinator
      .loadDocument(documentId, document)
      .then(() => {
        session.loaded = true
      })
      .catch((error) => {
        if (this.#sessions.get(documentId) === session) this.#sessions.delete(documentId)
        throw error
      })

    await session.loadPromise
    return session
  }

  private invalidateAndReleaseSession(session: DocumentSession): void {
    if (this.#sessions.get(session.documentId) === session) {
      this.#sessions.delete(session.documentId)
    }
    void this.releaseAfterLoad(session)
  }

  private async releaseAfterLoad(session: DocumentSession): Promise<void> {
    try {
      await session.loadPromise
      if (session.loaded) await this.#coordinator.releaseDocument(session.documentId)
    } catch {
      // A failed load creates no worker session to release.
    }
  }

  private async observeCompletion(owned: OwnedSearchJob): Promise<void> {
    try {
      const completion = await owned.job.completion
      if (this.#jobs.get(owned.job.id) !== owned) return
      this.#jobs.delete(owned.job.id)
      this.emitCompletion(owned, completion)
    } catch (error) {
      if (this.#jobs.get(owned.job.id) !== owned) return
      this.#jobs.delete(owned.job.id)
      this.emitOwned(owned, SEARCH_CHANNELS.error, {
        jobId: owned.job.id,
        error: serializeSearchError(error)
      } satisfies SearchErrorEvent)
    }
  }

  private emitCompletion(owned: OwnedSearchJob, completion: SearchJobCompletion): void {
    const channel =
      completion.status === 'completed' ? SEARCH_CHANNELS.complete : SEARCH_CHANNELS.cancelled
    this.emitOwned(owned, channel, {
      jobId: owned.job.id,
      resultCount: completion.resultCount
    })
  }

  private emitResults(jobId: string, batch: SearchResultBatch): void {
    this.emitJobEvent(jobId, SEARCH_CHANNELS.results, { jobId, ...batch })
  }

  private emitJobEvent(jobId: string, channel: string, payload: unknown): void {
    const owned = this.#jobs.get(jobId)
    if (owned) this.emitOwned(owned, channel, payload)
  }

  private emitOwned(owned: OwnedSearchJob, channel: string, payload: unknown): void {
    if (owned.target.isDestroyed()) {
      this.destroyOwner(owned.ownerId)
      return
    }
    owned.target.send(channel, payload)
  }

  private assertAvailableOwner(target: SearchEventTarget): void {
    if (this.#disposed || this.#destroyedOwners.has(target.id) || target.isDestroyed()) {
      throw new SearchIpcError('OWNER_DESTROYED', 'The search owner is no longer available.')
    }
  }
}
