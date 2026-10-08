export const BYTE_ORDERS = ['little-endian', 'big-endian'] as const

export type ByteOrder = (typeof BYTE_ORDERS)[number]

export function readUint16(
  bytes: Uint8Array | readonly number[],
  offset: number,
  byteOrder: ByteOrder
): number {
  assertByteOrder(byteOrder)
  if (!Number.isInteger(offset) || offset < 0 || offset + 1 >= bytes.length) {
    throw new RangeError('A 16-bit read requires two bytes within the input range.')
  }

  const firstByte = validatedByte(bytes[offset], offset)
  const secondByte = validatedByte(bytes[offset + 1], offset + 1)
  return byteOrder === 'little-endian'
    ? firstByte | (secondByte << 8)
    : (firstByte << 8) | secondByte
}

export function writeUint16(value: number, byteOrder: ByteOrder): Uint8Array {
  assertByteOrder(byteOrder)
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError('16-bit value must be an integer between 0 and 65535.')
  }

  const highByte = value >> 8
  const lowByte = value & 0xff
  return Uint8Array.from(byteOrder === 'little-endian' ? [lowByte, highByte] : [highByte, lowByte])
}

function validatedByte(byte: number, offset: number): number {
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
    throw new RangeError(`Byte at offset ${offset} must be an integer between 0 and 255.`)
  }
  return byte
}

function assertByteOrder(byteOrder: string): asserts byteOrder is ByteOrder {
  if (!BYTE_ORDERS.includes(byteOrder as ByteOrder)) {
    throw new RangeError(`Unknown byte order: ${JSON.stringify(byteOrder)}.`)
  }
}
