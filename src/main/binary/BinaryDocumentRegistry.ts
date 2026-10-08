import { randomUUID } from 'node:crypto'

import type { BinaryDocument } from '../../core/binary/index.ts'
import type { BinaryDocumentMetadata } from '../../shared/binaryDocumentApi.ts'

export type BinaryDocumentRegistryErrorCode = 'INVALID_OWNER' | 'DOCUMENT_NOT_FOUND'

export class BinaryDocumentRegistryError extends Error {
  readonly code: BinaryDocumentRegistryErrorCode

  constructor(code: BinaryDocumentRegistryErrorCode, message: string) {
    super(message)
    this.name = 'BinaryDocumentRegistryError'
    this.code = code
  }
}

interface RegisteredBinaryDocument {
  readonly document: BinaryDocument
  readonly metadata: BinaryDocumentMetadata
}

export interface BinaryDocumentsClosedEvent {
  readonly ownerId: number
  readonly documentIds: readonly string[]
}

export type BinaryDocumentsClosedListener = (event: BinaryDocumentsClosedEvent) => void

export class BinaryDocumentRegistry {
  readonly #documentsByOwner = new Map<number, Map<string, RegisteredBinaryDocument>>()
  readonly #closedListeners = new Set<BinaryDocumentsClosedListener>()

  onDocumentsClosed(listener: BinaryDocumentsClosedListener): () => void {
    this.#closedListeners.add(listener)
    return () => this.#closedListeners.delete(listener)
  }

  register(ownerId: number, name: string, document: BinaryDocument): BinaryDocumentMetadata {
    this.assertOwnerId(ownerId)
    const documents = this.#documentsByOwner.get(ownerId) ?? new Map()
    const metadata = Object.freeze({ id: randomUUID(), name, size: document.size })
    documents.set(metadata.id, { document, metadata })
    this.#documentsByOwner.set(ownerId, documents)
    return metadata
  }

  getDocument(ownerId: number, documentId: string): BinaryDocument {
    this.assertOwnerId(ownerId)
    const registered = this.#documentsByOwner.get(ownerId)?.get(documentId)
    if (!registered) {
      throw new BinaryDocumentRegistryError(
        'DOCUMENT_NOT_FOUND',
        'The binary document does not exist or does not belong to this window.'
      )
    }
    return registered.document
  }

  close(ownerId: number, documentId: string): boolean {
    this.assertOwnerId(ownerId)
    const documents = this.#documentsByOwner.get(ownerId)
    const registered = documents?.get(documentId)
    if (!documents || !registered) return false

    registered.document.close()
    documents.delete(documentId)
    if (documents.size === 0) this.#documentsByOwner.delete(ownerId)
    this.notifyDocumentsClosed(ownerId, [documentId])
    return true
  }

  closeAll(ownerId: number): number {
    this.assertOwnerId(ownerId)
    const documents = this.#documentsByOwner.get(ownerId)
    if (!documents) return 0

    const documentIds = [...documents.keys()]
    for (const registered of documents.values()) registered.document.close()
    this.#documentsByOwner.delete(ownerId)
    this.notifyDocumentsClosed(ownerId, documentIds)
    return documents.size
  }

  private notifyDocumentsClosed(ownerId: number, documentIds: readonly string[]): void {
    const event = Object.freeze({ ownerId, documentIds: Object.freeze([...documentIds]) })
    for (const listener of this.#closedListeners) listener(event)
  }

  private assertOwnerId(ownerId: number): void {
    if (!Number.isSafeInteger(ownerId) || ownerId < 0) {
      throw new BinaryDocumentRegistryError(
        'INVALID_OWNER',
        'Owner ID must be a non-negative integer.'
      )
    }
  }
}
