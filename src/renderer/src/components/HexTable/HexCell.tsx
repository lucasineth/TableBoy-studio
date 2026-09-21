import { memo, type ChangeEvent, type MouseEvent } from 'react'

import { toByteHex } from '../../../../core/table/EightBitTable.ts'

interface HexCellProps {
  byte: number
  selected: boolean
  value: string
  onSelect: (byte: number) => void
  onValueChange: (byte: number, value: string) => void
  onContextMenu: (byte: number, x: number, y: number) => void
}

export const HexCell = memo(function HexCell({
  byte,
  selected,
  value,
  onSelect,
  onValueChange,
  onContextMenu
}: HexCellProps): React.JSX.Element {
  const hex = toByteHex(byte)

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onValueChange(byte, event.target.value)
  }

  const handleContextMenu = (event: MouseEvent<HTMLInputElement>): void => {
    event.preventDefault()
    onSelect(byte)
    onContextMenu(byte, event.clientX, event.clientY)
  }

  return (
    <td
      className={`hex-cell${selected ? ' hex-cell--selected' : ''}${value ? ' hex-cell--used' : ''}`}
    >
      <input
        data-byte={hex}
        value={value}
        aria-label={`Byte ${hex}`}
        title={`${hex}: ${value || 'Unmapped'}`}
        spellCheck={false}
        onChange={handleChange}
        onClick={() => onSelect(byte)}
        onFocus={() => onSelect(byte)}
        onContextMenu={handleContextMenu}
      />
    </td>
  )
})
