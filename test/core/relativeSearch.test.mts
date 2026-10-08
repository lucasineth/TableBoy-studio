import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_RELATIVE_MAX_RESULTS,
  RelativeSearchEngine,
  RelativeSearchError,
  SearchError,
  type RelativeSearchResult,
  type SearchProgress
} from '../../src/core/search/index.ts'

const engine = new RelativeSearchEngine()

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

function offsets(results: readonly RelativeSearchResult[]): number[] {
  return results.map((result) => result.offset)
}

test('finds ABC encoded with a modular byte displacement', () => {
  const [result] = engine.search(bytes(0x00, 0x81, 0x82, 0x83, 0xff), 'ABC')

  assert.equal(result.offset, 1)
  assert.equal(result.length, 3)
  assert.deepEqual(result.matchedBytes, bytes(0x81, 0x82, 0x83))
  assert.deepEqual(result.mappings, [
    { character: 'A', value: 0x81 },
    { character: 'B', value: 0x82 },
    { character: 'C', value: 0x83 }
  ])
})

test('finds HELLO and emits mappings in first-appearance order', () => {
  const [result] = engine.search(bytes(0x88, 0x85, 0x8c, 0x8c, 0x8f), 'HELLO')

  assert.deepEqual(result.mappings, [
    { character: 'H', value: 0x88 },
    { character: 'E', value: 0x85 },
    { character: 'L', value: 0x8c },
    { character: 'O', value: 0x8f }
  ])
})

test('accepts consistent ABA and rejects inconsistent repeated characters', () => {
  assert.deepEqual(offsets(engine.search(bytes(0x81, 0x82, 0x81), 'ABA')), [0])
  assert.deepEqual(engine.search(bytes(0x81, 0x82, 0x83), 'ABA'), [])
})

test('rejects different query symbols mapped to the same byte', () => {
  assert.deepEqual(engine.search(bytes(0x81, 0x81), 'AB', { allowTwoSymbolQuery: true }), [])

  // A and Ł are distinct symbols whose code points are congruent modulo 256.
  assert.deepEqual(engine.search(bytes(0x81, 0x81, 0x81), 'AŁA'), [])
})

test('supports constant signatures such as AAAA', () => {
  const [result] = engine.search(bytes(0x00, 0x91, 0x91, 0x91, 0x91, 0xff), 'AAAA')
  assert.equal(result.offset, 1)
  assert.deepEqual(result.mappings, [{ character: 'A', value: 0x91 }])
})

test('preserves repetition patterns for ABBA', () => {
  assert.deepEqual(offsets(engine.search(bytes(0x81, 0x82, 0x82, 0x81), 'ABBA')), [0])
  assert.deepEqual(engine.search(bytes(0x81, 0x82, 0x83, 0x81), 'ABBA'), [])
})

test('preserves repetition patterns for LEVEL and MISSISSIPPI', () => {
  assert.deepEqual(offsets(engine.search(bytes(0xcc, 0xc5, 0xd6, 0xc5, 0xcc), 'LEVEL')), [0])

  const mississippi = Array.from(
    'MISSISSIPPI',
    (symbol) => ((symbol.codePointAt(0) ?? 0) + 0x30) & 0xff
  )
  assert.deepEqual(offsets(engine.search(Uint8Array.from(mississippi), 'MISSISSIPPI')), [0])
})

test('iterates Unicode by code point and maps each symbol to one byte', () => {
  const query = 'Áçあ'
  const [result] = engine.search(bytes(0xd1, 0xf7, 0x52), query)

  assert.deepEqual(result.mappings, [
    { character: 'Á', value: 0xd1 },
    { character: 'ç', value: 0xf7 },
    { character: 'あ', value: 0x52 }
  ])
})

test('treats spaces as normal symbols without assuming byte 0x20', () => {
  const [result] = engine.search(bytes(0x51, 0x30, 0x51), 'A A')
  assert.deepEqual(result.mappings, [
    { character: 'A', value: 0x51 },
    { character: ' ', value: 0x30 }
  ])
})

test('treats punctuation as normal symbols', () => {
  const [result] = engine.search(bytes(0x91, 0x71, 0x91), 'A!A')
  assert.deepEqual(result.mappings, [
    { character: 'A', value: 0x91 },
    { character: '!', value: 0x71 }
  ])
})

test('finds occurrences at the beginning and final valid offset', () => {
  const input = bytes(0x81, 0x82, 0x83, 0x00, 0x91, 0x92, 0x93)
  assert.deepEqual(offsets(engine.search(input, 'ABC')), [0, 4])
})

test('finds multiple and overlapping occurrences', () => {
  assert.deepEqual(offsets(engine.search(bytes(0x81, 0x82, 0x83, 0x84), 'ABC')), [0, 1])
})

test('returns no results when the relative signature is absent', () => {
  assert.deepEqual(engine.search(bytes(0x00, 0x00, 0x00, 0x00), 'ABC'), [])
})

