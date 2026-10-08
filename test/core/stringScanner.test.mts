import assert from 'node:assert/strict'
import test from 'node:test'
import { StringScanner, StringScannerError } from '../../src/core/search/index.ts'
import { getCharacterEncoding } from '../../src/core/encoding/index.ts'

const scanner = new StringScanner()
const ascii = (text: string) => Uint8Array.from(Array.from(text, (symbol) => symbol.charCodeAt(0)))

test('String Scanner finds maximal ASCII runs with absolute byte offsets and exact bytes', () => {
  const bytes = ascii('\0HELLO WORLD\0ABC\0TEST\0')
  const results = scanner.scan(bytes)
  assert.deepEqual(
    results.map((r) => [r.offset, r.text, r.characterLength, r.length]),
    [
      [1, 'HELLO WORLD', 11, 11],
      [17, 'TEST', 4, 4]
    ]
  )
  assert.equal(results[0].encoding, 'ascii')
  assert.deepEqual(results[0].matchedBytes, ascii('HELLO WORLD'))
  assert.equal(results[0].previewTruncated, false)
})

test('String Scanner supports empty input, minimum length, optional maximum and EOF', () => {
  assert.deepEqual(scanner.scan(new Uint8Array()), [])
  assert.deepEqual(scanner.scan(ascii('ABC')), [])
  assert.equal(scanner.scan(ascii('ABCD'))[0].text, 'ABCD')
  assert.deepEqual(scanner.scan(ascii('ABCDE'), { maxLength: 4 }), [])
  assert.equal(scanner.scan(ascii('ABCDE'), { minLength: 5, maxLength: 5 }).length, 1)
})

test('String Scanner filters consistently split runs and exclude controls', () => {
  assert.deepEqual(
    scanner
      .scan(ascii('AB CD12!EF'), {
        minLength: 2,
        includeSpaces: false,
        includeNumbers: false,
        includePunctuation: false
      })
      .map((r) => r.text),
    ['AB', 'CD', 'EF']
  )
  assert.deepEqual(
    scanner.scan(ascii('AB\nCD\tEF'), { minLength: 2 }).map((r) => r.text),
    ['AB', 'CD', 'EF']
  )
})

for (const encoding of ['windows-1252', 'cp437', 'cp850', 'shift-jis'] as const) {
  test(`String Scanner uses the existing strict ${encoding} codec`, () => {
    const text =
      encoding === 'shift-jis'
        ? 'あいうえｶﾀｶﾅ漢字。'
        : encoding === 'cp437'
          ? 'CAFÉ!'
          : encoding === 'cp850'
            ? 'AÇÃO!'
            : 'AÇÃO €!'
    const bytes = getCharacterEncoding(encoding).encode(text)
    const result = scanner.scan(bytes, { encoding })[0]
    assert.equal(result.text, text)
    assert.equal(result.characterLength, Array.from(text).length)
    assert.equal(result.length, bytes.length)
    assert.deepEqual(result.matchedBytes, bytes)
  })
}

test('Shift-JIS invalid and incomplete characters delimit strings without replacement', () => {
  const bytes = Uint8Array.from([
    ...ascii('HELLO'),
    0x81,
    0x00,
    ...getCharacterEncoding('shift-jis').encode('あいうえ'),
    0x81
  ])
  assert.deepEqual(
    scanner.scan(bytes, { encoding: 'shift-jis' }).map((r) => r.text),
    ['HELLO', 'あいうえ']
  )
  assert.deepEqual(scanner.scan(Uint8Array.of(0x81), { encoding: 'shift-jis', minLength: 1 }), [])
  assert.deepEqual(
    scanner.scan(Uint8Array.of(0x81, 0x40), {
      encoding: 'shift-jis',
      minLength: 1,
      includeSpaces: false
    }),
    []
  )
})

test('String Scanner range, absolute alignment and maxResults preserve maximal strings', () => {
  const bytes = ascii('0HELLO\0WORLD\0TEST')
  assert.deepEqual(
    scanner.scan(bytes, { startOffset: 1, endOffset: 12, alignment: 1 }).map((r) => r.offset),
    [1, 7]
  )
  assert.deepEqual(
    scanner.scan(bytes, { alignment: 4 }).map((r) => r.offset),
    [0]
  )
  assert.equal(scanner.scan(bytes, { maxResults: 1 }).length, 1)
})

test('String Scanner bounds previews without shortening full lengths or copying large runs', () => {
  const bytes = new Uint8Array(1024 * 1024).fill(65)
  const result = scanner.scan(bytes)[0]
  assert.equal(result.characterLength, bytes.length)
  assert.equal(result.length, bytes.length)
  assert.equal(result.text.length, 256)
  assert.equal(result.matchedBytes.length, 256)
  assert.equal(result.previewTruncated, true)
  result.matchedBytes[0] = 0
  assert.equal(bytes[0], 65)
  const japanese = getCharacterEncoding('shift-jis').encode('あ'.repeat(300))
  const preview = scanner.scan(japanese, { encoding: 'shift-jis' })[0]
  assert.equal(preview.matchedBytes.length, 512)
  assert.equal(preview.text, 'あ'.repeat(256))
  assert.equal(preview.length, 600)
})

test('String Scanner reuses monotonic progress, batches and cancellation', () => {
  const bytes = ascii('TEST\0'.repeat(260))
  const progress: number[] = []
  const batches: number[] = []
  const results = scanner.scan(bytes, {
    onProgress: (p) => progress.push(p.processed),
    onResults: (r) => batches.push(r.length)
  })
  assert.equal(results.length, 260)
  assert.deepEqual(batches, [128, 128, 4])
  assert.equal(progress.at(-1), bytes.length)
  assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]))
  const abort = new AbortController()
  assert.throws(
    () =>
      scanner.scan(new Uint8Array(64 * 1024).fill(65), {
        signal: abort.signal,
        onProgress: (p) => {
          if (p.processed > 0) abort.abort()
        }
      }),
    { code: 'SEARCH_ABORTED' }
  )
  assert.throws(() => scanner.scan(bytes, { signal: abort.signal }), { code: 'SEARCH_ABORTED' })
})

test('String Scanner validates encoding, lengths, ranges, alignment and results', () => {
  const input = ascii('HELLO')
  assert.throws(() => scanner.scan(input, { encoding: 'ansi' as never }), StringScannerError)
  for (const minLength of [0, -1, 1.5])
    assert.throws(() => scanner.scan(input, { minLength }), { code: 'INVALID_STRING_LENGTH' })
  assert.throws(() => scanner.scan(input, { minLength: 4, maxLength: 3 }), {
    code: 'INVALID_STRING_LENGTH'
  })
  assert.throws(() => scanner.scan(input, { endOffset: 6 }), { code: 'INVALID_SEARCH_RANGE' })
  assert.throws(() => scanner.scan(input, { alignment: 0 }), { code: 'INVALID_ALIGNMENT' })
  assert.throws(() => scanner.scan(input, { maxResults: 0 }), { code: 'INVALID_MAX_RESULTS' })
})

test('String Scanner limits results without reporting a completed scan and preserves input', () => {
  const bytes = ascii('HELLO\0WORLD\0')
  const snapshot = bytes.slice()
  const percentages: number[] = []
  scanner.scan(bytes, { maxResults: 1, onProgress: (p) => percentages.push(p.percentage) })
  assert.ok(percentages.at(-1)! < 100)
  assert.deepEqual(bytes, snapshot)
  assert.deepEqual(scanner.scan(Uint8Array.of(0x80, 0xff, 0x7f), { minLength: 1 }), [])
})
