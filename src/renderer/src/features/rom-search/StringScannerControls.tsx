import {
  STRING_SCANNER_ENCODINGS,
  type StringScannerEncoding
} from '../../../../core/search/StringScannerTypes.ts'
import type { RomSearchFormValues } from './searchRequest.ts'

interface Props {
  values: RomSearchFormValues
  errors: Readonly<Record<string, string>>
  disabled: boolean
  update: <Key extends keyof RomSearchFormValues>(key: Key, value: RomSearchFormValues[Key]) => void
}

export function StringScannerControls({
  values,
  errors,
  disabled,
  update
}: Props): React.JSX.Element {
  return (
    <fieldset className="relative-options string-scanner-options" disabled={disabled}>
      <legend>String Scanner options</legend>
      <label className="rom-search-field">
        <span>Encoding</span>
        <select
          value={values.scannerEncoding ?? 'ascii'}
          onChange={(event) =>
            update('scannerEncoding', event.target.value as StringScannerEncoding)
          }
        >
          {STRING_SCANNER_ENCODINGS.map((id) => (
            <option key={id} value={id}>
              {id === 'ascii'
                ? 'ASCII printable'
                : id === 'shift-jis'
                  ? 'Shift-JIS'
                  : id.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="rom-search-field">
        <span>Minimum Length (characters)</span>
        <input
          type="text"
          inputMode="numeric"
          value={values.minimumLength ?? '4'}
          aria-invalid={Boolean(errors.minimumLength)}
          aria-describedby="scanner-min-error"
          onChange={(event) => update('minimumLength', event.target.value)}
        />
        {errors.minimumLength ? (
          <small id="scanner-min-error" className="field-error">
            {errors.minimumLength}
          </small>
        ) : null}
      </label>
      <label className="rom-search-field">
        <span>Maximum Length (optional)</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="No maximum"
          value={values.maximumLength ?? ''}
          aria-invalid={Boolean(errors.maximumLength)}
          aria-describedby="scanner-max-error"
          onChange={(event) => update('maximumLength', event.target.value)}
        />
        {errors.maximumLength ? (
          <small id="scanner-max-error" className="field-error">
            {errors.maximumLength}
          </small>
        ) : null}
      </label>
      {(['includeSpaces', 'includeNumbers', 'includePunctuation'] as const).map((key, index) => (
        <label className="rom-search-check" key={key}>
          <input
            type="checkbox"
            checked={values[key] ?? true}
            onChange={(event) => update(key, event.target.checked)}
          />
          {['Include Spaces', 'Include Numbers', 'Include Punctuation / Symbols'][index]}
        </label>
      ))}
      <small>
        Excluded characters end a string. Alignment applies to its starting offset. Maximum length
        excludes longer strings.
      </small>
    </fieldset>
  )
}
