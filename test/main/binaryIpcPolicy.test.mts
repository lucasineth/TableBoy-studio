import assert from 'node:assert/strict'
import test from 'node:test'

import { BinaryDocumentError } from '../../src/core/binary/index.ts'
import {
  assertIpcReadRangeLength,
  MAX_IPC_READ_RANGE
} from '../../src/main/binary/binaryIpcPolicy.ts'

test('accepts IPC range lengths up to the configured maximum', () => {
  assert.doesNotThrow(() => assertIpcReadRangeLength(0))
  assert.doesNotThrow(() => assertIpcReadRangeLength(MAX_IPC_READ_RANGE))
})

test('rejects negative, fractional and oversized IPC range lengths', () => {
  for (const length of [-1, 0.5, MAX_IPC_READ_RANGE + 1]) {
    assert.throws(
      () => assertIpcReadRangeLength(length),
      (error) => error instanceof BinaryDocumentError && error.code === 'INVALID_LENGTH'
    )
  }
})
