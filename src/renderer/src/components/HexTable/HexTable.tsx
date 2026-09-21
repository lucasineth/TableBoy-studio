import { byteFromPosition, HEX_MATRIX_SIZE } from '../../../../core/table/EightBitTable.ts'
import { HexCell } from './HexCell.tsx'
import { HexHeader } from './HexHeader.tsx'

const NIBBLES = Array.from({ length: HEX_MATRIX_SIZE }, (_, index) => index)

interface HexTableProps {
  selectedByte: number
  values: ReadonlyMap<number, string>
  onSelect: (byte: number) => void
  onValueChange: (byte: number, value: string) => void
  onContextMenu: (byte: number, x: number, y: number) => void
}

export function HexTable({
  selectedByte,
  values,
  onSelect,
  onValueChange,
  onContextMenu
}: HexTableProps): React.JSX.Element {
  return (
    <div className="hex-table-shell">
      <table className="hex-table" aria-label="8-bit hexadecimal character table">
        <thead>
          <tr>
            <HexHeader corner />
            {NIBBLES.map((column) => (
              <HexHeader key={column} value={column} />
            ))}
          </tr>
        </thead>
        <tbody>
          {NIBBLES.map((row) => (
            <tr key={row}>
              <th className="hex-header hex-header--row" scope="row">
                {row.toString(16).toUpperCase()}
              </th>
              {NIBBLES.map((column) => {
                const byte = byteFromPosition(row, column)
                return (
                  <HexCell
                    key={byte}
                    byte={byte}
                    value={values.get(byte) ?? ''}
                    selected={selectedByte === byte}
                    onSelect={onSelect}
                    onValueChange={onValueChange}
                    onContextMenu={onContextMenu}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
