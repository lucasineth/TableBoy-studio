import assert from 'node:assert/strict'
import test from 'node:test'

import { characterCatalog } from '../../src/core/characters/CharacterCatalog.ts'

function category(id: string) {
  const result = characterCatalog.find((item) => item.id === id)
  assert.ok(result, `Expected category ${id} to exist`)
  return result
}

function values(id: string): string[] {
  return category(id).characters.map((option) => option.value)
}

test('Latin letter and number categories are exact discoverable sequences', () => {
  assert.deepEqual(values('uppercase'), Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'))
  assert.deepEqual(values('lowercase'), Array.from('abcdefghijklmnopqrstuvwxyz'))
  assert.deepEqual(values('numbers'), Array.from('0123456789'))

  for (const id of ['uppercase', 'lowercase', 'numbers']) {
    assert.equal(category(id).ordered, true)
    assert.equal(category(id).discoverable, true)
  }
})

test('Portuguese and Latin Extended characters are available as references', () => {
  assert.ok(values('pt-br').includes('Ç'))
  assert.ok(values('pt-br').includes('ã'))
  assert.ok(values('latin-extended').includes('Æ'))
  assert.ok(values('latin-extended').includes('œ'))
  assert.equal(category('pt-br').discoverable, false)
  assert.equal(category('latin-extended').discoverable, false)
})

test('symbol categories include punctuation, operators, currency, directions and game UI', () => {
  assert.ok(values('punctuation').includes('…'))
  assert.ok(values('punctuation').includes('\\'))
  assert.ok(values('operators').includes('±'))
  assert.ok(values('currency').includes('€'))
  assert.ok(values('directions').includes('←'))
  assert.ok(values('directions').includes('▼'))
  assert.ok(values('shapes').includes('♥'))
  assert.ok(values('shapes').includes('♂'))

  for (const id of ['punctuation', 'operators', 'currency', 'directions', 'shapes']) {
    assert.equal(category(id).ordered, false)
    assert.equal(category(id).discoverable, false)
  }
})

test('Japanese catalogs remain available without enabling discovery', () => {
  assert.ok(values('romaji').includes('shi'))
  assert.ok(values('hiragana').includes('あ'))
  assert.ok(values('katakana').includes('ア'))

  for (const id of ['romaji', 'hiragana', 'katakana']) {
    assert.equal(category(id).ordered, true)
    assert.equal(category(id).discoverable, false)
  }
})

test('catalog categories have no duplicate values or ROM mapping fields', () => {
  const categoryFields = [
    'id',
    'label',
    'group',
    'characters',
    'presentation',
    'ordered',
    'discoverable'
  ]
  const characterFields = ['value', 'label', 'unicode']

  for (const item of characterCatalog) {
    assert.equal(
      new Set(item.characters.map((option) => option.value)).size,
      item.characters.length
    )
    assert.deepEqual(Object.keys(item).sort(), [...categoryFields].sort())

    for (const option of item.characters) {
      assert.deepEqual(
        Object.keys(option).sort(),
        Object.keys(option)
          .filter((key) => characterFields.includes(key))
          .sort()
      )
    }
  }
})
