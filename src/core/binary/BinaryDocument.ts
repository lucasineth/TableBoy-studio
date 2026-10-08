import { readUint16, type ByteOrder } from '../bytes/index.ts'
import { BinaryDocumentError } from './BinaryDocumentError.ts'

export class BinaryDocument {
  readonly size: number
  #bytes: Uint8Array | null

  constructor(bytes: Uint8Array) {
    this.#bytes = Uint8Array.from(bytes)
    this.size = bytes.length
  }

  get isClosed(): boolean {
    return this.#bytes === null
  }

  readByte(offset: number): number {
    const bytes = this.requireOpen()
    this.assertOffset(offset, false)
    return bytes[offset]
  }

  readRange(offset: number, length: number): Uint8Array {
    const bytes = this.requireOpen()
    this.assertOffset(offset, true)

    if (!Number.isSafeInteger(length) || length < 0) {
      throw new BinaryDocumentError('INVALID_LENGTH', 'Length must be a non-negative integer.')
    }

    if (length > this.size - offset) {
      throw new BinaryDocumentError(
        'INVALID_RANGE',
        `Range [${offset}, ${offset + length}) is outside the document bounds.`
      )
    }

    return bytes.slice(offset, offset + length)
  }

  readUint16(offset: number, byteOrder: ByteOrder): number {
    return readUint16(this.readRange(offset, 2), 0, byteOrder)
  }

  close(): void {
    this.#bytes = null
  }

  private requireOpen(): Uint8Array {
    if (this.#bytes === null) {
      throw new BinaryDocumentError('DOCUMENT_CLOSED', 'The binary document is closed.')
    }
    return this.#bytes
  }

  private assertOffset(offset: number, allowEnd: boolean): void {
    const maximum = allowEnd ? this.size : this.size - 1
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximum) {
      throw new BinaryDocumentError(
        'INVALID_OFFSET',
        `Offset ${offset} is outside the document bounds.`
      )
    }
  }
}
