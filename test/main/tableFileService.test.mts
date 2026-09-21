import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ensureTableExtension,
  isTableFilePath,
  readTableFile,
  tableFileName,
  writeTableFile
} from '../../src/main/ipc/tableFileService.ts'

test('writes and reads table files as UTF-8 without changing their contents', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tableboy-file-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = join(directory, 'portuguese.tbl')
  const contents = ['F1=Ã', 'F2=Õ', 'F4=ã', 'F5=õ', '8140=あ'].join('\n')

  await writeTableFile(filePath, contents)

  assert.equal(await readTableFile(filePath), contents)
  assert.equal(tableFileName(filePath), 'portuguese.tbl')
})

test('adds the tbl extension only when the selected path has no extension', () => {
  assert.equal(ensureTableExtension('characters'), 'characters.tbl')
  assert.equal(ensureTableExtension('characters.tbl'), 'characters.tbl')
  assert.equal(ensureTableExtension('characters.txt'), 'characters.txt')
})

test('recognizes dropped tbl files case-insensitively', () => {
  assert.equal(isTableFilePath('characters.tbl'), true)
  assert.equal(isTableFilePath('CHARACTERS.TBL'), true)
  assert.equal(isTableFilePath('characters.txt'), false)
})
