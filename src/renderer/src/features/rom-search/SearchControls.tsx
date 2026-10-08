import { useState, type FormEvent } from 'react'
import { StringScannerControls } from './StringScannerControls.tsx'

import type { TableEntry } from '../../../../core/table/index.ts'
import {
  buildSearchRequest,
  type RomSearchFormValues,
  type RomSearchRequest
} from './searchRequest.ts'
import type { RomSearchMode, RomSearchStatus } from './romSearchTypes.ts'

interface SearchControlsProps {
  documentSize: number
  tableEntries: readonly TableEntry[]
  status: RomSearchStatus
  onSearch: (request: RomSearchRequest) => void
  onCancel: () => void
}

const DEFAULT_VALUES: RomSearchFormValues = {
  mode: 'table',
  query: '',
  relativeInputMode: 'text',
  relativeCharacterMode: 'unicode',
  customSequence: '',
  wildcards: false,
  valuesInput: '',
  valueWidth: 1,
  byteOrder: 'little-endian',
  startOffset: '0',
  endOffset: '',
  alignment: '1',
  maxResults: '1000',
  contextBytes: '16',
  allowTwoSymbolQuery: false
}

export function SearchControls({
  documentSize,
  tableEntries,
  status,
  onSearch,
  onCancel
}: SearchControlsProps): React.JSX.Element {
  const [values, setValues] = useState(DEFAULT_VALUES)
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const searching = status === 'searching'
  const tableUnavailable = values.mode === 'table' && tableEntries.length === 0

  const update = <Key extends keyof RomSearchFormValues>(
    key: Key,
    value: RomSearchFormValues[Key]
  ): void => {
    setValues((current) => ({ ...current, [key]: value }))
    if (key === 'mode') {
      setErrors({})
      return
    }
    setErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const result = buildSearchRequest(values, documentSize, tableEntries)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    onSearch(result.request)
  }

  return (
    <form className="rom-search-controls" onSubmit={submit}>
      <fieldset className="rom-search-mode" disabled={searching}>
        <legend>Search mode</legend>
        <SearchModeOption
          mode="table"
          current={values.mode}
          label="Table Search"
          description="Encode text using the current .tbl table."
          onChange={(mode) => update('mode', mode)}
        />
        <SearchModeOption
          mode="relative"
          current={values.mode}
          label="Relative Search"
          description="Find candidates without a known table."
          onChange={(mode) => update('mode', mode)}
        />
        <SearchModeOption
          mode="strings"
          current={values.mode}
          label="String Scanner"
          description="Find readable strings using an explicit encoding."
          onChange={(mode) => update('mode', mode)}
        />
      </fieldset>

      {values.mode === 'strings' ? null : values.mode === 'table' ||
        values.relativeInputMode === 'text' ? (
        <>
          <label className="rom-search-field">
            <span>Query</span>
            <input
              id="rom-search-query"
              type="text"
              value={values.query}
              disabled={searching}
              aria-invalid={Boolean(errors.query)}
              aria-describedby={errors.query ? 'rom-search-query-error' : undefined}
              placeholder={
                values.mode === 'table' ? 'Text or token, e.g. HELLO' : 'Known text, e.g. A?CDE'
              }
              onChange={(event) => update('query', event.target.value)}
            />
          </label>
          {errors.query ? <FieldError id="rom-search-query-error" message={errors.query} /> : null}
        </>
      ) : (
        <>
          <label className="rom-search-field">
            <span>Values</span>
            <input
              id="rom-search-query"
              type="text"
              value={values.valuesInput}
              disabled={searching}
              aria-invalid={Boolean(errors.valuesInput)}
              aria-describedby={errors.valuesInput ? 'rom-search-values-error' : undefined}
              placeholder="10 20 30 or 0x10 0x20 0x30"
              onChange={(event) => update('valuesInput', event.target.value)}
            />
          </label>
          {errors.valuesInput ? (
            <FieldError id="rom-search-values-error" message={errors.valuesInput} />
          ) : null}
        </>
      )}

      {values.mode === 'table' ? (
        <div className={`table-source${tableUnavailable ? ' table-source--missing' : ''}`}>
          <span>Current table</span>
          <strong>{tableEntries.length} mapped entries</strong>
          {tableUnavailable ? (
            <small>Open or create a table with mapped entries to use Table Search.</small>
          ) : null}
        </div>
      ) : values.mode === 'strings' ? (
        <StringScannerControls
          values={values}
          errors={errors}
          disabled={searching}
          update={update}
        />
      ) : (
        <RelativeOptions values={values} errors={errors} disabled={searching} update={update} />
      )}

      <details className="rom-search-advanced">
        <summary>Advanced options</summary>
        <div className="rom-search-advanced__grid">
          <SearchInput
            label="Start offset"
            value={values.startOffset}
            error={errors.startOffset}
            disabled={searching}
            placeholder="0"
            onChange={(value) => update('startOffset', value)}
          />
          <SearchInput
            label="End offset"
            value={values.endOffset}
            error={errors.endOffset}
            disabled={searching}
            placeholder="Document end"
            onChange={(value) => update('endOffset', value)}
          />
          <SearchInput
            label="Alignment"
            value={values.alignment}
            error={errors.alignment}
            disabled={searching}
            inputMode="numeric"
            onChange={(value) => update('alignment', value)}
          />
          <SearchInput
            label="Max results"
            value={values.maxResults}
            error={errors.maxResults}
            disabled={searching}
            inputMode="numeric"
            onChange={(value) => update('maxResults', value)}
          />
          {values.mode === 'table' ? (
            <SearchInput
              label="Context bytes"
              value={values.contextBytes}
              error={errors.contextBytes}
              disabled={searching}
              inputMode="numeric"
              onChange={(value) => update('contextBytes', value)}
            />
          ) : values.mode === 'relative' ? (
            <label className="rom-search-check">
              <input
                type="checkbox"
                checked={values.allowTwoSymbolQuery}
                disabled={searching}
                onChange={(event) => update('allowTwoSymbolQuery', event.target.checked)}
              />
              Allow two-symbol query
            </label>
          ) : null}
        </div>
      </details>

      {errors.table ? <p className="rom-search-form-error">{errors.table}</p> : null}
      <div className="rom-search-actions">
        <button type="submit" className="primary-button" disabled={searching || tableUnavailable}>
          Search
        </button>
        <button type="button" className="secondary-button" disabled={!searching} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

interface SearchModeOptionProps {
  mode: RomSearchMode
  current: RomSearchMode
  label: string
  description: string
  onChange: (mode: RomSearchMode) => void
}

function SearchModeOption({
  mode,
  current,
  label,
  description,
  onChange
}: SearchModeOptionProps): React.JSX.Element {
  return (
    <label className="rom-search-mode__option">
      <input
        type="radio"
        name="rom-search-mode"
        value={mode}
        checked={current === mode}
        onChange={() => onChange(mode)}
      />
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </label>
  )
}

interface RelativeOptionsProps {
  values: RomSearchFormValues
  errors: Readonly<Record<string, string>>
  disabled: boolean
  update: <Key extends keyof RomSearchFormValues>(key: Key, value: RomSearchFormValues[Key]) => void
}

function RelativeOptions({
  values,
  errors,
  disabled,
  update
}: RelativeOptionsProps): React.JSX.Element {
  return (
    <div className="relative-options">
      <fieldset disabled={disabled}>
        <legend>Input mode</legend>
        <label>
          <input
            type="radio"
            name="relative-input-mode"
            checked={values.relativeInputMode === 'text'}
            onChange={() => update('relativeInputMode', 'text')}
          />
          Text
        </label>
        <label>
          <input
            type="radio"
            name="relative-input-mode"
            checked={values.relativeInputMode === 'values'}
            onChange={() => update('relativeInputMode', 'values')}
          />
          Value Scan
        </label>
      </fieldset>
      {values.relativeInputMode === 'text' ? (
        <>
          <fieldset disabled={disabled}>
            <legend>Character relation</legend>
            <label>
              <input
                type="radio"
                name="relative-character-mode"
                checked={values.relativeCharacterMode === 'unicode'}
                onChange={() => update('relativeCharacterMode', 'unicode')}
              />
              Unicode values
            </label>
            <label>
              <input
                type="radio"
                name="relative-character-mode"
                checked={values.relativeCharacterMode === 'custom'}
                onChange={() => update('relativeCharacterMode', 'custom')}
              />
              Custom sequence
            </label>
          </fieldset>
          {values.relativeCharacterMode === 'custom' ? (
            <SearchInput
              label="Character sequence"
              value={values.customSequence}
              error={errors.customSequence}
              disabled={disabled}
              placeholder="ABCDEFGHIJKLMNOPQRSTUVWXYZ"
              onChange={(value) => update('customSequence', value)}
            />
          ) : null}
          <label className="rom-search-check">
            <input
              type="checkbox"
              checked={values.wildcards}
              disabled={disabled}
              onChange={(event) => update('wildcards', event.target.checked)}
            />
            Enable ? wildcard (use \? for literal ?)
          </label>
        </>
      ) : null}
      <fieldset disabled={disabled}>
        <legend>Data width</legend>
        <label>
          <input
            type="radio"
            name="relative-width"
            checked={values.valueWidth === 1}
            onChange={() => update('valueWidth', 1)}
          />
          8-bit
        </label>
        <label>
          <input
            type="radio"
            name="relative-width"
            checked={values.valueWidth === 2}
            onChange={() => update('valueWidth', 2)}
          />
          16-bit
        </label>
      </fieldset>
      {values.valueWidth === 2 ? (
        <fieldset disabled={disabled}>
          <legend>Byte order</legend>
          <label>
            <input
              type="radio"
              name="relative-byte-order"
              checked={values.byteOrder === 'little-endian'}
              onChange={() => update('byteOrder', 'little-endian')}
            />
            Little Endian
          </label>
          <label>
            <input
              type="radio"
              name="relative-byte-order"
              checked={values.byteOrder === 'big-endian'}
              onChange={() => update('byteOrder', 'big-endian')}
            />
            Big Endian
          </label>
        </fieldset>
      ) : null}
    </div>
  )
}

interface SearchInputProps {
  label: string
  value: string
  error?: string
  disabled: boolean
  placeholder?: string
  inputMode?: 'numeric'
  onChange: (value: string) => void
}

function SearchInput({
  label,
  value,
  error,
  disabled,
  placeholder,
  inputMode,
  onChange
}: SearchInputProps): React.JSX.Element {
  return (
    <label className="rom-search-field rom-search-field--small">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  )
}

function FieldError({ id, message }: { id: string; message: string }): React.JSX.Element {
  return (
    <small className="field-error" id={id}>
      {message}
    </small>
  )
}
