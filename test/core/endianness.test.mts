import assert from 'node:assert/strict'
import test from 'node:test'

import { readUint16, writeUint16, type ByteOrder } from '../../src/core/bytes/index.ts'

test('reads and writes unsigned 16-bit little-endian values', () => {
  assert.equal(readUint16([0x34, 0x12], 0, 'little-endian'), 0x1234)
  assert.deepEqual([...writeUint16(0x1234, 'little-endian')], [0x34, 0x12])
})

test('reads and writes unsigned 16-bit big-endian values', () => {
  assert.equal(readUint16([0x12, 0x34], 0, 'big-endian'), 0x1234)
  assert.deepEqual([...writeUint16(0x1234, 'big-endian')], [0x12, 0x34])
})

test('endianness helpers support offsets and boundary values', () => {
  assert.equal(readUint16([0xff, 0x00, 0x00, 0xff], 1, 'big-endian'), 0)
  assert.deepEqual([...writeUint16(0, 'little-endian')], [0x00, 0x00])
  assert.deepEqual([...writeUint16(0xffff, 'big-endian')], [0xff, 0xff])
})

test('endianness helpers reject invalid ranges, values and byte orders', () => {
  assert.throws(() => readUint16([0x00], 0, 'little-endian'), RangeError)
  assert.throws(() => readUint16([0x100, 0x00], 0, 'big-endian'), RangeError)
  assert.throws(() => writeUint16(0x10000, 'little-endian'), RangeError)
  assert.throws(() => writeUint16(1, 'middle-endian' as ByteOrder), RangeError)
})
