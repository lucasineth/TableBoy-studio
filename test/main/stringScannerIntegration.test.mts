import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import test from 'node:test'
import { BinaryDocument } from '../../src/core/binary/index.ts'
import { SearchCoordinator } from '../../src/main/search/SearchCoordinator.ts'
import { sanitizeSearchRequest } from '../../src/main/search/SearchIpcPolicy.ts'
import type { SearchResultBatch } from '../../src/main/search/SearchProtocol.ts'
import { getCharacterEncoding } from '../../src/core/encoding/index.ts'

test('String Scanner uses existing worker sessions, batches, progress and exact multibyte lengths', async () => {
  const coordinator = new SearchCoordinator(
    () =>
      new Worker(new URL('../../src/main/search/searchWorker.ts', import.meta.url), {
        execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types']
      })
  )
  await coordinator.start()
  try {
    const bytes = getCharacterEncoding('shift-jis').encode('あいうえ')
    await coordinator.loadDocument('synthetic', new BinaryDocument(bytes))
    const batches: SearchResultBatch[] = []
    const progress: number[] = []
    const request = sanitizeSearchRequest(
      { type: 'strings', options: { encoding: 'shift-jis', minLength: 4 } },
      bytes.length
    )
    const job = coordinator.search('synthetic', request, {
      onResults: (b) => batches.push(b),
      onProgress: (p) => progress.push(p.percentage)
    })
    assert.equal((await job.completion).resultCount, 1)
    assert.equal(batches[0].searchType, 'strings')
    if (batches[0].searchType === 'strings') {
      assert.equal(batches[0].results[0].text, 'あいうえ')
      assert.equal(batches[0].results[0].length, 8)
      assert.equal(batches[0].results[0].characterLength, 4)
    }
    assert.equal(progress.at(-1), 100)
    assert.equal(await coordinator.releaseDocument('synthetic'), true)
  } finally {
    await coordinator.dispose()
  }
})

test('String Scanner IPC validates explicit encoding, bounds, boolean filters and lengths', () => {
  assert.deepEqual(sanitizeSearchRequest({ type: 'strings' }, 128), {
    type: 'strings',
    options: {
      encoding: 'ascii',
      minLength: 4,
      maxLength: undefined,
      includeSpaces: undefined,
      includeNumbers: undefined,
      includePunctuation: undefined
    }
  })
  for (const options of [
    { encoding: 'ansi' },
    { minLength: 0 },
    { minLength: 4, maxLength: 3 },
    { includeSpaces: 'yes' },
    { maxResults: 10001 },
    { endOffset: 129 }
  ]) {
    assert.throws(() => sanitizeSearchRequest({ type: 'strings', options }, 128))
  }
  const result = sanitizeSearchRequest(
    { type: 'strings', options: { encoding: 'windows-1252', minLength: 5, includeNumbers: false } },
    128
  )
  assert.equal(result.type, 'strings')
})
