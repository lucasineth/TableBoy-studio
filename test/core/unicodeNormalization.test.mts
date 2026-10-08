import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeUnicode,
  UnicodeNormalizationError,
  type UnicodeNormalizationForm
} from '../../src/core/encoding/index.ts'

const composed = '\u00E9'
const decomposed = 'e\u0301'

test('Unicode normalization defaults to none and preserves exact input', () => {
  assert.equal(normalizeUnicode(decomposed), decomposed)
  assert.equal(normalizeUnicode(decomposed, 'none'), decomposed)
  assert.notEqual(decomposed, composed)
})

test('Unicode normalization supports NFC and NFD explicitly', () => {
  assert.equal(normalizeUnicode(decomposed, 'NFC'), composed)
  assert.equal(normalizeUnicode(composed, 'NFD'), decomposed)
})

test('Unicode normalization supports NFKC and NFKD explicitly', () => {
  assert.equal(normalizeUnicode('Ａ①', 'NFKC'), 'A1')
  assert.equal(normalizeUnicode('ﬁ', 'NFKD'), 'fi')
})

test('Unicode normalization rejects unknown forms', () => {
  assert.throws(
    () => normalizeUnicode('text', 'INVALID' as UnicodeNormalizationForm),
    (error: unknown) =>
      error instanceof UnicodeNormalizationError && error.code === 'INVALID_NORMALIZATION'
  )
})
