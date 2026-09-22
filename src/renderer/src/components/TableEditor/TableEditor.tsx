import type { TableMode } from '../../../../core/table/TableMode.ts'
import { HexTable } from '../HexTable/HexTable.tsx'
import { TablePageSelector } from './TablePageSelector.tsx'

interface TableEditorProps {
  mode: TableMode
  page: number
  availablePages: readonly number[]
  selectedAddress: number
  values: ReadonlyMap<number, string>
  onPageChange: (page: number) => void
  onSelect: (address: number) => void
  onValueChange: (address: number, value: string) => void
  onContextMenu: (address: number, x: number, y: number) => void
}

export function TableEditor({
  mode,
  page,
  availablePages,
  selectedAddress,
  values,
  onPageChange,
  onSelect,
  onValueChange,
  onContextMenu
}: TableEditorProps): React.JSX.Element {
  return (
    <section
      className={`table-editor${mode === '16-bit' ? ' table-editor--paged' : ''}`}
      aria-label={`${mode} table editor`}
    >
      {mode === '16-bit' ? (
        <TablePageSelector
          page={page}
          availablePages={availablePages}
          onPageChange={onPageChange}
        />
      ) : null}
      <HexTable
        mode={mode}
        page={page}
        selectedAddress={selectedAddress}
        values={values}
        onSelect={onSelect}
        onValueChange={onValueChange}
        onContextMenu={onContextMenu}
      />
    </section>
  )
}
