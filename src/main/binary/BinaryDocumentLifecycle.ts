import type { BinaryDocumentRegistry } from './BinaryDocumentRegistry.ts'

export interface BinaryDocumentOwner {
  readonly id: number
  once(event: 'destroyed', listener: () => void): unknown
}

export function attachBinaryDocumentLifecycle(
  owner: BinaryDocumentOwner,
  registry: BinaryDocumentRegistry
): void {
  const ownerId = owner.id
  owner.once('destroyed', () => {
    registry.closeAll(ownerId)
  })
}
