import { toByteHex } from '../../../../core/table/EightBitTable.ts'

interface StatusBarProps {
  selectedByte: number
  usedEntries: number
  modified: boolean
  validationValid: boolean
  fileName: string
}

export function StatusBar({
  selectedByte,
  usedEntries,
  modified,
  validationValid,
  fileName
}: StatusBarProps): React.JSX.Element {
  return (
    <footer className="status-bar">
      <span className="status-bar__file">{`${fileName}${modified ? ' *' : ''}`}</span>
      <span>Selected: {toByteHex(selectedByte)}</span>
      <span>Used: {usedEntries}</span>
      <span>Free: {256 - usedEntries}</span>
      <span>Encoding: Custom 8-bit</span>
      <span className={validationValid ? 'status-bar__valid' : 'status-bar__error'}>
        {validationValid ? 'No errors' : 'Validation errors'}
      </span>
      <span className={modified ? 'status-bar__modified' : ''}>
        {modified ? 'Modified' : 'Saved'}
      </span>
    </footer>
  )
}
