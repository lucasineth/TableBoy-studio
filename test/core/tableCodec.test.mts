import assert from 'node:assert/strict'
import test from 'node:test'

import { TableCodecError, TableDecoder, TableEncoder } from '../../src/core/codec/index.ts'
import { TableParser, type TableEntry } from '../../src/core/table/index.ts'

const encoder = new TableEncoder()
const decoder = new TableDecoder()

test('encodes and decodes an 8-bit table', () => {
  const entries = parseEntries('41=A\n42=B\n43=C')

  assert.deepEqual([...encoder.encode('ABC', entries)], [0x41, 0x42, 0x43])
  assert.equal(decoder.decode([0x41, 0x42, 0x43], entries), 'ABC')
})

test('encodes and decodes a 16-bit table without changing byte order', () => {
  const entries = parseEntries('8140=Á\n8141=É\n8142=Õ')

  assert.deepEqual([...encoder.encode('ÁÉÕ', entries)], [0x81, 0x40, 0x81, 0x41, 0x81, 0x42])
  assert.equal(decoder.decode([0x81, 0x40, 0x81, 0x41, 0x81, 0x42], entries), 'ÁÉÕ')
})

test('supports variable-width keys, tokens and Japanese characters', () => {
  const entries = parseEntries('41=A\n42=B\n43=C\n8140=Á\nF100=[PLAYER]\nABCDEF=あ')
  const expected = [0x41, 0x42, 0x43, 0x81, 0x40, 0xf1, 0x00, 0xab, 0xcd, 0xef]

  assert.deepEqual([...encoder.encode('ABCÁ[PLAYER]あ', entries)], expected)
  assert.equal(decoder.decode(expected, entries), 'ABCÁ[PLAYER]あ')
})

test('uses longest-match for overlapping text and byte sequences', () => {
  const entries = parseEntries('41=A\n4142=AB\n42=B')

  assert.deepEqual([...encoder.encode('AB', entries)], [0x41, 0x42])
  assert.equal(decoder.decode([0x41, 0x42], entries), 'AB')
  assert.equal(decoder.decode([0x41], entries), 'A')
})

test('preserves exact Unicode without implicit normalization', () => {
  const entries = parseEntries('01=é\n02=あ\n03=ã')

  assert.deepEqual([...encoder.encode('éあã', entries)], [0x01, 0x02, 0x03])
  assert.equal(decoder.decode([0x01, 0x02, 0x03], entries), 'éあã')

  const error = captureCodecError(() => encoder.encode('e\u0301', entries))
  assert.equal(error.code, 'UNMAPPED_TEXT')
  assert.equal(error.position, 0)
  assert.equal(error.fragment, 'é')
})

test('empty input returns empty output even with an empty table', () => {
  assert.deepEqual([...encoder.encode('', [])], [])
  assert.equal(decoder.decode([], []), '')
})

test('non-empty input rejects an empty table', () => {
  assert.equal(captureCodecError(() => encoder.encode('A', [])).code, 'EMPTY_TABLE')
  assert.equal(captureCodecError(() => decoder.decode([0x41], [])).code, 'EMPTY_TABLE')
})

test('encoder reports the position, fragment and reason for unmapped text', () => {
  const entries = parseEntries('41=A')
  const error = captureCodecError(() => encoder.encode('AΩ!', entries))

  assert.equal(error.code, 'UNMAPPED_TEXT')
  assert.equal(error.position, 1)
  assert.equal(error.fragment, 'Ω!')
  assert.match(error.reason, /position 1/)
})

test('decoder distinguishes unknown bytes from incomplete sequences', () => {
  const entries = parseEntries('41=A\n8140=Á')
  const unknown = captureCodecError(() => decoder.decode([0x41, 0xff], entries))
  const incomplete = captureCodecError(() => decoder.decode([0x81], entries))

  assert.equal(unknown.code, 'UNKNOWN_BYTE')
  assert.equal(unknown.position, 1)
  assert.deepEqual(unknown.fragment, [0xff])
  assert.equal(incomplete.code, 'INCOMPLETE_SEQUENCE')
  assert.equal(incomplete.position, 0)
  assert.deepEqual(incomplete.fragment, [0x81])
})

test('encoder rejects duplicate text values mapped to different keys', () => {
  const entries = parseEntries('41=A\n42=A')
  const error = captureCodecError(() => encoder.encode('A', entries))

  assert.equal(error.code, 'AMBIGUOUS_VALUE')
  assert.deepEqual(error.entryIndexes, [0, 1])
})

test('decoder permits repeated text values when the byte keys are unambiguous', () => {
  const entries = parseEntries('41=A\n42=A')

  assert.equal(decoder.decode([0x41, 0x42], entries), 'AA')
})

test('decoder rejects duplicate byte keys instead of choosing arbitrarily', () => {
  const entries: TableEntry[] = [
    { key: [0x41], value: 'A' },
    { key: [0x41], value: 'B' }
  ]
  const error = captureCodecError(() => decoder.decode([0x41], entries))

  assert.equal(error.code, 'INVALID_TABLE')
  assert.deepEqual(error.entryIndexes, [0, 1])
})

test('decoder rejects invalid numeric byte input without truncating it', () => {
  const entries = parseEntries('41=A')
  const error = captureCodecError(() => decoder.decode([0x141], entries))

  assert.equal(error.code, 'INVALID_INPUT_BYTE')
  assert.equal(error.position, 0)
  assert.deepEqual(error.fragment, [0x141])
})

test('round-trips text through bytes when the table is unambiguous', () => {
  const entries = parseEntries('41=A\n42=B\n8140=Á\nF100=[PLAYER]\nABCDEF=あ')
  const text = 'ABÁ[PLAYER]あ'

  assert.equal(decoder.decode(encoder.encode(text, entries), entries), text)
})

test('round-trips bytes through text when the table is unambiguous', () => {
  const entries = parseEntries('41=A\n42=B\n8140=Á\nF100=[PLAYER]\nABCDEF=あ')
  const bytes = Uint8Array.from([0x41, 0x42, 0x81, 0x40, 0xf1, 0x00, 0xab, 0xcd, 0xef])

  assert.deepEqual([...encoder.encode(decoder.decode(bytes, entries), entries)], [...bytes])
})

function parseEntries(source: string): TableEntry[] {
  const result = new TableParser().parse(source)
  assert.deepEqual(result.errors, [])
  return result.entries
}

function captureCodecError(operation: () => unknown): TableCodecError {
  try {
    operation()
    assert.fail('Expected operation to throw TableCodecError.')
  } catch (error) {
    assert.ok(error instanceof TableCodecError)
    return error
  }
}
