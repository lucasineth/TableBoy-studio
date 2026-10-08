import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatFileSize,
  formatHexBytes,
  formatHexOffset,
  formatMapping,
  parseHexOffset
} from '../../src/renderer/src/features/rom-search/formatting.ts'
import {
  buildSearchRequest,
  type RomSearchFormValues
} from '../../src/renderer/src/features/rom-search/searchRequest.ts'
import {
  initialRomSearchState,
  romSearchReducer
} from '../../src/renderer/src/features/rom-search/romSearchTypes.ts'
import { parseValueScan } from '../../src/renderer/src/features/rom-search/valueScanParser.ts'

const BASE_FORM: RomSearchFormValues = {
  mode: 'table',
  query: 'HELLO',
  relativeInputMode: 'text',
  relativeCharacterMode: 'unicode',
  customSequence: '',
  wildcards: false,
  valuesInput: '',
  valueWidth: 1,
  byteOrder: 'little-endian',
  startOffset: '0',
  endOffset: '',
  alignment: '1',
  maxResults: '1000',
  contextBytes: '16',
  allowTwoSymbolQuery: false
}

test('ROM document state opens and closes using metadata only', () => {
  const document = { id: 'doc-1', name: 'synthetic.bin', size: 1024 }
  const opened = romSearchReducer(initialRomSearchState, { type: 'DOCUMENT_OPENED', document })
  assert.deepEqual(opened.document, document)
  assert.equal(opened.status, 'idle')

  const closed = romSearchReducer(opened, { type: 'DOCUMENT_CLOSED' })
  assert.equal(closed.document, null)
  assert.deepEqual(closed.results, [])
  assert.equal(closed.selectedResultOffset, null)
})

test('empty binary metadata is represented without inventing searchable bytes', () => {
  const state = romSearchReducer(initialRomSearchState, {
    type: 'DOCUMENT_OPENED',
    document: { id: 'empty', name: 'empty.bin', size: 0 }
  })
  assert.equal(state.document?.size, 0)
  assert.equal(formatFileSize(state.document!.size), '0 B')
})

test('Table Search requires and reuses current TableEntry data', () => {
  const missing = buildSearchRequest(BASE_FORM, 256, [])
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.match(missing.errors.table, /table/i)

  const entries = [
    { key: [0x48], value: 'H' },
    { key: [0x45], value: 'E' }
  ]
  const built = buildSearchRequest(BASE_FORM, 256, entries)
  assert.equal(built.ok, true)
  if (!built.ok || built.request.type !== 'table') return
  assert.equal(built.request.entries, entries)
  assert.equal(built.request.options?.contextBytes, 16)
  assert.equal(built.request.options?.endOffset, 256)
})

test('builds Relative Search requests for 8-bit and 16-bit LE/BE', () => {
  const eight = buildSearchRequest({ ...BASE_FORM, mode: 'relative' }, 1024, [])
  const little = buildSearchRequest(
    {
      ...BASE_FORM,
      mode: 'relative',
      valueWidth: 2,
      byteOrder: 'little-endian'
    },
    1024,
    []
  )
  const big = buildSearchRequest(
    { ...BASE_FORM, mode: 'relative', valueWidth: 2, byteOrder: 'big-endian' },
    1024,
    []
  )

  assert.equal(
    eight.ok && eight.request.type === 'relative' ? eight.request.options?.valueWidth : 0,
    1
  )
  assert.equal(
    little.ok && little.request.type === 'relative' ? little.request.options?.byteOrder : '',
    'little-endian'
  )
  assert.equal(
    big.ok && big.request.type === 'relative' ? big.request.options?.byteOrder : '',
    'big-endian'
  )
})

test('builds wildcard and custom-sequence Relative Search requests', () => {
  const built = buildSearchRequest(
    {
      ...BASE_FORM,
      mode: 'relative',
      query: 'A?C',
      wildcards: true,
      relativeCharacterMode: 'custom',
      customSequence: 'ABC'
    },
    1024,
    []
  )
  assert.equal(built.ok, true)
  if (!built.ok || built.request.type !== 'relative' || built.request.inputMode === 'values') return
  assert.equal(built.request.options?.wildcards, true)
  assert.equal(built.request.options?.characterSequence, 'ABC')
})

test('parses Value Scan inputs and builds numeric requests', () => {
  assert.deepEqual(parseValueScan('10, 20 0x1E', 1), { ok: true, values: [10, 20, 30] })
  assert.equal(parseValueScan('12foo', 1).ok, false)
  assert.equal(parseValueScan('0xGG', 1).ok, false)
  assert.equal(parseValueScan('-1', 1).ok, false)
  assert.equal(parseValueScan('256', 1).ok, false)
  assert.deepEqual(parseValueScan('65535', 2), { ok: true, values: [65535] })

  const built = buildSearchRequest(
    {
      ...BASE_FORM,
      mode: 'relative',
      relativeInputMode: 'values',
      valuesInput: '10 20 30'
    },
    1024,
    []
  )
  assert.equal(built.ok, true)
  if (!built.ok || built.request.type !== 'relative' || built.request.inputMode !== 'values') return
  assert.deepEqual(built.request.values, [10, 20, 30])
})

