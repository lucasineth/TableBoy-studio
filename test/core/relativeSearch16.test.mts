import assert from 'node:assert/strict'
import test from 'node:test'

import { writeUint16, type ByteOrder } from '../../src/core/bytes/index.ts'
import {
  RelativeSearchEngine,
  RelativeSearchError,
  SearchError,
  type RelativeSearchOptions,
  type RelativeSearchResult,
  type SearchProgress
} from '../../src/core/search/index.ts'

const engine = new RelativeSearchEngine()

function encode16(query: string, displacement: number, byteOrder: ByteOrder): Uint8Array {
  const symbols = Array.from(query)
  const result = new Uint8Array(symbols.length * 2)

  symbols.forEach((symbol, index) => {
    const value = ((symbol.codePointAt(0) ?? 0) + displacement) & 0xffff
    result.set(writeUint16(value, byteOrder), index * 2)
  })

  return result
}

function search16(
  input: Uint8Array,
  query: string,
  byteOrder: ByteOrder,
  options: Omit<RelativeSearchOptions, 'valueWidth' | 'byteOrder'> = {}
): RelativeSearchResult[] {
  return engine.search(input, query, { ...options, valueWidth: 2, byteOrder })
}

function offsets(results: readonly RelativeSearchResult[]): number[] {
  return results.map((result) => result.offset)
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

test('finds ABC as 16-bit little-endian values', () => {
  const candidate = Uint8Array.from([0x40, 0x81, 0x41, 0x81, 0x42, 0x81])
  const [result] = search16(candidate, 'ABC', 'little-endian')

  assert.equal(result.offset, 0)
  assert.equal(result.length, 6)
  assert.deepEqual(result.matchedBytes, candidate)
  assert.deepEqual(result.mappings, [
    { character: 'A', value: 0x8140 },
    { character: 'B', value: 0x8141 },
    { character: 'C', value: 0x8142 }
  ])
})

test('finds ABC as 16-bit big-endian values', () => {
  const candidate = Uint8Array.from([0x81, 0x40, 0x81, 0x41, 0x81, 0x42])
  const [result] = search16(candidate, 'ABC', 'big-endian')

  assert.equal(result.length, 6)
  assert.deepEqual(result.matchedBytes, candidate)
  assert.deepEqual(result.mappings, [
    { character: 'A', value: 0x8140 },
    { character: 'B', value: 0x8141 },
    { character: 'C', value: 0x8142 }
  ])
})

test('finds HELLO in little-endian and big-endian storage', () => {
  for (const byteOrder of ['little-endian', 'big-endian'] as const) {
    const candidate = encode16('HELLO', 0x8100, byteOrder)
    const [result] = search16(candidate, 'HELLO', byteOrder)

    assert.deepEqual(result.mappings, [
      { character: 'H', value: 0x8148 },
      { character: 'E', value: 0x8145 },
      { character: 'L', value: 0x814c },
      { character: 'O', value: 0x814f }
    ])
  }
})

test('enforces repeated-character consistency and bijective 16-bit mappings', () => {
  assert.deepEqual(
    offsets(search16(encode16('ABA', 0x5000, 'little-endian'), 'ABA', 'little-endian')),
    [0]
  )

  const inconsistent = concat(
    writeUint16(0x5041, 'little-endian'),
    writeUint16(0x5042, 'little-endian'),
    writeUint16(0x5043, 'little-endian')
  )
  assert.deepEqual(search16(inconsistent, 'ABA', 'little-endian'), [])

  const collidingSymbol = String.fromCodePoint(0x10041)
  const collision = concat(
    writeUint16(0x5000, 'big-endian'),
    writeUint16(0x5000, 'big-endian'),
    writeUint16(0x5000, 'big-endian')
  )
  assert.deepEqual(search16(collision, `A${collidingSymbol}A`, 'big-endian'), [])
})

test('supports constant and repeated 16-bit patterns', () => {
  for (const query of ['AAAA', 'LEVEL']) {
    const candidate = encode16(query, 0x3000, 'little-endian')
    assert.deepEqual(offsets(search16(candidate, query, 'little-endian')), [0])
  }
})

test('supports BMP Unicode symbols as abstract 16-bit values', () => {
  const query = 'Áçあ'
  const candidate = encode16(query, 0x2000, 'big-endian')
  const [result] = search16(candidate, query, 'big-endian')

  assert.deepEqual(
    result.mappings.map(({ character }) => character),
    Array.from(query)
  )
})

test('reduces code points above U+FFFF modulo 65536', () => {
  const astralB = String.fromCodePoint(0x10042)
  const query = `A${astralB}C`
  const candidate = concat(
    writeUint16(0x8140, 'big-endian'),
    writeUint16(0x8141, 'big-endian'),
    writeUint16(0x8142, 'big-endian')
  )
  const [result] = search16(candidate, query, 'big-endian')

  assert.deepEqual(result.mappings, [
    { character: 'A', value: 0x8140 },
    { character: astralB, value: 0x8141 },
    { character: 'C', value: 0x8142 }
  ])
})

test('ignores odd trailing bytes and incomplete final uint16 windows', () => {
  const complete = encode16('ABC', 0x4000, 'little-endian')
  assert.deepEqual(
    offsets(search16(concat(complete, Uint8Array.of(0xff)), 'ABC', 'little-endian')),
    [0]
  )
  assert.deepEqual(search16(complete.subarray(0, complete.length - 1), 'ABC', 'little-endian'), [])
})

test('finds occurrences at the beginning, end and multiple byte offsets', () => {
  const candidate = encode16('ABC', 0x6000, 'big-endian')
  const input = concat(candidate, Uint8Array.of(0xff, 0xee), candidate)

  assert.deepEqual(offsets(search16(input, 'ABC', 'big-endian')), [0, 8])
})

test('supports overlapping 16-bit windows when alignment is 1', () => {
  const input = new Uint8Array(7).fill(0x81)
  assert.deepEqual(offsets(search16(input, 'AAA', 'little-endian')), [0, 1])
})

test('keeps value width independent from absolute byte alignment', () => {
  const candidate = encode16('ABC', 0x6000, 'little-endian')
  const input = concat(Uint8Array.of(0xff), candidate, Uint8Array.of(0xee), candidate)

  assert.deepEqual(offsets(search16(input, 'ABC', 'little-endian')), [1, 8])
  assert.deepEqual(offsets(search16(input, 'ABC', 'little-endian', { alignment: 2 })), [8])
})

test('uses byte-based half-open ranges and maxResults', () => {
  const candidate = encode16('ABC', 0x7000, 'big-endian')
  const input = concat(candidate, Uint8Array.of(0), candidate, Uint8Array.of(0), candidate)

  assert.deepEqual(offsets(search16(input, 'ABC', 'big-endian', { startOffset: 1 })), [7, 14])
  assert.deepEqual(offsets(search16(input, 'ABC', 'big-endian', { endOffset: 13 })), [0, 7])
  assert.deepEqual(offsets(search16(input, 'ABC', 'big-endian', { maxResults: 1 })), [0])
})

test('does not report artificial completion after reaching maxResults', () => {
  const progress: SearchProgress[] = []
  const results = search16(new Uint8Array(100), 'AAA', 'little-endian', {
    maxResults: 1,
    onProgress(value) {
      progress.push(value)
    }
  })

  assert.equal(results.length, 1)
  assert.equal(progress.at(-1)?.processed, 1)
  assert.ok((progress.at(-1)?.percentage ?? 100) < 100)
})

test('preserves the existing short-query policy for 16-bit searches', () => {
  const candidate = encode16('AB', 0x3000, 'little-endian')
  assert.throws(
    () => search16(candidate, 'AB', 'little-endian'),
    (error) => error instanceof RelativeSearchError && error.code === 'QUERY_TOO_SHORT'
  )
  assert.deepEqual(
    offsets(search16(candidate, 'AB', 'little-endian', { allowTwoSymbolQuery: true })),
    [0]
  )
})

test('supports cancellation before and during a 16-bit search', () => {
  const before = new AbortController()
  before.abort()
  assert.throws(
    () => search16(new Uint8Array(10), 'ABC', 'little-endian', { signal: before.signal }),
    (error) => error instanceof SearchError && error.code === 'SEARCH_ABORTED'
  )

  const during = new AbortController()
  assert.throws(
    () =>
      search16(new Uint8Array(200_000), 'ABC', 'big-endian', {
        signal: during.signal,
        onProgress(progress) {
          if (progress.processed > 0) during.abort()
        }
      }),
    (error) => error instanceof SearchError && error.code === 'SEARCH_ABORTED'
  )
})

test('reports monotonic progress using the count of valid starting windows', () => {
  const progress: SearchProgress[] = []
  search16(new Uint8Array(100_001), 'ABC', 'little-endian', {
    alignment: 2,
    onProgress(value) {
      progress.push(value)
    }
  })

  const expectedTotal = Math.floor((100_001 - 6) / 2) + 1
  assert.equal(progress[0].processed, 0)
  assert.equal(progress[0].total, expectedTotal)
  assert.equal(progress.at(-1)?.processed, expectedTotal)
  assert.equal(progress.at(-1)?.percentage, 100)
  for (let index = 1; index < progress.length; index += 1) {
    assert.ok(progress[index].processed >= progress[index - 1].processed)
  }
})

test('delivers the same 16-bit result type in batches', () => {
  const batches: RelativeSearchResult[][] = []
  const results = search16(new Uint8Array(305), 'AAA', 'little-endian', {
    onResults(batch) {
      batches.push([...batch])
    }
  })

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [128, 128, 44]
  )
  assert.equal(results.length, 300)
})

