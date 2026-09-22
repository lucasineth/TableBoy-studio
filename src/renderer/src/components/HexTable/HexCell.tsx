import { memo, type ChangeEvent, type MouseEvent } from 'react'

import { formatTableAddress, type TableMode } from '../../../../core/table/index.ts'

interface HexCellProps {
  address: number
  mode: TableMode
  selected: boolean
  value: string
  onSelect: (address: number) => void
  onValueChange: (address: number, value: string) => void
  onContextMenu: (address: number, x: number, y: number) => void
}

export const HexCell = memo(function HexCell({
  address,
  mode,
  selected,
  value,
  onSelect,
  onValueChange,
  onContextMenu
}: HexCellProps): React.JSX.Element {
  const hex = formatTableAddress(address, mode)

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onValueChange(address, event.target.value)
  }

  const handleContextMenu = (event: MouseEvent<HTMLInputElement>): void => {
    event.preventDefault()
    onSelect(address)
    onContextMenu(address, event.clientX, event.clientY)
  }

  return (
    <td
      className={`hex-cell${selected ? ' hex-cell--selected' : ''}${value ? ' hex-cell--used' : ''}`}
    >
      <input
        data-address={hex}
        value={value}
        aria-label={`Address ${hex}`}
        title={`${hex}: ${value || 'Unmapped'}`}
        spellCheck={false}
        onChange={handleChange}
        onClick={() => onSelect(address)}
        onFocus={() => onSelect(address)}
        onContextMenu={handleContextMenu}
      />
    </td>
  )
})
