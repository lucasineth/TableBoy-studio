import { BinaryDocumentError } from '../../core/binary/index.ts'

export const MAX_IPC_READ_RANGE = 64 * 1024

export function assertIpcReadRangeLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_IPC_READ_RANGE) {
    throw new BinaryDocumentError(
      'INVALID_LENGTH',
      `IPC binary range length must be between 0 and ${MAX_IPC_READ_RANGE} bytes.`
    )
  }
}
