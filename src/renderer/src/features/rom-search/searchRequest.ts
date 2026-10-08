import type { TableEntry } from '../../../../core/table/index.ts'
import type { SearchApi } from '../../../../shared/searchApi.ts'
import { parseHexOffset } from './formatting.ts'
import type { RomSearchMode } from './romSearchTypes.ts'
import { parseValueScan } from './valueScanParser.ts'
import type { StringScannerEncoding } from '../../../../core/search/StringScannerTypes.ts'

export interface RomSearchFormValues {
  readonly mode: RomSearchMode
  readonly query: string
  readonly scannerEncoding?: StringScannerEncoding
  readonly minimumLength?: string
  readonly maximumLength?: string
  readonly includeSpaces?: boolean
  readonly includeNumbers?: boolean
  readonly includePunctuation?: boolean
  readonly relativeInputMode: 'text' | 'values'
  readonly relativeCharacterMode: 'unicode' | 'custom'
  readonly customSequence: string
  readonly wildcards: boolean
  readonly valuesInput: string
  readonly valueWidth: 1 | 2
  readonly byteOrder: 'little-endian' | 'big-endian'
  readonly startOffset: string
  readonly endOffset: string
  readonly alignment: string
  readonly maxResults: string
  readonly contextBytes: string
  readonly allowTwoSymbolQuery: boolean
}

export type RomSearchRequest = Parameters<SearchApi['start']>[1]

export type SearchRequestBuildResult =
  | { readonly ok: true; readonly request: RomSearchRequest }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> }

export function buildSearchRequest(
  values: RomSearchFormValues,
  documentSize: number,
  entries: readonly TableEntry[]
): SearchRequestBuildResult {
  const errors: Record<string, string> = {}
  const query = values.query
  const usesTextInput =
    values.mode === 'table' || (values.mode === 'relative' && values.relativeInputMode === 'text')
  if (usesTextInput && query.length === 0) errors.query = 'Enter text to search for.'
  if (values.mode === 'table' && entries.length === 0) {
    errors.table = 'Open or create a table with mapped entries to use Table Search.'
  }

  const start = parseHexOffset(values.startOffset, 0, documentSize, 'Start offset')
  const end = parseHexOffset(values.endOffset, documentSize, documentSize, 'End offset')
  if (!start.ok) errors.startOffset = start.message
  if (!end.ok) errors.endOffset = end.message
  if (start.ok && end.ok && end.value < start.value) {
    errors.endOffset = 'End offset must be greater than or equal to start offset.'
  }

  const alignment = parseDecimal(values.alignment, 'alignment', 'Alignment', 1, 4096, errors)
  const maxResults = parseDecimal(values.maxResults, 'maxResults', 'Max results', 1, 10_000, errors)
  const contextBytes = parseDecimal(
    values.mode === 'table' ? values.contextBytes : '0',
    'contextBytes',
    'Context bytes',
    0,
    4096,
    errors
  )
  const valueScan =
    values.mode === 'relative' && values.relativeInputMode === 'values'
      ? parseValueScan(values.valuesInput, values.valueWidth)
      : undefined
  if (valueScan && !valueScan.ok) errors.valuesInput = valueScan.message
  if (
    values.mode === 'relative' &&
    values.relativeInputMode === 'text' &&
    values.relativeCharacterMode === 'custom' &&
    values.customSequence.length === 0
  ) {
    errors.customSequence = 'Enter a custom character sequence.'
  }

  if (Object.keys(errors).length > 0 || !start.ok || !end.ok) return { ok: false, errors }

  const common = {
    startOffset: start.value,
    endOffset: end.value,
    alignment: alignment!,
    maxResults: maxResults!
  }
  if (values.mode === 'strings') {
    const minLength = parseDecimal(
      values.minimumLength ?? '4',
      'minimumLength',
      'Minimum length',
      1,
      Number.MAX_SAFE_INTEGER,
      errors
    )
    const maxLength = values.maximumLength?.trim()
      ? parseDecimal(
          values.maximumLength,
          'maximumLength',
          'Maximum length',
          1,
          Number.MAX_SAFE_INTEGER,
          errors
        )
      : undefined
    if (minLength !== undefined && maxLength !== undefined && maxLength < minLength)
      errors.maximumLength = 'Maximum length must be at least minimum length.'
    if (Object.keys(errors).length) return { ok: false, errors }
    return {
      ok: true,
      request: {
        type: 'strings',
        options: {
          ...common,
          encoding: values.scannerEncoding ?? 'ascii',
          minLength,
          maxLength,
          includeSpaces: values.includeSpaces ?? true,
          includeNumbers: values.includeNumbers ?? true,
          includePunctuation: values.includePunctuation ?? true
        }
      }
    }
  }
  if (values.mode === 'table') {
    return {
      ok: true,
      request: {
        type: 'table',
        query,
        entries,
        options: { ...common, contextBytes: contextBytes! }
      }
    }
  }

  const relativeOptions =
    values.valueWidth === 1
      ? { ...common, valueWidth: 1 as const, allowTwoSymbolQuery: values.allowTwoSymbolQuery }
      : {
          ...common,
          valueWidth: 2 as const,
          byteOrder: values.byteOrder,
          allowTwoSymbolQuery: values.allowTwoSymbolQuery
        }

  if (values.relativeInputMode === 'values') {
    return {
      ok: true,
      request: {
        type: 'relative',
        inputMode: 'values',
        values: valueScan && valueScan.ok ? valueScan.values : [],
        options: relativeOptions
      }
    }
  }

  return {
    ok: true,
    request: {
      type: 'relative',
      inputMode: 'text',
      query,
      options: {
        ...relativeOptions,
        wildcards: values.wildcards || undefined,
        characterSequence:
          values.relativeCharacterMode === 'custom' ? values.customSequence : undefined
      }
    }
  }
}

function parseDecimal(
  value: string,
  field: string,
  label: string,
  minimum: number,
  maximum: number,
  errors: Record<string, string>
): number | undefined {
  if (!/^\d+$/.test(value.trim())) {
    errors[field] = `${label} must be a whole number.`
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    errors[field] = `${label} must be between ${minimum} and ${maximum}.`
    return undefined
  }
  return parsed
}
