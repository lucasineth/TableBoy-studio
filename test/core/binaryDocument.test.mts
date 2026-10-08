import assert from 'node:assert/strict'
import test from 'node:test'

import { BinaryDocument, BinaryDocumentError } from '../../src/core/binary/index.ts'

function assertDocumentError(code: BinaryDocumentError['code'], action: () => unknown): void {
  assert.throws(action, (error) => error instanceof BinaryDocumentError && error.code === code)
}

test('empty documents support an empty range but have no readable byte', () => {
  const document = new BinaryDocument(new Uint8Array())
  assert.equal(document.size, 0)
  assert.deepEqual(document.readRange(0, 0), new Uint8Array())
  assertDocumentError('INVALID_OFFSET', () => document.readByte(0))
})

test('reads the first, middle and last bytes', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10, 0x20, 0x30))
  assert.equal(document.readByte(0), 0x10)
  assert.equal(document.readByte(1), 0x20)
  assert.equal(document.readByte(2), 0x30)
})

test('reads ranges including the full document and final bytes', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10, 0x20, 0x30, 0x40))
  assert.deepEqual(document.readRange(0, 4), Uint8Array.of(0x10, 0x20, 0x30, 0x40))
  assert.deepEqual(document.readRange(2, 2), Uint8Array.of(0x30, 0x40))
})

test('accepts zero-length ranges at any valid boundary', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10, 0x20))
  assert.deepEqual(document.readRange(0, 0), new Uint8Array())
  assert.deepEqual(document.readRange(2, 0), new Uint8Array())
})

test('rejects negative, fractional and end byte offsets', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10))
  assertDocumentError('INVALID_OFFSET', () => document.readByte(-1))
  assertDocumentError('INVALID_OFFSET', () => document.readByte(0.5))
  assertDocumentError('INVALID_OFFSET', () => document.readByte(document.size))
})

test('rejects range offsets outside the document', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10))
  assertDocumentError('INVALID_OFFSET', () => document.readRange(-1, 1))
  assertDocumentError('INVALID_OFFSET', () => document.readRange(2, 0))
})

test('rejects negative and fractional range lengths', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10))
  assertDocumentError('INVALID_LENGTH', () => document.readRange(0, -1))
  assertDocumentError('INVALID_LENGTH', () => document.readRange(0, 0.5))
})

test('rejects ranges that extend beyond the final byte', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10, 0x20, 0x30, 0x40))
  assertDocumentError('INVALID_RANGE', () => document.readRange(document.size - 4, 5))
})

test('reads unsigned 16-bit values in both byte orders', () => {
  const document = new BinaryDocument(Uint8Array.of(0x34, 0x12))
  assert.equal(document.readUint16(0, 'little-endian'), 0x1234)
  assert.equal(document.readUint16(0, 'big-endian'), 0x3412)
})

test('rejects an incomplete unsigned 16-bit read', () => {
  const document = new BinaryDocument(Uint8Array.of(0x34, 0x12))
  assertDocumentError('INVALID_RANGE', () => document.readUint16(1, 'little-endian'))
})

test('copies constructor input and returned ranges', () => {
  const source = Uint8Array.of(0x10, 0x20)
  const document = new BinaryDocument(source)
  source[0] = 0xff
  assert.equal(document.readByte(0), 0x10)

  const range = document.readRange(0, 2)
  range[0] = 0xee
  assert.equal(document.readByte(0), 0x10)
})

test('close is idempotent and prevents every later read', () => {
  const document = new BinaryDocument(Uint8Array.of(0x10, 0x20))
  document.close()
  document.close()

  assert.equal(document.isClosed, true)
  assert.equal(document.size, 2)
  assertDocumentError('DOCUMENT_CLOSED', () => document.readByte(0))
  assertDocumentError('DOCUMENT_CLOSED', () => document.readRange(0, 0))
  assertDocumentError('DOCUMENT_CLOSED', () => document.readUint16(0, 'little-endian'))
})
