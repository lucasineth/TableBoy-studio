import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSearchRequest,
  type RomSearchFormValues
} from '../../src/renderer/src/features/rom-search/searchRequest.ts'
import {
  initialRomSearchState,
  romSearchReducer
} from '../../src/renderer/src/features/rom-search/romSearchTypes.ts'

const form: RomSearchFormValues = {
  mode: 'strings',
  query: '',
  relativeInputMode: 'text',
  relativeCharacterMode: 'unicode',
  customSequence: '',
  wildcards: false,
  valuesInput: '',
  valueWidth: 1,
  byteOrder: 'little-endian',
  startOffset: '0',
  endOffset: '',
  alignment: '1',
  maxResults: '1000',
  contextBytes: '16',
  allowTwoSymbolQuery: false
}

test('String Scanner UI builds requests without a query or table and validates lengths', () => {
  const request = buildSearchRequest(form, 128, [])
  assert.equal(request.ok, true)
  if (request.ok && request.request.type === 'strings') {
    assert.equal(request.request.options?.encoding, 'ascii')
    assert.equal(request.request.options?.minLength, 4)
    assert.equal(request.request.options?.endOffset, 128)
  }
  assert.equal(buildSearchRequest({ ...form, minimumLength: '12foo' }, 128, []).ok, false)
  assert.equal(buildSearchRequest({ ...form, maximumLength: '3' }, 128, []).ok, false)
})

test('String Scanner batches remain incremental, stale-safe and selectable', () => {
  let state = romSearchReducer(initialRomSearchState, { type: 'SEARCH_STARTING' })
  state = romSearchReducer(state, { type: 'SEARCH_STARTED', jobId: 'scan' })
  const results = [
    {
      kind: 'strings' as const,
      result: {
        offset: 16,
        length: 8,
        encoding: 'shift-jis' as const,
        text: 'あいうえ',
        characterLength: 4,
        matchedBytes: new Uint8Array(8),
        previewTruncated: false
      }
    }
  ]
  state = romSearchReducer(state, { type: 'RESULTS', jobId: 'scan', results })
  assert.equal(romSearchReducer(state, { type: 'RESULTS', jobId: 'stale', results }), state)
  state = romSearchReducer(state, { type: 'SELECT_RESULT', offset: 16 })
  assert.equal(state.results[0].result.length, 8)
  assert.equal(state.selectedResultOffset, 16)
  assert.equal(state.results.length, 1)
})