test('rejects empty and one-symbol queries', () => {
  assert.throws(
    () => engine.search(bytes(), ''),
    (error) => error instanceof RelativeSearchError && error.code === 'EMPTY_QUERY'
  )
  assert.throws(
    () => engine.search(bytes(0x41), 'A'),
    (error) => error instanceof RelativeSearchError && error.code === 'QUERY_TOO_SHORT'
  )
})

test('requires explicit opt-in for low-selectivity two-symbol queries', () => {
  assert.throws(
    () => engine.search(bytes(0x81, 0x82), 'AB'),
    (error) => error instanceof RelativeSearchError && error.code === 'QUERY_TOO_SHORT'
  )
  assert.deepEqual(
    offsets(engine.search(bytes(0x81, 0x82), 'AB', { allowTwoSymbolQuery: true })),
    [0]
  )
})

test('uses a half-open search range', () => {
  const input = bytes(0x81, 0x82, 0x83, 0x00, 0x91, 0x92, 0x93)
  assert.deepEqual(offsets(engine.search(input, 'ABC', { startOffset: 1 })), [4])
  assert.deepEqual(offsets(engine.search(input, 'ABC', { endOffset: 4 })), [0])
})

test('uses absolute alignment independently of endianness', () => {
  const input = bytes(0x00, 0x81, 0x82, 0x83, 0x91, 0x92, 0x93)
  assert.deepEqual(offsets(engine.search(input, 'ABC', { alignment: 2 })), [4])
  assert.deepEqual(offsets(engine.search(input, 'ABC', { alignment: 4 })), [4])
})

test('honors explicit maxResults and the safe default limit', () => {
  assert.equal(engine.search(new Uint8Array(20), 'AAA', { maxResults: 3 }).length, 3)
  assert.equal(
    engine.search(new Uint8Array(DEFAULT_RELATIVE_MAX_RESULTS + 10), 'AAA').length,
    DEFAULT_RELATIVE_MAX_RESULTS
  )
})

test('rejects cancellation before the search begins', () => {
  const controller = new AbortController()
  controller.abort()
  assert.throws(
    () => engine.search(bytes(0x81, 0x82, 0x83), 'ABC', { signal: controller.signal }),
    (error) => error instanceof SearchError && error.code === 'SEARCH_ABORTED'
  )
})

test('supports cancellation during progress delivery', () => {
  const controller = new AbortController()
  assert.throws(
    () =>
      engine.search(new Uint8Array(100_000), 'ABC', {
        signal: controller.signal,
        onProgress(progress) {
          if (progress.processed > 0) controller.abort()
        }
      }),
    (error) => error instanceof SearchError && error.code === 'SEARCH_ABORTED'
  )
})

test('reports bounded monotonic progress and a final state', () => {
  const progress: SearchProgress[] = []
  engine.search(new Uint8Array(100_000), 'ABC', {
    onProgress(value) {
      progress.push(value)
    }
  })

  assert.ok(progress.length <= 102)
  assert.equal(progress[0].processed, 0)
  assert.equal(progress.at(-1)?.processed, progress.at(-1)?.total)
  assert.equal(progress.at(-1)?.percentage, 100)
  for (let index = 1; index < progress.length; index += 1) {
    assert.ok(progress[index].processed >= progress[index - 1].processed)
    assert.ok(progress[index].percentage >= progress[index - 1].percentage)
  }
})

test('delivers enriched results in batches', () => {
  const batches: RelativeSearchResult[][] = []
  const results = engine.search(new Uint8Array(302), 'AAA', {
    onResults(batch) {
      batches.push([...batch])
    }
  })

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [128, 128, 44]
  )
  assert.equal(results.length, 300)
  assert.equal(batches[0][0], results[0])
})

test('rejects invalid ranges, alignment and maxResults with shared search errors', () => {
  const input = bytes(0x81, 0x82, 0x83)
  assert.throws(
    () => engine.search(input, 'ABC', { startOffset: -1 }),
    (error) => error instanceof SearchError && error.code === 'INVALID_SEARCH_RANGE'
  )
  assert.throws(
    () => engine.search(input, 'ABC', { alignment: 0 }),
    (error) => error instanceof SearchError && error.code === 'INVALID_ALIGNMENT'
  )
  assert.throws(
    () => engine.search(input, 'ABC', { maxResults: 0 }),
    (error) => error instanceof SearchError && error.code === 'INVALID_MAX_RESULTS'
  )
})

test('does not modify input and result bytes do not reference it', () => {
  const input = bytes(0x81, 0x82, 0x83)
  const original = input.slice()
  const query = 'ABC'
  const [result] = engine.search(input, query)

  result.matchedBytes[0] = 0xff

  assert.deepEqual(input, original)
  assert.equal(query, 'ABC')
})
