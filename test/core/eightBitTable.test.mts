import assert from 'node:assert/strict'
import test from 'node:test'

import { byteFromPosition, positionFromByte, setEightBitValue } from '../../src/core/table/index.ts'
import {
  characterCatalog,
  lowercaseCategory,
  numbersCategory,
  portugueseCategory,
  punctuationCategory,
  uppercaseCategory
} from '../../src/core/characters/CharacterCatalog.ts'
import {
  createEditorState,
  editorReducer,
  isEditorModified
} from '../../src/renderer/src/state/editorState.ts'

test('converts between matrix positions and 8-bit values', () => {
  assert.equal(byteFromPosition(0x4, 0x1), 0x41)
  assert.equal(byteFromPosition(0xf, 0xf), 0xff)
  assert.deepEqual(positionFromByte(0xf1), { row: 0xf, column: 0x1 })
})

test('catalog exposes character options without byte assignments', () => {
  assert.deepEqual(
    uppercaseCategory.characters.map((option) => option.value),
    Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  )
  assert.ok(characterCatalog.every((category) => !('key' in category) && !('byte' in category)))
  assert.ok(
    characterCatalog
      .flatMap((category) => category.characters)
      .every((option) => !('key' in option) && !('byte' in option))
  )
})

test('Portuguese catalog contains the requested uppercase and lowercase characters', () => {
  assert.equal(portugueseCategory.characters.length, 26)
  assert.deepEqual(
    portugueseCategory.characters.find((option) => option.value === 'Ã'),
    {
      value: 'Ã',
      unicode: 'U+00C3'
    }
  )
  assert.deepEqual(portugueseCategory.characters.at(-1), {
    value: 'ç',
    unicode: 'U+00E7'
  })
})

test('Japanese catalogs contain translation-relevant base and extended kana', () => {
  const hiragana = characterCatalog.find((category) => category.id === 'hiragana')
  const katakana = characterCatalog.find((category) => category.id === 'katakana')
  assert.ok(hiragana)
  assert.ok(katakana)
  assert.equal(hiragana.characters.length, 80)
  assert.equal(katakana.characters.length, 80)
  assert.equal(
    hiragana.characters.some((option) => option.value === '->'),
    false
  )
  assert.equal(
    hiragana.characters.some((option) => option.value === 'も'),
    true
  )
  assert.equal(
    hiragana.characters.some((option) => option.value === 'が'),
    true
  )
  assert.equal(
    katakana.characters.some((option) => option.value === 'ッ'),
    true
  )
})

test('punctuation catalog contains useful translation glyphs without byte assignments', () => {
  const values = punctuationCategory.characters.map((option) => option.value)

  assert.ok(['!', '…', '“', '♂', '▶', '。', 'ー'].every((value) => values.includes(value)))
  assert.equal(values.includes(' '), false)
  assert.equal(values.includes('\u3000'), false)
})

test('selected byte, not the catalog, determines the character assignment', () => {
  const option = portugueseCategory.characters.find((character) => character.value === 'Ã')
  assert.ok(option)

  const atF1 = setEightBitValue([], 0xf1, option.value)
  const atE5 = setEightBitValue([], 0xe5, option.value)

  assert.deepEqual(atF1, [{ key: [0xf1], value: 'Ã' }])
  assert.deepEqual(atE5, [{ key: [0xe5], value: 'Ã' }])
})

test('every catalog choice changes only the selected byte, including FF', () => {
  for (const category of [
    uppercaseCategory,
    lowercaseCategory,
    numbersCategory,
    portugueseCategory
  ]) {
    const initial = [
      { key: [0xf1], value: 'old' },
      { key: [0xf2], value: 'neighbor' }
    ]
    const option = category.characters[0]
    const updated = setEightBitValue(initial, 0xf1, option.value)
    assert.deepEqual(updated, [
      { key: [0xf1], value: option.value },
      { key: [0xf2], value: 'neighbor' }
    ])
    assert.deepEqual(setEightBitValue([], 0xff, option.value), [
      { key: [0xff], value: option.value }
    ])
  }
})

test('a single catalog selection participates in Undo/Redo and modified state', () => {
  const initial = createEditorState({
    mode: '8-bit',
    entries: [{ key: [0xf2], value: 'unchanged' }]
  })
  const selected = editorReducer(initial, { type: 'SET_VALUE', address: 0xe5, value: 'Ã' })
  assert.equal(selected.past.length, 1)
  assert.equal(isEditorModified(selected), true)
  assert.deepEqual(selected.entries, [
    { key: [0xf2], value: 'unchanged' },
    { key: [0xe5], value: 'Ã' }
  ])
  const undone = editorReducer(selected, { type: 'UNDO' })
  assert.deepEqual(undone.entries, initial.entries)
  assert.equal(isEditorModified(undone), false)
  assert.deepEqual(editorReducer(undone, { type: 'REDO' }).entries, selected.entries)
})

test('Japanese selection preserves a 16-bit address without touching its neighbor', () => {
  const initial = createEditorState({
    mode: '16-bit',
    entries: [{ key: [0x81, 0x41], value: 'neighbor' }]
  })
  const option = characterCatalog.find((category) => category.id === 'hiragana')!.characters[0]
  const selected = editorReducer(initial, {
    type: 'SET_VALUE',
    address: 0x8140,
    value: option.value
  })
  assert.deepEqual(selected.entries, [
    { key: [0x81, 0x41], value: 'neighbor' },
    { key: [0x81, 0x40], value: 'あ' }
  ])
})
