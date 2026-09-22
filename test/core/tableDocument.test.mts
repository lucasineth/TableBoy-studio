import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addressFromKey,
  addressFromPagePosition,
  createTableEntryMap,
  formatTableAddress,
  keyFromAddress,
  pagesInDocument,
  setTableValue
} from '../../src/core/table/index.ts'
import {
  parseTableDocument,
  serializeTableDocument
} from '../../src/renderer/src/services/tableDocument.ts'

test('detects, edits and round-trips an 8-bit document', () => {
  const parsed = parseTableDocument('41=A\nFF=[END]')

  assert.deepEqual(parsed.errors, [])
  assert.ok(parsed.document)
  assert.equal(parsed.document.mode, '8-bit')

  const edited = {
    ...parsed.document,
    entries: setTableValue(parsed.document.entries, 0x42, 'B', parsed.document.mode)
  }
  const serialized = serializeTableDocument(edited)
  const reparsed = parseTableDocument(serialized)

  assert.equal(serialized, '41=A\nFF=[END]\n42=B')
  assert.deepEqual(reparsed.document, edited)
})

test('detects 16-bit pages and preserves full keys through edit and round-trip', () => {
  const source = ['8140=A', '8141=B', '81FF=C', '8200=D'].join('\n')
  const parsed = parseTableDocument(source)

  assert.deepEqual(parsed.errors, [])
  assert.ok(parsed.document)
  assert.equal(parsed.document.mode, '16-bit')
  assert.deepEqual(pagesInDocument(parsed.document), [0x81, 0x82])
  assert.equal(
    createTableEntryMap(parsed.document.entries, parsed.document.mode).get(0x81ff)?.value,
    'C'
  )

  const edited = {
    ...parsed.document,
    entries: setTableValue(parsed.document.entries, 0x8142, 'あ', parsed.document.mode)
  }
  const serialized = serializeTableDocument(edited)
  const reparsed = parseTableDocument(serialized)

  assert.match(serialized, /^8140=A/m)
  assert.match(serialized, /^8142=あ/m)
  assert.deepEqual(reparsed.errors, [])
  assert.deepEqual(reparsed.document, edited)
})

test('maps 16-bit pages and addresses without truncation', () => {
  assert.equal(addressFromPagePosition(0x81, 0x4, 0x0, '16-bit'), 0x8140)
  assert.equal(formatTableAddress(0xffff, '16-bit'), 'FFFF')
  assert.deepEqual(keyFromAddress(0x0100, '16-bit'), [0x01, 0x00])
  assert.equal(addressFromKey([0x82, 0x00], '16-bit'), 0x8200)
  assert.throws(() => keyFromAddress(0x10000, '16-bit'), RangeError)
})

test('rejects mixed 8-bit and 16-bit keys without discarding entries', () => {
  const parsed = parseTableDocument('41=A\n8140=あ')

  assert.equal(parsed.document, null)
  assert.deepEqual(
    parsed.errors.map((error) => error.message),
    ['A table cannot mix 8-bit and 16-bit keys in the same document.']
  )
})

test('rejects keys outside the supported 16-bit document range', () => {
  const parsed = parseTableDocument('010000=A')

  assert.equal(parsed.document, null)
  assert.deepEqual(
    parsed.errors.map((error) => error.message),
    ['The 8-bit/16-bit editor accepts only keys containing exactly one or two bytes.']
  )
})

test('empty documents default to 8-bit mode', () => {
  const parsed = parseTableDocument('')

  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(parsed.document, { mode: '8-bit', entries: [] })
  assert.equal(serializeTableDocument(parsed.document), '')
})

test('reports invalid hexadecimal, odd keys and duplicates before mode detection', () => {
  const parsed = parseTableDocument('GG=A\n10000=B\n8140=C\n8140=D')

  assert.equal(parsed.document, null)
  assert.deepEqual(
    parsed.errors.map((error) => error.message),
    [
      'Table key must contain only hexadecimal digits.',
      'Table key must contain a whole number of bytes.',
      'Duplicate key 8140.'
    ]
  )
})

test('preserves Unicode values in a 16-bit document', () => {
  const source = '8140=　\n8141=、\n8142=。\n82A0=あ'
  const first = parseTableDocument(source)

  assert.ok(first.document)
  const serialized = serializeTableDocument(first.document)
  const second = parseTableDocument(serialized)

  assert.equal(serialized, source)
  assert.deepEqual(second.document, first.document)
})
