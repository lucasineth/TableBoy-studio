import assert from 'node:assert/strict'
import test from 'node:test'

import { TableCodecError, TableDecoder, TableEncoder } from '../../src/core/codec/index.ts'
import {
  SearchError,
  TableSearchEngine,
  TableSearchError,
  type SearchProgress,
  type TableSearchResult
} from '../../src/core/search/index.ts'
import type { TableEntry } from '../../src/core/table/index.ts'

const engine = new TableSearchEngine()

function entry(key: number[], value: string): TableEntry {
  return { key, value }
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

test('finds a single table-encoded occurrence', () => {
  const entries = [entry([0x91], 'H'), entry([0x82], 'E'), entry([0xa4], 'L'), entry([0xb0], 'O')]
  const input = bytes(0x00, 0x91, 0x82, 0xa4, 0xa4, 0xb0, 0xff)

  const results = engine.search(input, 'HELLO', entries)

  assert.deepEqual(results, [
    {
      offset: 1,
      length: 5,
      matchedBytes: bytes(0x91, 0x82, 0xa4, 0xa4, 0xb0),
      matchedText: 'HELLO',
      context: undefined
    }
  ])
})

test('finds multiple occurrences and returns none when absent', () => {
  const entries = [entry([0x41], 'A'), entry([0x42], 'B')]
  const input = bytes(0x41, 0x42, 0x00, 0x41, 0x42)

  assert.deepEqual(
    engine.search(input, 'AB', entries).map((result) => result.offset),
    [0, 3]
  )
  assert.deepEqual(engine.search(input, 'BAA', entries), [])
})

test('finds occurrences at the beginning and end of the input', () => {
  const entries = [entry([0x41], 'A')]
  const results = engine.search(bytes(0x41, 0x00, 0x41), 'A', entries)
  assert.deepEqual(
    results.map((result) => result.offset),
    [0, 2]
  )
})

test('preserves overlapping binary occurrences', () => {
  const entries = [entry([0xaa], 'A')]
  const results = engine.search(bytes(0xaa, 0xaa, 0xaa), 'AA', entries)
  assert.deepEqual(
    results.map((result) => result.offset),
    [0, 1]
  )
})

test('rejects an empty query before binary search', () => {
  assert.throws(
    () => engine.search(bytes(), '', []),
    (error) => error instanceof TableSearchError && error.code === 'EMPTY_QUERY'
  )
})

test('preserves unmapped text details from TableEncoder', () => {
  try {
    engine.search(bytes(0x41), 'AÇ', [entry([0x41], 'A')])
    assert.fail('Expected the query to fail encoding.')
  } catch (error) {
    assert.ok(error instanceof TableCodecError)
    assert.equal(error.code, 'UNMAPPED_TEXT')
    assert.equal(error.position, 1)
    assert.equal(error.fragment, 'Ç')
    assert.match(error.reason, /position 1/)
  }
})

test('supports tokens without implementing separate token parsing', () => {
  const entries = [
    entry([0x48], 'H'),
    entry([0x49], 'I'),
    entry([0x20], ' '),
    entry([0xf1, 0x00], '[PLAYER]')
  ]
  const input = bytes(0x48, 0x49, 0x20, 0xf1, 0x00)
  const [result] = engine.search(input, 'HI [PLAYER]', entries)

  assert.deepEqual(result.matchedBytes, input)
  assert.equal(result.matchedText, 'HI [PLAYER]')
})

test('supports PT-BR and Japanese Unicode through table entries', () => {
  const entries = [entry([0x81, 0x40], 'Ã'), entry([0xab, 0xcd, 0xef], 'あ')]
  const input = bytes(0x81, 0x40, 0xab, 0xcd, 0xef)

  assert.equal(engine.search(input, 'Ã', entries)[0].offset, 0)
  assert.equal(engine.search(input, 'あ', entries)[0].offset, 2)
})

test('supports mixed 8-bit, 16-bit and variable-width keys', () => {
  const entries = [
    entry([0x41], 'A'),
    entry([0x81, 0x40], 'Á'),
    entry([0xf1, 0x00], '[PLAYER]'),
    entry([0xab, 0xcd, 0xef], 'あ')
  ]
  const expected = bytes(0x41, 0x81, 0x40, 0xf1, 0x00, 0xab, 0xcd, 0xef)
  const [result] = engine.search(expected, 'AÁ[PLAYER]あ', entries)

  assert.deepEqual(result.matchedBytes, expected)
  assert.equal(result.length, expected.length)
})

test('inherits longest-match behavior from TableEncoder', () => {
  const entries = [entry([0x01], 'A'), entry([0x02], 'AB'), entry([0x03], 'B')]
  const input = bytes(0x01, 0x03, 0x02)

  assert.deepEqual(
    engine.search(input, 'AB', entries).map((result) => result.offset),
    [2]
  )
})

test('passes alignment and maxResults to BinarySearchEngine', () => {
  const entries = [entry([0xaa], 'A')]
  const input = bytes(0x00, 0xaa, 0xaa, 0xaa, 0xaa)

  assert.deepEqual(
    engine.search(input, 'A', entries, { alignment: 2, maxResults: 2 }).map(({ offset }) => offset),
    [2, 4]
  )
})

test('preserves cancellation before and during binary search', () => {
  const before = new AbortController()
  before.abort()
  assert.throws(
    () => engine.search(bytes(0xff), 'A', [entry([0xff], 'A')], { signal: before.signal }),
    (error) => error instanceof SearchError && error.code === 'SEARCH_ABORTED'
  )

  const during = new AbortController()
  assert.throws(
    () =>
      engine.search(new Uint8Array(100_000), 'A', [entry([0xff], 'A')], {
        signal: during.signal,
        onProgress(progress) {
          if (progress.processed > 0) during.abort()
        }
      }),
    (error) => error instanceof SearchError && error.code === 'SEARCH_ABORTED'
  )
})

test('forwards monotonic progress with its final state', () => {
  const progress: SearchProgress[] = []
  engine.search(new Uint8Array(100_000), 'A', [entry([0xff], 'A')], {
    onProgress(value) {
      progress.push(value)
    }
  })

  assert.equal(progress[0].processed, 0)
  assert.equal(progress.at(-1)?.processed, progress.at(-1)?.total)
  assert.equal(progress.at(-1)?.percentage, 100)
  for (let index = 1; index < progress.length; index += 1) {
    assert.ok(progress[index].processed >= progress[index - 1].processed)
  }
})

test('does not allocate context by default or when contextBytes is zero', () => {
  const entries = [entry([0x41], 'A')]
  assert.equal(engine.search(bytes(0x41), 'A', entries)[0].context, undefined)
  assert.equal(engine.search(bytes(0x41), 'A', entries, { contextBytes: 0 })[0].context, undefined)
})

test('returns previous and following context with decoded text', () => {
  const entries = [
    entry([0x57], 'W'),
    entry([0x41], 'A'),
    entry([0x42], 'B'),
    entry([0x43], 'C'),
    entry([0x58], 'X')
  ]
  const [result] = engine.search(bytes(0x57, 0x41, 0x42, 0x43, 0x58), 'ABC', entries, {
    contextBytes: 1
  })

  assert.deepEqual(result.context?.before, bytes(0x57))
  assert.deepEqual(result.context?.after, bytes(0x58))
  assert.equal(result.context?.decodedText, 'WABCX')
})

test('truncates context safely at the beginning and end', () => {
  const entries = [entry([0x41], 'A'), entry([0x42], 'B'), entry([0x43], 'C')]
  const input = bytes(0x41, 0x42, 0x43)
  const [atStart] = engine.search(input, 'A', entries, { contextBytes: 2, maxResults: 1 })
  const [atEnd] = engine.search(input, 'C', entries, { contextBytes: 2 })

  assert.deepEqual(atStart.context?.before, bytes())
  assert.deepEqual(atStart.context?.after, bytes(0x42, 0x43))
  assert.equal(atStart.context?.decodedText, 'ABC')
  assert.deepEqual(atEnd.context?.before, bytes(0x41, 0x42))
  assert.deepEqual(atEnd.context?.after, bytes())
  assert.equal(atEnd.context?.decodedText, 'ABC')
})

test('keeps a valid result when arbitrary context starts inside a multibyte key', () => {
  const entries = [entry([0x81, 0x40], 'Á'), entry([0x41], 'A')]
  const [result] = engine.search(bytes(0x81, 0x40, 0x41), 'A', entries, { contextBytes: 1 })

  assert.equal(result.offset, 2)
  assert.deepEqual(result.context?.before, bytes(0x40))
  assert.deepEqual(result.context?.after, bytes())
  assert.equal(result.context?.decodedText, undefined)
})

test('rejects invalid context sizes', () => {
  const entries = [entry([0x41], 'A')]
  for (const contextBytes of [-1, 0.5]) {
    assert.throws(
      () => engine.search(bytes(0x41), 'A', entries, { contextBytes }),
      (error) => error instanceof TableSearchError && error.code === 'INVALID_CONTEXT_BYTES'
    )
  }
})

test('adapts binary batches to enriched table search batches', () => {
  const input = new Uint8Array(300).fill(0x41)
  const batches: TableSearchResult[][] = []
  const results = engine.search(input, 'A', [entry([0x41], 'A')], {
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
  assert.equal(results[0].matchedText, 'A')
  assert.deepEqual(results[0].matchedBytes, bytes(0x41))
})

test('result byte arrays are copies and cannot mutate the searched input', () => {
  const input = bytes(0x42, 0x41, 0x43)
  const entries = [entry([0x42], 'B'), entry([0x41], 'A'), entry([0x43], 'C')]
  const [result] = engine.search(input, 'A', entries, { contextBytes: 1 })

  result.matchedBytes[0] = 0xff
  result.context?.before.fill(0xff)
  result.context?.after.fill(0xff)

  assert.deepEqual(input, bytes(0x42, 0x41, 0x43))
})

test('round-trips an unambiguous query through found bytes', () => {
  const entries = [entry([0x41], 'A'), entry([0x81, 0x40], 'Á'), entry([0xf1, 0x00], '[PLAYER]')]
  const query = 'AÁ[PLAYER]'
  const encoded = new TableEncoder().encode(query, entries)
  const [result] = engine.search(encoded, query, entries)

  assert.equal(new TableDecoder().decode(result.matchedBytes, entries), query)
})
