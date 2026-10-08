import assert from 'node:assert/strict'
import test from 'node:test'

import { SearchIpcError } from '../../src/main/search/SearchIpcError.ts'
import {
  readSearchStartRequest,
  sanitizeSearchRequest,
  SEARCH_IPC_LIMITS
} from '../../src/main/search/SearchIpcPolicy.ts'

function invalidRequest(operation: () => unknown, code = 'INVALID_SEARCH_REQUEST'): void {
  assert.throws(operation, (error) => error instanceof SearchIpcError && error.code === code)
}

test('extracts only documentId and request from a start payload', () => {
  const request = { type: 'binary', pattern: Uint8Array.of(1) }
  assert.deepEqual(readSearchStartRequest({ documentId: 'doc', request, ownerId: 999 }), {
    documentId: 'doc',
    request
  })
})

test('rejects malformed payloads and unknown search types', () => {
  invalidRequest(() => readSearchStartRequest(null))
  invalidRequest(() => readSearchStartRequest({ documentId: '', request: {} }))
  invalidRequest(() => sanitizeSearchRequest({ type: 'unknown' }, 10))
  invalidRequest(() => sanitizeSearchRequest(Object.create({ type: 'binary' }), 10))
})

test('sanitizes binary patterns without retaining renderer memory', () => {
  const pattern = Uint8Array.of(0x81, 0x82, 0x83)
  const request = sanitizeSearchRequest(
    { type: 'binary', pattern, options: { startOffset: 1, endOffset: 9 } },
    10
  )
  assert.equal(request.type, 'binary')
  if (request.type !== 'binary') return
  assert.deepEqual(request.pattern, pattern)
  assert.notEqual(request.pattern, pattern)

  invalidRequest(() => sanitizeSearchRequest({ type: 'binary', pattern: [1, 2] }, 10))
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        { type: 'binary', pattern: new Uint8Array(SEARCH_IPC_LIMITS.binaryPatternBytes + 1) },
        SEARCH_IPC_LIMITS.binaryPatternBytes + 1
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
})

test('validates and copies plain TableEntry data', () => {
  const request = sanitizeSearchRequest(
    {
      type: 'table',
      query: 'HELLO',
      entries: [{ key: [0x81], value: 'H', comment: 'synthetic' }],
      options: { alignment: 2, maxResults: 5, contextBytes: 16 }
    },
    100
  )
  assert.equal(request.type, 'table')
  if (request.type !== 'table') return
  assert.deepEqual(request.entries, [{ key: [0x81], value: 'H', comment: 'synthetic' }])

  invalidRequest(() =>
    sanitizeSearchRequest({ type: 'table', query: 'A', entries: [{ key: [], value: 'A' }] }, 10)
  )
  invalidRequest(() =>
    sanitizeSearchRequest({ type: 'table', query: 'A', entries: [{ key: [256], value: 'A' }] }, 10)
  )
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        {
          type: 'table',
          query: 'A',
          entries: Array.from({ length: SEARCH_IPC_LIMITS.tableEntries + 1 }, () => ({
            key: [1],
            value: 'A'
          }))
        },
        10
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
})

test('enforces query, result, context, alignment and range limits', () => {
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        { type: 'relative', query: 'A'.repeat(SEARCH_IPC_LIMITS.queryLength + 1) },
        10
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        {
          type: 'table',
          query: 'A',
          entries: [{ key: [1], value: 'A' }],
          options: { contextBytes: SEARCH_IPC_LIMITS.contextBytes + 1 }
        },
        10
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        { type: 'binary', pattern: Uint8Array.of(1), options: { maxResults: 10_001 } },
        10
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        { type: 'binary', pattern: Uint8Array.of(1), options: { alignment: 4_097 } },
        10
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
  invalidRequest(() =>
    sanitizeSearchRequest(
      { type: 'binary', pattern: Uint8Array.of(1), options: { startOffset: 9, endOffset: 8 } },
      10
    )
  )
  invalidRequest(() =>
    sanitizeSearchRequest(
      { type: 'binary', pattern: Uint8Array.of(1), options: { endOffset: 11 } },
      10
    )
  )
})

test('validates relative 8-bit and 16-bit options explicitly', () => {
  const eight = sanitizeSearchRequest(
    { type: 'relative', query: 'ABC', options: { valueWidth: 1 } },
    10
  )
  const little = sanitizeSearchRequest(
    {
      type: 'relative',
      query: 'ABC',
      options: { valueWidth: 2, byteOrder: 'little-endian' }
    },
    10
  )
  const big = sanitizeSearchRequest(
    {
      type: 'relative',
      query: 'ABC',
      options: { valueWidth: 2, byteOrder: 'big-endian' }
    },
    10
  )

  assert.equal(eight.type === 'relative' ? eight.options?.valueWidth : 0, 1)
  assert.equal(little.type === 'relative' ? little.options?.byteOrder : '', 'little-endian')
  assert.equal(big.type === 'relative' ? big.options?.byteOrder : '', 'big-endian')
  invalidRequest(() =>
    sanitizeSearchRequest({ type: 'relative', query: 'ABC', options: { valueWidth: 2 } }, 10)
  )
  invalidRequest(() =>
    sanitizeSearchRequest(
      {
        type: 'relative',
        query: 'ABC',
        options: { valueWidth: 1, byteOrder: 'little-endian' }
      },
      10
    )
  )
})

test('sanitizes advanced relative text and Value Scan requests', () => {
  const text = sanitizeSearchRequest(
    {
      type: 'relative',
      inputMode: 'text',
      query: 'A?C',
      options: { valueWidth: 1, wildcards: true, characterSequence: 'ABC' }
    },
    10
  )
  assert.equal(text.type === 'relative' ? text.options?.wildcards : false, true)

  const values = [10, 20, 30]
  const valueRequest = sanitizeSearchRequest(
    { type: 'relative', inputMode: 'values', values, options: { valueWidth: 1 } },
    10
  )
  assert.equal(valueRequest.type, 'relative')
  if (valueRequest.type !== 'relative' || valueRequest.inputMode !== 'values') return
  assert.deepEqual(valueRequest.values, values)
  assert.notEqual(valueRequest.values, values)
})

test('enforces advanced relative IPC limits and numeric bounds', () => {
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        {
          type: 'relative',
          query: 'ABC',
          options: { characterSequence: 'A'.repeat(SEARCH_IPC_LIMITS.characterSequenceLength + 1) }
        },
        10
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
  invalidRequest(
    () =>
      sanitizeSearchRequest(
        {
          type: 'relative',
          inputMode: 'values',
          values: Array(SEARCH_IPC_LIMITS.relativeValues + 1).fill(1)
        },
        10
      ),
    'SEARCH_IPC_LIMIT_EXCEEDED'
  )
  invalidRequest(() =>
    sanitizeSearchRequest({ type: 'relative', inputMode: 'values', values: [0, 256, 2] }, 10)
  )
  invalidRequest(() =>
    sanitizeSearchRequest(
      {
        type: 'relative',
        inputMode: 'values',
        values: [1, 2, 3],
        options: { wildcards: true }
      },
      10
    )
  )
})
