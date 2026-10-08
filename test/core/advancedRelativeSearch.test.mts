import assert from 'node:assert/strict'
import test from 'node:test'

import type { ByteOrder } from '../../src/core/bytes/index.ts'
import {
  RelativeSearchEngine,
  RelativeSearchError,
  SearchError,
  type RelativeSearchResult,
  type SearchProgress
} from '../../src/core/search/index.ts'

const engine = new RelativeSearchEngine()

function encode16(values: readonly number[], byteOrder: ByteOrder): Uint8Array {
  const bytes = new Uint8Array(values.length * 2)
  values.forEach((value, index) => {
    if (byteOrder === 'little-endian') {
      bytes[index * 2] = value & 0xff
      bytes[index * 2 + 1] = value >>> 8
    } else {
      bytes[index * 2] = value >>> 8
      bytes[index * 2 + 1] = value & 0xff
    }
  })
  return bytes
}

function offsets(results: readonly RelativeSearchResult[]): number[] {
  return results.map((result) => result.offset)
}

test('custom ASCII sequence uses positions instead of Unicode code points', () => {
  const [result] = engine.search(Uint8Array.of(0x81, 0x82, 0x83), 'ABC', {
    characterSequence: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  })
  assert.equal(result.offset, 0)
  assert.deepEqual(result.mappings, [
    { character: 'A', value: 0x81 },
    { character: 'B', value: 0x82 },
    { character: 'C', value: 0x83 }
  ])
})

test('custom Unicode and reversed sequences define arbitrary relations', () => {
  assert.equal(
    engine.search(Uint8Array.of(0x90, 0x91, 0x92), 'あいう', {
      characterSequence: 'あいうえお'
    }).length,
    1
  )
  assert.equal(
    engine.search(Uint8Array.of(0x82, 0x81, 0x80), 'ABC', {
      characterSequence: 'CBA'
    }).length,
    1
  )
})

test('custom sequence rejects empty, duplicate and missing symbols', () => {
  assert.throws(
    () => engine.search(Uint8Array.of(1, 2, 3), 'ABC', { characterSequence: '' }),
    (error) => error instanceof RelativeSearchError && error.code === 'EMPTY_CHARACTER_SEQUENCE'
  )
  assert.throws(
    () => engine.search(Uint8Array.of(1, 2, 3), 'ABC', { characterSequence: 'ABCA' }),
    (error) => error instanceof RelativeSearchError && error.code === 'DUPLICATE_SEQUENCE_SYMBOL'
  )
  assert.throws(
    () => engine.search(Uint8Array.of(1, 2, 3), 'ABC', { characterSequence: 'AB' }),
    (error) => error instanceof RelativeSearchError && error.code === 'SYMBOL_NOT_IN_SEQUENCE'
  )
})

test('custom sequence preserves repetitions and supports 16-bit LE/BE', () => {
  assert.equal(
    engine.search(Uint8Array.of(0x90, 0x91, 0x90), 'ABA', {
      characterSequence: 'AB'
    }).length,
    1
  )
  for (const byteOrder of ['little-endian', 'big-endian'] as const) {
    const input = encode16([0x8140, 0x8141, 0x8142], byteOrder)
    assert.equal(
      engine.search(input, 'ABC', {
        characterSequence: 'ABC',
        valueWidth: 2,
        byteOrder
      }).length,
      1
    )
  }
})

test('wildcards preserve known constraints without producing mappings', () => {
  const [result] = engine.search(Uint8Array.of(0x81, 0x82, 0xee, 0x84, 0x85), 'AB?DE', {
    wildcards: true
  })
  assert.deepEqual(
    result.mappings.map(({ character, value }) => [character, value]),
    [
      ['A', 0x81],
      ['B', 0x82],
      ['D', 0x84],
      ['E', 0x85]
    ]
  )
})

test('wildcards work at the beginning, middle and end', () => {
  assert.equal(engine.search(Uint8Array.of(0x81, 0xee, 0x83), 'A?C', { wildcards: true }).length, 1)
  assert.equal(engine.search(Uint8Array.of(0xee, 0x82, 0x83), '?BC', { wildcards: true }).length, 1)
  assert.equal(
    engine.search(Uint8Array.of(0x81, 0x82, 0x83, 0xee), 'ABC?', { wildcards: true }).length,
    1
  )
  assert.equal(engine.search(Uint8Array.of(0x81, 0xee, 0x81), 'A?A', { wildcards: true }).length, 1)
  assert.equal(
    engine.search(Uint8Array.of(0x81, 0x82, 0xee, 0xdd), 'AB??', { wildcards: true }).length,
    1
  )
  assert.equal(
    engine.search(Uint8Array.of(0xee, 0xdd, 0x81, 0x82), '??AB', { wildcards: true }).length,
    1
  )
})

test('wildcard constraints retain bijection only for known symbols', () => {
  assert.equal(engine.search(Uint8Array.of(0x81, 0x81, 0x82), 'A?B', { wildcards: true }).length, 1)
  assert.equal(engine.search(Uint8Array.of(0x81, 0xee, 0x81), 'A?B', { wildcards: true }).length, 0)
})

