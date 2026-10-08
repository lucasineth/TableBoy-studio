import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BinarySearchEngine,
  SearchError,
  type SearchProgress,
  type SearchResult
} from '../../src/core/search/index.ts'

const engine = new BinarySearchEngine()

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

function assertSearchError(code: SearchError['code'], action: () => unknown): void {
  assert.throws(action, (error) => error instanceof SearchError && error.code === code)
}

test('returns no results for an empty input', () => {
  assert.deepEqual(engine.search(bytes(), bytes(0xaa)), [])
})

test('rejects an empty pattern', () => {
  assertSearchError('EMPTY_PATTERN', () => engine.search(bytes(0xaa), bytes()))
})

test('returns no results when the pattern is larger than the search range', () => {
  assert.deepEqual(engine.search(bytes(0xaa), bytes(0xaa, 0xbb)), [])
  assert.deepEqual(
    engine.search(bytes(0xaa, 0xbb, 0xcc), bytes(0xaa, 0xbb), {
      startOffset: 1,
      endOffset: 2
    }),
    []
  )
})

test('finds a unique occurrence', () => {
  assert.deepEqual(engine.search(bytes(0x00, 0xaa, 0xbb, 0xff), bytes(0xaa, 0xbb)), [
    { offset: 1, length: 2 }
  ])
})

test('finds occurrences at the beginning and end', () => {
  assert.deepEqual(engine.search(bytes(0xaa, 0xbb, 0x00, 0xaa, 0xbb), bytes(0xaa, 0xbb)), [
    { offset: 0, length: 2 },
    { offset: 3, length: 2 }
  ])
})

test('finds multiple and overlapping occurrences', () => {
  assert.deepEqual(engine.search(bytes(0xaa, 0xaa, 0xaa), bytes(0xaa, 0xaa)), [
    { offset: 0, length: 2 },
    { offset: 1, length: 2 }
  ])
})

test('returns no results when the pattern is absent', () => {
  assert.deepEqual(engine.search(bytes(0x00, 0x01, 0x02), bytes(0xff)), [])
})

test('limits matches to the half-open search range', () => {
  const input = bytes(0xaa, 0xbb, 0xaa, 0xbb, 0xaa, 0xbb)
  assert.deepEqual(engine.search(input, bytes(0xaa, 0xbb), { startOffset: 1, endOffset: 5 }), [
    { offset: 2, length: 2 }
  ])
})

test('stops after maxResults', () => {
  assert.deepEqual(engine.search(bytes(1, 1, 1, 1), bytes(1), { maxResults: 2 }), [
    { offset: 0, length: 1 },
    { offset: 1, length: 1 }
  ])
})

test('alignment 1 permits every offset', () => {
  assert.deepEqual(engine.search(bytes(1, 1, 1), bytes(1), { alignment: 1 }), [
    { offset: 0, length: 1 },
    { offset: 1, length: 1 },
    { offset: 2, length: 1 }
  ])
})

test('alignment 2 and 4 use absolute input offsets', () => {
  const input = bytes(0, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa)
  assert.deepEqual(engine.search(input, bytes(0xaa), { startOffset: 1, alignment: 2 }), [
    { offset: 2, length: 1 },
    { offset: 4, length: 1 },
    { offset: 6, length: 1 },
    { offset: 8, length: 1 }
  ])
  assert.deepEqual(engine.search(input, bytes(0xaa), { startOffset: 1, alignment: 4 }), [
    { offset: 4, length: 1 },
    { offset: 8, length: 1 }
  ])
})

test('rejects cancellation before the search starts', () => {
  const controller = new AbortController()
  controller.abort()
  assertSearchError('SEARCH_ABORTED', () =>
    engine.search(bytes(0xaa), bytes(0xaa), { signal: controller.signal })
  )
})

test('supports cancellation during progress delivery', () => {
  const controller = new AbortController()
  assertSearchError('SEARCH_ABORTED', () =>
    engine.search(new Uint8Array(100_000), bytes(0xff), {
      signal: controller.signal,
      onProgress(progress) {
        if (progress.processed > 0) controller.abort()
      }
    })
  )
})

test('reports bounded monotonic progress and a final state', () => {
  const progress: SearchProgress[] = []
  engine.search(new Uint8Array(1_000_000), bytes(0xff), {
    onProgress(value) {
      progress.push(value)
    }
  })

  assert.ok(progress.length <= 102)
  assert.equal(progress[0]?.processed, 0)
  assert.equal(progress.at(-1)?.processed, progress.at(-1)?.total)
  assert.equal(progress.at(-1)?.percentage, 100)

  for (let index = 1; index < progress.length; index += 1) {
    assert.ok(progress[index].processed >= progress[index - 1].processed)
    assert.ok(progress[index].total === progress[0].total)
    assert.ok(progress[index].percentage >= progress[index - 1].percentage)
    assert.ok(progress[index].processed <= progress[index].total)
  }
})

test('reports completed progress for a range with no candidate positions', () => {
  const progress: SearchProgress[] = []
  engine.search(bytes(), bytes(0xaa), { onProgress: (value) => progress.push(value) })
  assert.deepEqual(progress, [{ processed: 0, total: 0, percentage: 100 }])
})

test('delivers result batches without changing the returned result set', () => {
  const batches: SearchResult[][] = []
  const results = engine.search(new Uint8Array(300), bytes(0), {
    onResults(batch) {
      batches.push([...batch])
    }
  })

  assert.equal(results.length, 300)
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [128, 128, 44]
  )
  assert.deepEqual(batches.flat(), results)
})

test('rejects invalid search ranges', () => {
  const input = bytes(1, 2, 3)
  assertSearchError('INVALID_SEARCH_RANGE', () =>
    engine.search(input, bytes(1), { startOffset: -1 })
  )
  assertSearchError('INVALID_SEARCH_RANGE', () =>
    engine.search(input, bytes(1), { startOffset: 2, endOffset: 1 })
  )
  assertSearchError('INVALID_SEARCH_RANGE', () => engine.search(input, bytes(1), { endOffset: 4 }))
  assertSearchError('INVALID_SEARCH_RANGE', () =>
    engine.search(input, bytes(1), { startOffset: 0.5 })
  )
})

test('rejects invalid alignment and maxResults values', () => {
  const input = bytes(1)
  for (const alignment of [0, -1, 1.5]) {
    assertSearchError('INVALID_ALIGNMENT', () => engine.search(input, bytes(1), { alignment }))
  }
  for (const maxResults of [0, -1, 1.5]) {
    assertSearchError('INVALID_MAX_RESULTS', () => engine.search(input, bytes(1), { maxResults }))
  }
})

test('does not modify the input or pattern', () => {
  const input = bytes(0xaa, 0xbb, 0xaa)
  const pattern = bytes(0xaa)
  const originalInput = input.slice()
  const originalPattern = pattern.slice()

  engine.search(input, pattern)

  assert.deepEqual(input, originalInput)
  assert.deepEqual(pattern, originalPattern)
})