test('does not mutate 16-bit input or expose it through matchedBytes', () => {
  const input = encode16('ABC', 0x3000, 'big-endian')
  const original = input.slice()
  const [result] = search16(input, 'ABC', 'big-endian')
  result.matchedBytes[0] ^= 0xff

  assert.deepEqual(input, original)
})

test('rejects invalid value width, byte order and incompatible 8-bit options', () => {
  const input = new Uint8Array(8)
  const invalidWidth = { valueWidth: 3 } as unknown as RelativeSearchOptions
  const missingByteOrder = { valueWidth: 2 } as unknown as RelativeSearchOptions
  const invalidByteOrder = {
    valueWidth: 2,
    byteOrder: 'middle-endian'
  } as unknown as RelativeSearchOptions
  const byteOrderFor8Bit = {
    valueWidth: 1,
    byteOrder: 'little-endian'
  } as unknown as RelativeSearchOptions

  assert.throws(
    () => engine.search(input, 'ABC', invalidWidth),
    (error) => error instanceof RelativeSearchError && error.code === 'INVALID_VALUE_WIDTH'
  )
  assert.throws(
    () => engine.search(input, 'ABC', missingByteOrder),
    (error) => error instanceof RelativeSearchError && error.code === 'INVALID_BYTE_ORDER'
  )
  assert.throws(
    () => engine.search(input, 'ABC', invalidByteOrder),
    (error) => error instanceof RelativeSearchError && error.code === 'INVALID_BYTE_ORDER'
  )
  assert.throws(
    () => engine.search(input, 'ABC', byteOrderFor8Bit),
    (error) => error instanceof RelativeSearchError && error.code === 'INCOMPATIBLE_OPTIONS'
  )
})
