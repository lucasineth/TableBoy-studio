import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createEditorState,
  editorReducer,
  isEditorModified
} from '../../src/renderer/src/state/editorState.ts'

test('new documents are empty, untitled and unmodified', () => {
  const populated = createEditorState([{ key: [0x41], value: 'A' }], 'example.tbl')
  const modified = editorReducer(populated, { type: 'SET_VALUE', byte: 0x42, value: 'B' })
  const state = editorReducer(modified, { type: 'NEW' })

  assert.deepEqual(state.entries, [])
  assert.equal(state.filePath, null)
  assert.equal(state.fileName, 'Untitled.tbl')
  assert.equal(isEditorModified(state), false)
  assert.deepEqual(state.past, [])
  assert.deepEqual(state.future, [])
})

test('loading resets history and saving records the current document revision', () => {
  const edited = editorReducer(createEditorState(), {
    type: 'SET_VALUE',
    byte: 0x41,
    value: 'A'
  })
  const loaded = editorReducer(edited, {
    type: 'LOAD',
    entries: [{ key: [0xf1], value: 'Ã' }],
    filePath: 'C:/tables/portuguese.tbl',
    fileName: 'portuguese.tbl'
  })

  assert.equal(isEditorModified(loaded), false)
  assert.deepEqual(loaded.past, [])
  assert.deepEqual(loaded.future, [])

  const changed = editorReducer(loaded, { type: 'SET_VALUE', byte: 0xf1, value: 'Á' })
  assert.equal(isEditorModified(changed), true)

  const saved = editorReducer(changed, {
    type: 'MARK_SAVED',
    filePath: 'C:/tables/saved.tbl',
    fileName: 'saved.tbl'
  })
  assert.equal(isEditorModified(saved), false)
  assert.equal(saved.fileName, 'saved.tbl')
})

test('undo, redo and editing after undo preserve an unambiguous modified state', () => {
  const initial = createEditorState([{ key: [0x41], value: 'A' }], 'letters.tbl')
  const firstEdit = editorReducer(initial, { type: 'SET_VALUE', byte: 0x41, value: 'B' })
  const saved = editorReducer(firstEdit, {
    type: 'MARK_SAVED',
    filePath: 'C:/tables/letters.tbl',
    fileName: 'letters.tbl'
  })
  const secondEdit = editorReducer(saved, { type: 'SET_VALUE', byte: 0x41, value: 'C' })
  const undone = editorReducer(secondEdit, { type: 'UNDO' })

  assert.equal(undone.entries[0].value, 'B')
  assert.equal(isEditorModified(undone), false)

  const redone = editorReducer(undone, { type: 'REDO' })
  assert.equal(redone.entries[0].value, 'C')
  assert.equal(isEditorModified(redone), true)

  const branched = editorReducer(undone, { type: 'SET_VALUE', byte: 0x41, value: 'D' })
  assert.equal(branched.entries[0].value, 'D')
  assert.equal(isEditorModified(branched), true)
  assert.deepEqual(branched.future, [])
})
