import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CharacterEncodingError,
  cp437,
  cp850,
  getCharacterEncoding,
  shiftJis,
  windows1252
} from '../../src/core/encoding/index.ts'

test('Windows-1252 encodes and decodes ASCII and PT-BR text', () => {
  const text = 'Sample: ação, ÃÕç!'
  const bytes = windows1252.encode(text)

  assert.equal(windows1252.decode(bytes), text)
  assert.deepEqual([...windows1252.encode('Ãç')], [0xc3, 0xe7])
})

test('Windows-1252 maps the 0x80-0x9F region instead of treating it as Latin-1', () => {
  const text = '€“”–—™'
  const bytes = [0x80, 0x93, 0x94, 0x96, 0x97, 0x99]

  assert.deepEqual([...windows1252.encode(text)], bytes)
  assert.equal(windows1252.decode(bytes), text)
})

test('Windows-1252 rejects undefined bytes and unrepresentable characters', () => {
  const invalid = captureEncodingError(() => windows1252.decode([0x41, 0x81]))
  const unsupported = captureEncodingError(() => windows1252.encode('Aあ'))

  assert.equal(invalid.code, 'INVALID_BYTE_SEQUENCE')
  assert.equal(invalid.position, 1)
  assert.deepEqual(invalid.fragment, [0x81])
  assert.equal(unsupported.code, 'UNREPRESENTABLE_CHARACTER')
  assert.equal(unsupported.position, 1)
  assert.equal(unsupported.fragment, 'あ')
})

test('Windows-1252 round-trips every supported sample exactly', () => {
  const text = 'ÀÁÂÃÇÉÊÍÓÔÕÚÜç € “texto” — ™'

  assert.equal(windows1252.decode(windows1252.encode(text)), text)
})

test('CP437 supports its DOS-specific characters and round-trips them', () => {
  const text = 'Çéα∞'
  const expected = [0x80, 0x82, 0xe0, 0xec]

  assert.deepEqual([...cp437.encode('ROM HACK')], [0x52, 0x4f, 0x4d, 0x20, 0x48, 0x41, 0x43, 0x4b])
  assert.deepEqual([...cp437.encode(text)], expected)
  assert.equal(cp437.decode(expected), text)
})

test('CP850 supports PT-BR characters and differs explicitly from CP437', () => {
  const portuguese = 'ãõáéíóú'

  assert.deepEqual([...cp850.encode(portuguese)], [0xc6, 0xe4, 0xa0, 0x82, 0xa1, 0xa2, 0xa3])
  assert.equal(cp850.decode(cp850.encode(portuguese)), portuguese)
  assert.equal(cp437.decode([0x9b]), '¢')
  assert.equal(cp850.decode([0x9b]), 'ø')
})

test('OEM encodings reject characters outside their code pages', () => {
  const cp437Error = captureEncodingError(() => cp437.encode('ã'))
  const cp850Error = captureEncodingError(() => cp850.encode('α'))

  assert.equal(cp437Error.code, 'UNREPRESENTABLE_CHARACTER')
  assert.equal(cp850Error.code, 'UNREPRESENTABLE_CHARACTER')
})

test('Shift-JIS supports ASCII, Japanese scripts, Kanji and punctuation', () => {
  const text = 'ASCIIあアｶ漢。'
  const expected = [
    0x41, 0x53, 0x43, 0x49, 0x49, 0x82, 0xa0, 0x83, 0x41, 0xb6, 0x8a, 0xbf, 0x81, 0x42
  ]

  assert.deepEqual([...shiftJis.encode(text)], expected)
  assert.equal(shiftJis.decode(expected), text)
})

test('Shift-JIS distinguishes invalid and incomplete byte sequences', () => {
  const invalidSingle = captureEncodingError(() => shiftJis.decode([0x80]))
  const invalidPair = captureEncodingError(() => shiftJis.decode([0x81, 0x30]))
  const incomplete = captureEncodingError(() => shiftJis.decode([0x82]))

  assert.equal(invalidSingle.code, 'INVALID_BYTE_SEQUENCE')
  assert.equal(invalidSingle.position, 0)
  assert.equal(invalidPair.code, 'INVALID_BYTE_SEQUENCE')
  assert.deepEqual(invalidPair.fragment, [0x81, 0x30])
  assert.equal(incomplete.code, 'INCOMPLETE_BYTE_SEQUENCE')
  assert.deepEqual(incomplete.fragment, [0x82])
})

test('Shift-JIS rejects unrepresentable text and round-trips valid text', () => {
  const text = 'ポケモン・漢字'
  const error = captureEncodingError(() => shiftJis.encode('あ😀'))

  assert.equal(error.code, 'UNREPRESENTABLE_CHARACTER')
  assert.equal(error.position, 1)
  assert.equal(error.fragment, '😀')
  assert.equal(shiftJis.decode(shiftJis.encode(text)), text)
})

test('Shift-JIS encodes standard yen and overline aliases to their canonical bytes', () => {
  assert.deepEqual([...shiftJis.encode('¥‾')], [0x5c, 0x7e])
  assert.equal(shiftJis.decode([0x5c, 0x7e]), '\\~')
})

test('character encoding registry requires an explicit code page', () => {
  assert.equal(getCharacterEncoding('WINDOWS-1252'), windows1252)
  assert.equal(getCharacterEncoding(' cp850 '), cp850)

  const ansi = captureEncodingError(() => getCharacterEncoding('ANSI'))
  const unknown = captureEncodingError(() => getCharacterEncoding('made-up'))
  assert.equal(ansi.code, 'UNKNOWN_ENCODING')
  assert.match(ansi.reason, /does not identify a single encoding/)
  assert.equal(unknown.code, 'UNKNOWN_ENCODING')
})

test('known encodings do not normalize Unicode implicitly', () => {
  assert.deepEqual([...windows1252.encode('é')], [0xe9])

  const decomposed = captureEncodingError(() => windows1252.encode('e\u0301'))
  assert.equal(decomposed.code, 'UNREPRESENTABLE_CHARACTER')
  assert.equal(decomposed.position, 1)
})

function captureEncodingError(operation: () => unknown): CharacterEncodingError {
  try {
    operation()
    assert.fail('Expected operation to throw CharacterEncodingError.')
  } catch (error) {
    assert.ok(error instanceof CharacterEncodingError)
    return error
  }
}
