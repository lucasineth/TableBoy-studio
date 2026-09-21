import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

export async function readTableFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8')
}

export async function writeTableFile(filePath: string, contents: string): Promise<void> {
  await writeFile(filePath, contents, 'utf8')
}

export function tableFileName(filePath: string): string {
  return basename(filePath)
}

export function ensureTableExtension(filePath: string): string {
  return extname(filePath).length === 0 ? `${filePath}.tbl` : filePath
}

export function isTableFilePath(filePath: string): boolean {
  return extname(filePath).toLocaleLowerCase() === '.tbl'
}
