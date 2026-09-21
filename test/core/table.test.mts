import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TableParser,
  TableValidationError,
  TableValidator,
  TableWriter
} from '../../src/core/table/index.ts'

test('parses variable-width key entries and preserves Unicode values', () => {
  const result = new TableParser().parse('41=A\nF1=Ã\n8140=あ\nF001=[PLAYER]\nABCDEF=界')

  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.entries, [
    { key: [0x41], value: 'A' },
    { key: [0xf1], value: 'Ã' },
    { key: [0x81, 0x40], value: 'あ' },
    { key: [0xf0, 0x01], value: '[PLAYER]' },
    { key: [0xab, 0xcd, 0xef], value: '界' }
  ])
})

test('ignores empty and comment-only lines and preserves inline comments', () => {
  const result = new TableParser().parse('# heading\n\n; note\n// another\n41=A # Latin A')

  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.entries, [{ key: [0x41], value: 'A', comment: 'Latin A' }])
})

test('reports malformed lines and duplicate keys with source locations', () => {
  const result = new TableParser().parse('4=A\nGG=B\n42\n41=A\n41=B\n43=')

  assert.deepEqual(
    result.errors.map(({ code, line, duplicateOfLine }) => ({ code, line, duplicateOfLine })),
    [
      { code: 'ODD_LENGTH_KEY', line: 1, duplicateOfLine: undefined },
      { code: 'INVALID_HEX_KEY', line: 2, duplicateOfLine: undefined },
      { code: 'MISSING_SEPARATOR', line: 3, duplicateOfLine: undefined },
      { code: 'DUPLICATE_KEY', line: 5, duplicateOfLine: 4 },
      { code: 'EMPTY_VALUE', line: 6, duplicateOfLine: undefined }
    ]
  )
})

test('uses the first equals sign as separator and preserves a whitespace value', () => {
  const result = new TableParser().parse('20= \n3D===')

  assert.deepEqual(result.errors, [])
  assert.equal(result.entries[0].value, ' ')
  assert.equal(result.entries[1].value, '==')
})

test('writes canonical uppercase hexadecimal and round-trips comments', () => {
  const writer = new TableWriter()
  const source = writer.write([
    { key: [0xab, 0xcd], value: '界' },
    { key: [0x41], value: 'A', comment: 'letter' }
  ])

  assert.equal(source, 'ABCD=界\n41=A # letter')
  assert.deepEqual(new TableParser().parse(source).entries, [
    { key: [0xab, 0xcd], value: '界' },
    { key: [0x41], value: 'A', comment: 'letter' }
  ])
})

test('round-trips Portuguese characters without changing Unicode values', () => {
  const parser = new TableParser()
  const writer = new TableWriter()
  const source = ['F1=Ã', 'F2=Õ', 'F4=ã', 'F5=õ'].join('\n')

  const firstParse = parser.parse(source)
  assert.deepEqual(firstParse.errors, [])

  const serialized = writer.write(firstParse.entries)
  const secondParse = parser.parse(serialized)

  assert.equal(serialized, source)
  assert.deepEqual(secondParse.errors, [])
  assert.deepEqual(secondParse.entries, firstParse.entries)
  assert.deepEqual(
    secondParse.entries.map((entry) => entry.value),
    ['Ã', 'Õ', 'ã', 'õ']
  )
})

test('round-trips an empty table', () => {
  const parser = new TableParser()
  const writer = new TableWriter()

  const serialized = writer.write([])
  const parsed = parser.parse(serialized)

  assert.equal(serialized, '')
  assert.deepEqual(parsed, { entries: [], errors: [] })
})

test('validator rejects invalid bytes and writer refuses invalid tables', () => {
  const entries = [
    { key: [0x100], value: 'A' },
    { key: [0x41], value: 'B' },
    { key: [0x41], value: 'C' }
  ]
  const result = new TableValidator().validate(entries)

  assert.equal(result.valid, false)
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['INVALID_BYTE', 'DUPLICATE_KEY']
  )
  assert.throws(() => new TableWriter().write(entries), TableValidationError)
})