test('search state appends batches, updates progress and completes incrementally', () => {
  const document = { id: 'doc', name: 'synthetic.bin', size: 128 }
  let state = romSearchReducer(initialRomSearchState, { type: 'DOCUMENT_OPENED', document })
  state = romSearchReducer(state, { type: 'SEARCH_STARTING' })
  state = romSearchReducer(state, { type: 'SEARCH_STARTED', jobId: 'job-1' })
  state = romSearchReducer(state, {
    type: 'PROGRESS',
    jobId: 'job-1',
    progress: { processed: 10, total: 100, percentage: 10 }
  })
  state = romSearchReducer(state, {
    type: 'RESULTS',
    jobId: 'job-1',
    results: [
      {
        kind: 'relative',
        result: {
          offset: 4,
          length: 3,
          matchedBytes: Uint8Array.of(0x81, 0x82, 0x83),
          mappings: [
            { character: 'A', value: 0x81 },
            { character: 'B', value: 0x82 },
            { character: 'C', value: 0x83 }
          ]
        }
      }
    ]
  })

  assert.equal(state.status, 'searching')
  assert.equal(state.progress?.percentage, 10)
  assert.equal(state.results.length, 1)

  state = romSearchReducer(state, { type: 'COMPLETE', jobId: 'job-1', resultCount: 1 })
  assert.equal(state.status, 'completed')
  assert.equal(state.resultCount, 1)
})

test('cancel and structured errors remain distinct UI states', () => {
  const searching = romSearchReducer(
    romSearchReducer(initialRomSearchState, { type: 'SEARCH_STARTING' }),
    { type: 'SEARCH_STARTED', jobId: 'job' }
  )
  const cancelled = romSearchReducer(searching, {
    type: 'CANCELLED',
    jobId: 'job',
    resultCount: 2
  })
  assert.equal(cancelled.status, 'cancelled')

  const failed = romSearchReducer(searching, {
    type: 'ERROR',
    jobId: 'job',
    error: {
      name: 'TableCodecError',
      code: 'UNMAPPED_TEXT',
      message: 'Text is not mapped.',
      details: { position: 1, fragment: 'Ç', reason: 'No table entry.' }
    }
  })
  assert.equal(failed.status, 'error')
  assert.equal(failed.error?.details?.fragment, 'Ç')
})

test('stale jobs cannot append results or finish a newer search', () => {
  let state = romSearchReducer(initialRomSearchState, { type: 'SEARCH_STARTING' })
  state = romSearchReducer(state, { type: 'SEARCH_STARTED', jobId: 'job-new' })
  const staleBatch = romSearchReducer(state, {
    type: 'RESULTS',
    jobId: 'job-old',
    results: [
      {
        kind: 'relative',
        result: { offset: 1, length: 3, matchedBytes: Uint8Array.of(1, 2, 3), mappings: [] }
      }
    ]
  })
  const staleComplete = romSearchReducer(staleBatch, {
    type: 'COMPLETE',
    jobId: 'job-old',
    resultCount: 1
  })
  assert.equal(staleComplete.results.length, 0)
  assert.equal(staleComplete.status, 'searching')
  assert.equal(staleComplete.jobId, 'job-new')
})

test('starting a new search clears results, progress and selection', () => {
  const dirty = {
    ...initialRomSearchState,
    status: 'completed' as const,
    results: [
      {
        kind: 'relative' as const,
        result: { offset: 8, length: 3, matchedBytes: Uint8Array.of(1, 2, 3), mappings: [] }
      }
    ],
    progress: { processed: 10, total: 10, percentage: 100 },
    selectedResultOffset: 8
  }
  const clean = romSearchReducer(dirty, { type: 'SEARCH_STARTING' })
  assert.deepEqual(clean.results, [])
  assert.equal(clean.progress, null)
  assert.equal(clean.selectedResultOffset, null)
})

test('result selection stores the offset in ROM Search', () => {
  const selected = romSearchReducer(initialRomSearchState, {
    type: 'SELECT_RESULT',
    offset: 0x1234
  })
  assert.equal(selected.selectedResultOffset, 0x1234)
})

test('hex offset parsing is strict and accepts optional 0x prefix', () => {
  assert.deepEqual(parseHexOffset('', 0, 0xffff, 'Start offset'), { ok: true, value: 0 })
  assert.deepEqual(parseHexOffset('100', 0, 0xffff, 'Start offset'), {
    ok: true,
    value: 0x100
  })
  assert.deepEqual(parseHexOffset('0x7FFF', 0, 0xffff, 'Start offset'), {
    ok: true,
    value: 0x7fff
  })
  assert.equal(parseHexOffset('0xZZ', 0, 0xffff, 'Start offset').ok, false)
  assert.equal(parseHexOffset('-1', 0, 0xffff, 'Start offset').ok, false)
  assert.equal(parseHexOffset('12foo', 0, 0xffff, 'Start offset').ok, false)
})

test('hex helpers format offsets, bytes and unique mappings consistently', () => {
  assert.equal(formatHexOffset(0x1234, 0x100000), '0x00001234')
  assert.equal(formatHexBytes(Uint8Array.of(0x01, 0xab, 0xff)), '01 AB FF')
  assert.equal(
    formatMapping(
      [
        { character: 'A', value: 0x8140 },
        { character: 'B', value: 0x8141 }
      ],
      2
    ),
    'A = 8140   B = 8141'
  )
})
