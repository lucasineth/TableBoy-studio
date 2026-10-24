import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCharacterSequence } from '../../src/core/characters/applyCharacterSequence.ts'
import {
  uppercaseCategory,
  lowercaseCategory,
  numbersCategory
} from '../../src/core/characters/CharacterCatalog.ts'
import { createTableEntryMap } from '../../src/core/table/TableDocument.ts'
import {
  createEditorState,
  editorReducer,
  isEditorModified
} from '../../src/renderer/src/state/editorState.ts'

test('alphabet and numeric categories fill the entire sequence from the selected address', () => {
  for (const category of [uppercaseCategory, lowercaseCategory, numbersCategory]) {
    assert.equal(category.behavior, 'sequential')
    const result = applyCharacterSequence([], 0x40, category.characters)
    assert.ok(result.ok)
    assert.equal(result.startAddress, 0x40)
    assert.equal(result.endAddress, 0x40 + category.characters.length - 1)
    assert.deepEqual(
      result.entries.map((entry) => entry.value),
      category.characters.map((option) => option.value)
    )
    assert.deepEqual(
      result.entries.map((entry) => entry.key[0]),
      category.characters.map((_, index) => 0x40 + index)
    )
  }
})

test('sequential fill preserves unrelated entries, original input and overwritten comments', () => {
  const initial = [
    { key: [0x39], value: 'before' },
    { key: [0x40], value: 'old', comment: 'preserved' },
    { key: [0x5a], value: 'after' }
  ]
  const snapshot = structuredClone(initial)
  const result = applyCharacterSequence(initial, 0x40, uppercaseCategory.characters)
  assert.ok(result.ok)
  assert.deepEqual(result.overwrittenAddresses, [0x40])
  const map = createTableEntryMap(result.entries, '8-bit')
  assert.equal(map.get(0x39)?.value, 'before')
  assert.equal(map.get(0x40)?.comment, 'preserved')
  assert.equal(map.get(0x59)?.value, 'Z')
  assert.equal(map.get(0x5a)?.value, 'after')
  assert.deepEqual(initial, snapshot)
})

test('sequential fill ends exactly at FF/FFFF or rejects overflow without partial results', () => {
  for (const [mode, end] of [
    ['8-bit', 0xff],
    ['16-bit', 0xffff]
  ] as const) {
    const fit = applyCharacterSequence([], end - 9, numbersCategory.characters, mode)
    assert.ok(fit.ok)
    assert.equal(fit.endAddress, end)
    assert.equal(fit.entries.at(-1)?.value, '9')
    const overflow = applyCharacterSequence([], end - 8, numbersCategory.characters, mode)
    assert.deepEqual(overflow, { ok: false, availableCells: 9, requiredCells: 10 })
  }
})

test('16-bit automatic filling crosses pages with full keys', () => {
  const result = applyCharacterSequence([], 0x81fa, uppercaseCategory.characters, '16-bit')
  assert.ok(result.ok)
  const map = createTableEntryMap(result.entries, '16-bit')
  assert.equal(map.get(0x81fa)?.value, 'A')
  assert.equal(map.get(0x81ff)?.value, 'F')
  assert.equal(map.get(0x8200)?.value, 'G')
  assert.equal(map.get(0x8213)?.value, 'Z')
})

test('one Undo/Redo transaction restores the entire automatic fill and overwritten values', () => {
  const initial = createEditorState({ mode: '8-bit', entries: [{ key: [0x40], value: 'old' }] })
  const result = applyCharacterSequence(initial.entries, 0x40, numbersCategory.characters)
  assert.ok(result.ok)
  const filled = editorReducer(initial, { type: 'APPLY_ENTRIES', entries: result.entries })
  assert.equal(filled.past.length, 1)
  assert.equal(isEditorModified(filled), true)
  const undone = editorReducer(filled, { type: 'UNDO' })
  assert.deepEqual(undone.entries, initial.entries)
  assert.equal(isEditorModified(undone), false)
  assert.deepEqual(editorReducer(undone, { type: 'REDO' }).entries, result.entries)
})
