import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { BinaryDocument } from '../../src/core/binary/index.ts'
import { attachBinaryDocumentLifecycle } from '../../src/main/binary/BinaryDocumentLifecycle.ts'
import {
  BinaryDocumentRegistry,
  BinaryDocumentRegistryError
} from '../../src/main/binary/BinaryDocumentRegistry.ts'

class FakeOwner extends EventEmitter {
  readonly id: number

  constructor(id: number) {
    super()
    this.id = id
  }
}

function documentWith(byte: number): BinaryDocument {
  return new BinaryDocument(Uint8Array.of(byte))
}

test('registers metadata and retrieves a document for its owner', () => {
  const registry = new BinaryDocumentRegistry()
  const document = documentWith(0xaa)
  const metadata = registry.register(10, 'game.gba', document)

  assert.equal(metadata.name, 'game.gba')
  assert.equal(metadata.size, 1)
  assert.ok(metadata.id.length > 0)
  assert.deepEqual(Object.keys(metadata).sort(), ['id', 'name', 'size'])
  assert.equal(registry.getDocument(10, metadata.id), document)
})

test('does not authorize a document ID owned by another window', () => {
  const registry = new BinaryDocumentRegistry()
  const metadata = registry.register(10, 'game.gba', documentWith(0xaa))

  assert.throws(
    () => registry.getDocument(11, metadata.id),
    (error) => error instanceof BinaryDocumentRegistryError && error.code === 'DOCUMENT_NOT_FOUND'
  )
  assert.equal(registry.close(11, metadata.id), false)
  assert.equal(registry.getDocument(10, metadata.id).isClosed, false)
})

test('closes and removes a registered document', () => {
  const registry = new BinaryDocumentRegistry()
  const document = documentWith(0xaa)
  const metadata = registry.register(10, 'game.gba', document)

  assert.equal(registry.close(10, metadata.id), true)
  assert.equal(document.isClosed, true)
  assert.equal(registry.close(10, metadata.id), false)
  assert.throws(() => registry.getDocument(10, metadata.id), BinaryDocumentRegistryError)
})

test('notifies lifecycle subscribers without exposing document contents', () => {
  const registry = new BinaryDocumentRegistry()
  const events: Array<{ ownerId: number; documentIds: readonly string[] }> = []
  const unsubscribe = registry.onDocumentsClosed((event) => events.push(event))
  const first = registry.register(10, 'first.bin', documentWith(0x01))
  const second = registry.register(10, 'second.bin', documentWith(0x02))

  registry.close(10, first.id)
  registry.closeAll(10)
  unsubscribe()

  assert.deepEqual(events, [
    { ownerId: 10, documentIds: [first.id] },
    { ownerId: 10, documentIds: [second.id] }
  ])
})

test('closing an unknown document is a safe no-op', () => {
  const registry = new BinaryDocumentRegistry()
  assert.equal(registry.close(10, 'missing'), false)
})

test('closeAll releases multiple documents without affecting another window', () => {
  const registry = new BinaryDocumentRegistry()
  const first = documentWith(0x01)
  const second = documentWith(0x02)
  const otherWindow = documentWith(0x03)
  const otherMetadata = registry.register(20, 'other.bin', otherWindow)
  registry.register(10, 'first.bin', first)
  registry.register(10, 'second.bin', second)

  assert.equal(registry.closeAll(10), 2)
  assert.equal(first.isClosed, true)
  assert.equal(second.isClosed, true)
  assert.equal(otherWindow.isClosed, false)
  assert.equal(registry.getDocument(20, otherMetadata.id), otherWindow)
  assert.equal(registry.closeAll(10), 0)
})

test('destroying an owner releases every associated document', () => {
  const registry = new BinaryDocumentRegistry()
  const owner = new FakeOwner(10)
  const first = documentWith(0x01)
  const second = documentWith(0x02)
  registry.register(owner.id, 'first.bin', first)
  registry.register(owner.id, 'second.bin', second)
  attachBinaryDocumentLifecycle(owner, registry)

  owner.emit('destroyed')

  assert.equal(first.isClosed, true)
  assert.equal(second.isClosed, true)
  assert.equal(registry.closeAll(owner.id), 0)
})

test('rejects invalid owner identifiers', () => {
  const registry = new BinaryDocumentRegistry()
  assert.throws(
    () => registry.register(-1, 'game.bin', documentWith(0xaa)),
    (error) => error instanceof BinaryDocumentRegistryError && error.code === 'INVALID_OWNER'
  )
})
