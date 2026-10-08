import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { loadBinaryDocument } from '../../src/main/binary/binaryFileService.ts'

test('opens a synthetic binary file with its base name and contents', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tableboy-binary-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = join(directory, 'sample.gba')
  await writeFile(filePath, Uint8Array.of(0x10, 0x20, 0x30))

  const loaded = await loadBinaryDocument(filePath)

  assert.equal(loaded.name, 'sample.gba')
  assert.equal(loaded.document.size, 3)
  assert.deepEqual(loaded.document.readRange(0, 3), Uint8Array.of(0x10, 0x20, 0x30))
  loaded.document.close()
  assert.equal(loaded.document.isClosed, true)
})

test('opens an empty synthetic binary file', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tableboy-binary-empty-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = join(directory, 'empty.bin')
  await writeFile(filePath, new Uint8Array())

  const loaded = await loadBinaryDocument(filePath)

  assert.equal(loaded.document.size, 0)
  assert.deepEqual(loaded.document.readRange(0, 0), new Uint8Array())
})

test('rejects an inaccessible binary path', async () => {
  await assert.rejects(loadBinaryDocument(join(tmpdir(), 'tableboy-file-does-not-exist.bin')), {
    code: 'ENOENT'
  })
})
