import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import { BinaryDocument } from '../../core/binary/index.ts'

export interface LoadedBinaryDocument {
  readonly document: BinaryDocument
  readonly name: string
}

export async function loadBinaryDocument(filePath: string): Promise<LoadedBinaryDocument> {
  const bytes = await readFile(filePath)
  return {
    document: new BinaryDocument(bytes),
    name: basename(filePath)
  }
}