test('wildcard mode rejects patterns without two known positions', () => {
  for (const query of ['???', 'A??', '?A?']) {
    assert.throws(
      () => engine.search(new Uint8Array(8), query, { wildcards: true }),
      (error) => error instanceof RelativeSearchError && error.code === 'INSUFFICIENT_CONSTRAINTS'
    )
  }
})

test('wildcard escaping distinguishes literal question marks', () => {
  const [result] = engine.search(Uint8Array.of(0x81, 0x7f, 0x83), 'A\\?C', {
    wildcards: true
  })
  assert.equal(
    result.mappings.some(({ character }) => character === '?'),
    true
  )
  assert.throws(
    () => engine.search(new Uint8Array(8), 'A\\xC', { wildcards: true }),
    (error) => error instanceof RelativeSearchError && error.code === 'INVALID_WILDCARD_ESCAPE'
  )
})

test('wildcards support overlapping matches, range and alignment', () => {
  const input = Uint8Array.of(0x81, 0x82, 0x81, 0x82, 0x83)
  assert.deepEqual(offsets(engine.search(input, 'A?A', { wildcards: true })), [0, 1])
  assert.deepEqual(
    offsets(
      engine.search(Uint8Array.of(0, 0, 0x81, 0xee, 0x83, 0, 0x91, 0xdd, 0x93), 'A?C', {
        wildcards: true,
        startOffset: 1,
        alignment: 2
      })
    ),
    [2, 6]
  )
})

test('wildcards support 16-bit little-endian and big-endian', () => {
  for (const byteOrder of ['little-endian', 'big-endian'] as const) {
    const input = encode16([0x8140, 0x9999, 0x8142], byteOrder)
    const [result] = engine.search(input, 'A?C', {
      wildcards: true,
      valueWidth: 2,
      byteOrder
    })
    assert.equal(result.length, 6)
    assert.deepEqual(
      result.mappings.map(({ value }) => value),
      [0x8140, 0x8142]
    )
  }
})

test('Value Scan searches explicit 8-bit values with modular wrap and repetitions', () => {
  assert.equal(engine.searchValues(Uint8Array.of(0x80, 0x8a, 0x94), [10, 20, 30]).length, 1)
  assert.equal(engine.searchValues(Uint8Array.of(0x70, 0x7b, 0x86), [250, 5, 16]).length, 1)
  const [repeated] = engine.searchValues(Uint8Array.of(0x81, 0x82, 0x81), [10, 11, 10])
  assert.deepEqual(repeated.mappings, [])
})

test('Value Scan supports 16-bit little-endian and big-endian', () => {
  for (const byteOrder of ['little-endian', 'big-endian'] as const) {
    const input = encode16([0x9000, 0x9010, 0x9020], byteOrder)
    const [result] = engine.searchValues(input, [0x100, 0x110, 0x120], {
      valueWidth: 2,
      byteOrder
    })
    assert.equal(result.length, 6)
  }
})

test('Value Scan preserves range, alignment, maxResults, progress and batches', () => {
  const input = Uint8Array.of(0, 0, 0x81, 0x82, 0x83, 0, 0x91, 0x92, 0x93)
  const progress: SearchProgress[] = []
  const batches: RelativeSearchResult[][] = []
  const results = engine.searchValues(input, [1, 2, 3], {
    startOffset: 1,
    endOffset: 9,
    alignment: 2,
    maxResults: 1,
    onProgress: (value) => progress.push(value),
    onResults: (batch) => batches.push([...batch])
  })
  assert.deepEqual(offsets(results), [2])
  assert.equal(batches.flat().length, 1)
  assert.equal(progress[0].processed, 0)
})

test('Value Scan validates empty, short, overflow and incompatible inputs', () => {
  assert.throws(
    () => engine.searchValues(new Uint8Array(8), []),
    (error) => error instanceof RelativeSearchError && error.code === 'EMPTY_VALUES'
  )
  assert.throws(
    () => engine.searchValues(new Uint8Array(8), [1]),
    (error) => error instanceof RelativeSearchError && error.code === 'QUERY_TOO_SHORT'
  )
  assert.throws(
    () => engine.searchValues(new Uint8Array(8), [0, 256, 2]),
    (error) => error instanceof RelativeSearchError && error.code === 'INVALID_RELATIVE_VALUE'
  )
  assert.throws(
    () => engine.searchValues(new Uint8Array(8), [1, 2, 3], { wildcards: true }),
    (error) => error instanceof RelativeSearchError && error.code === 'INCOMPATIBLE_OPTIONS'
  )
})

test('Value Scan preserves cancellation through the shared scanner', () => {
  const controller = new AbortController()
  assert.throws(
    () =>
      engine.searchValues(new Uint8Array(100_000), [1, 2, 3], {
        signal: controller.signal,
        onProgress(progress) {
          if (progress.processed > 0) controller.abort()
        }
      }),
    (error) => error instanceof SearchError && error.code === 'SEARCH_ABORTED'
  )
})
