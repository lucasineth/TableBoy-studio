import {
  addressFromPagePosition,
  HEX_MATRIX_SIZE,
  type TableMode
} from '../../../../core/table/index.ts'
import { HexCell } from './HexCell.tsx'
import { HexHeader } from './HexHeader.tsx'

const NIBBLES = Array.from({ length: HEX_MATRIX_SIZE }, (_, index) => index)

interface HexTableProps {
  mode: TableMode
  page: number
  selectedAddress: number
  values: ReadonlyMap<number, string>
  onSelect: (address: number) => void
  onValueChange: (address: number, value: string) => void
  onContextMenu: (address: number, x: number, y: number) => void
}

export function HexTable({
  mode,
  page,
  selectedAddress,
  values,
  onSelect,
  onValueChange,
  onContextMenu
}: HexTableProps): React.JSX.Element {
  return (
    <div className="hex-table-shell">
      <table className="hex-table" aria-label={`${mode} hexadecimal character table`}>
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
                const address = addressFromPagePosition(page, row, column, mode)
                return (
                  <HexCell
                    key={address}
                    address={address}
                    mode={mode}
                    value={values.get(address) ?? ''}
                    selected={selectedAddress === address}
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
