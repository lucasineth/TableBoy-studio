import type { ChangeEvent } from 'react'

import { toByteHex } from '../../../../core/table/EightBitTable.ts'

interface CharacterInspectorProps {
  byte: number
  value: string
  onValueChange: (value: string) => void
}

export function CharacterInspector({
  byte,
  value,
  onValueChange
}: CharacterInspectorProps): React.JSX.Element {
  const hex = toByteHex(byte)
  const unicode = getUnicodeCodePoints(value)

  const handleValueChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onValueChange(event.target.value)
  }

  return (
    <section className="character-inspector" aria-label="Selected byte inspector">
      <InspectorValue label="Selected byte" value={hex} accent />
      <InspectorValue label="Address" value={`0x${hex}`} />
      <InspectorValue label="Decimal" value={byte.toString()} />
      <label className="inspector-field inspector-field--editor">
        <span>Value</span>
        <input
          value={value}
          placeholder="Unmapped"
          aria-label={`Value for byte ${hex}`}
          spellCheck={false}
          onChange={handleValueChange}
        />
      </label>
      <InspectorValue label="Unicode" value={unicode} wide />
    </section>
  )
}

interface InspectorValueProps {
  label: string
  value: string
  accent?: boolean
  wide?: boolean
}

function InspectorValue({
  label,
  value,
  accent = false,
  wide = false
}: InspectorValueProps): React.JSX.Element {
  return (
    <div className={`inspector-field${wide ? ' inspector-field--wide' : ''}`}>
      <span>{label}</span>
      <strong className={accent ? 'inspector-field__accent' : ''}>{value}</strong>
    </div>
  )
}

function getUnicodeCodePoints(value: string): string {
  if (value.length === 0) return '—'

  return Array.from(value)
    .map(
      (character) => `U+${character.codePointAt(0)?.toString(16).padStart(4, '0').toUpperCase()}`
    )
    .join(' ')
}
