import {
  addressCountForMode,
  formatTableAddress,
  type TableMode
} from '../../../../core/table/index.ts'

interface StatusBarProps {
  selectedAddress: number
  mode: TableMode
  usedEntries: number
  modified: boolean
  validationValid: boolean
  fileName: string
}

export function StatusBar({
  selectedAddress,
  mode,
  usedEntries,
  modified,
  validationValid,
  fileName
}: StatusBarProps): React.JSX.Element {
  return (
    <footer className="status-bar">
      <span className="status-bar__file">{`${fileName}${modified ? ' *' : ''}`}</span>
      <span>Selected: {formatTableAddress(selectedAddress, mode)}</span>
      <span>Used: {usedEntries}</span>
      <span>Free: {addressCountForMode(mode) - usedEntries}</span>
      <span>Encoding: Custom {mode}</span>
      <span className={validationValid ? 'status-bar__valid' : 'status-bar__error'}>
        {validationValid ? 'No errors' : 'Validation errors'}
      </span>
      <span className={modified ? 'status-bar__modified' : ''}>
        {modified ? 'Modified' : 'Saved'}
      </span>
    </footer>
  )
}
