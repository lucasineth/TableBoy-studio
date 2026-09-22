import assert from 'node:assert/strict'
import test from 'node:test'

import { byteFromPosition, positionFromByte, setEightBitValue } from '../../src/core/table/index.ts'
import {
  characterCatalog,
  lowercaseCategory,
  numbersCategory,
  portugueseCategory,
  uppercaseCategory
} from '../../src/core/characters/CharacterCatalog.ts'
import { applyCharacterSequence } from '../../src/core/characters/applyCharacterSequence.ts'

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

test('Hiragana catalog contains the 46 basic characters without placeholder entries', () => {
  const hiragana = characterCatalog.find((category) => category.id === 'hiragana')
  assert.ok(hiragana)
  assert.equal(hiragana.characters.length, 46)
  assert.equal(
    hiragana.characters.some((option) => option.value === '->'),
    false
  )
  assert.equal(
    hiragana.characters.some((option) => option.value === 'も'),
    true
  )
})

test('selected byte, not the catalog, determines the character assignment', () => {
  const option = portugueseCategory.characters.find((character) => character.value === 'Ã')
  assert.ok(option)

  const atF1 = setEightBitValue([], 0xf1, option.value)
  const atE5 = setEightBitValue([], 0xe5, option.value)

  assert.deepEqual(atF1, [{ key: [0xf1], value: 'Ã' }])
  assert.deepEqual(atE5, [{ key: [0xe5], value: 'Ã' }])
})

test('sequential categories fill from the selected byte', () => {
  const uppercase = applyCharacterSequence([], 0x41, uppercaseCategory.characters)
  const lowercase = applyCharacterSequence([], 0x80, lowercaseCategory.characters)
  const numbers = applyCharacterSequence([], 0x20, numbersCategory.characters)

  assert.equal(uppercase.ok, true)
  assert.equal(lowercase.ok, true)
  assert.equal(numbers.ok, true)
  if (!uppercase.ok || !lowercase.ok || !numbers.ok) return

  assert.deepEqual(uppercase.entries.at(0), { key: [0x41], value: 'A' })
  assert.deepEqual(uppercase.entries.at(-1), { key: [0x5a], value: 'Z' })
  assert.deepEqual(lowercase.entries.at(-1), { key: [0x99], value: 'z' })
  assert.deepEqual(numbers.entries.at(-1), { key: [0x29], value: '9' })
})

test('sequential application rejects overflow and reports occupied cells', () => {
  const overflow = applyCharacterSequence([], 0xf8, uppercaseCategory.characters)
  assert.deepEqual(overflow, {
    ok: false,
    reason: 'OVERFLOW',
    availableCells: 8,
    requiredCells: 26
  })

  const replacement = applyCharacterSequence(
    [
      { key: [0x41], value: 'old' },
      { key: [0x45], value: 'old' }
    ],
    0x41,
    numbersCategory.characters
  )
  assert.equal(replacement.ok, true)
  if (!replacement.ok) return
  assert.deepEqual(replacement.overwrittenAddresses, [0x41, 0x45])
})

test('sequential categories preserve 16-bit addresses', () => {
  const result = applyCharacterSequence([], 0x8140, numbersCategory.characters, '16-bit')

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.entries.at(0), { key: [0x81, 0x40], value: '0' })
  assert.deepEqual(result.entries.at(-1), { key: [0x81, 0x49], value: '9' })
  assert.equal(result.startAddress, 0x8140)
  assert.equal(result.endAddress, 0x8149)
})
