import { RelativeSearchError } from './RelativeSearchError.ts'

export interface RelativeKnownPosition {
  readonly kind: 'known'
  readonly value: number
  readonly symbol?: string
}

export interface RelativeWildcardPosition {
  readonly kind: 'wildcard'
}

export type RelativePatternPosition = RelativeKnownPosition | RelativeWildcardPosition

export interface RelativePatternConstraint {
  readonly index: number
  readonly delta: number
}

export interface RelativePattern {
  readonly positions: readonly RelativePatternPosition[]
  readonly anchorIndex: number
  readonly constraints: readonly RelativePatternConstraint[]
}

export interface CompileTextPatternOptions {
  readonly valueMask: number
  readonly allowTwoSymbolQuery: boolean
  readonly wildcards: boolean
  readonly characterSequence?: string
}

export function compileTextRelativePattern(
  query: string,
  options: CompileTextPatternOptions
): RelativePattern {
  const symbols = parseQuerySymbols(query, options.wildcards)
  validatePatternLength(symbols.length, options.allowTwoSymbolQuery, 'query')

  const sequenceValues = options.characterSequence
    ? createSequenceValues(options.characterSequence)
    : undefined
  if (options.characterSequence !== undefined && options.characterSequence.length === 0) {
    throw new RelativeSearchError(
      'EMPTY_CHARACTER_SEQUENCE',
      'The custom character sequence cannot be empty.'
    )
  }

  const positions: RelativePatternPosition[] = symbols.map((symbol) => {
    if (symbol === null) return { kind: 'wildcard' }
    const sequenceValue = sequenceValues?.get(symbol)
    if (sequenceValues && sequenceValue === undefined) {
      throw new RelativeSearchError(
        'SYMBOL_NOT_IN_SEQUENCE',
        `The symbol ${JSON.stringify(symbol)} is not present in the custom character sequence.`
      )
    }
    return {
      kind: 'known',
      symbol,
      value: sequenceValue ?? symbol.codePointAt(0)! & options.valueMask
    }
  })
  return compilePattern(positions, options.valueMask)
}

export function compileValueRelativePattern(
  values: readonly number[],
  valueMask: number,
  allowTwoSymbolQuery: boolean
): RelativePattern {
  if (values.length === 0) {
    throw new RelativeSearchError('EMPTY_VALUES', 'Value Scan requires at least one value.')
  }
  validatePatternLength(values.length, allowTwoSymbolQuery, 'value sequence')
  const positions = values.map((value, index): RelativeKnownPosition => {
    if (!Number.isSafeInteger(value) || value < 0 || value > valueMask) {
      throw new RelativeSearchError(
        'INVALID_RELATIVE_VALUE',
        `Value at index ${index} must be an integer between 0 and ${valueMask}.`
      )
    }
    return { kind: 'known', value }
  })
  return compilePattern(positions, valueMask)
}

function compilePattern(
  positions: readonly RelativePatternPosition[],
  valueMask: number
): RelativePattern {
  const anchorIndex = positions.findIndex((position) => position.kind === 'known')
  const knownCount = positions.reduce(
    (count, position) => count + (position.kind === 'known' ? 1 : 0),
    0
  )
  if (anchorIndex < 0 || knownCount < 2) {
    throw new RelativeSearchError(
      'INSUFFICIENT_CONSTRAINTS',
      'Relative search requires at least two known positions.'
    )
  }

  const anchor = positions[anchorIndex] as RelativeKnownPosition
  const constraints: RelativePatternConstraint[] = []
  for (let index = anchorIndex + 1; index < positions.length; index += 1) {
    const position = positions[index]
    if (position.kind === 'known') {
      constraints.push({ index, delta: (position.value - anchor.value) & valueMask })
    }
  }
  return { positions, anchorIndex, constraints }
}

function parseQuerySymbols(query: string, wildcards: boolean): Array<string | null> {
  const symbols = Array.from(query)
  if (!wildcards) return symbols

  const parsed: Array<string | null> = []
  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index]
    if (symbol === '?') {
      parsed.push(null)
      continue
    }
    if (symbol !== '\\') {
      parsed.push(symbol)
      continue
    }

    const escaped = symbols[index + 1]
    if (escaped !== '?' && escaped !== '\\') {
      throw new RelativeSearchError(
        'INVALID_WILDCARD_ESCAPE',
        'Wildcard mode only supports \\? and \\\\ escape sequences.'
      )
    }
    parsed.push(escaped)
    index += 1
  }
  return parsed
}

function createSequenceValues(sequence: string): Map<string, number> {
  const values = new Map<string, number>()
  for (const [index, symbol] of Array.from(sequence).entries()) {
    if (values.has(symbol)) {
      throw new RelativeSearchError(
        'DUPLICATE_SEQUENCE_SYMBOL',
        `The custom character sequence contains duplicate symbol ${JSON.stringify(symbol)}.`
      )
    }
    values.set(symbol, index)
  }
  return values
}

function validatePatternLength(length: number, allowTwoSymbols: boolean, label: string): void {
  if (length === 0) {
    throw new RelativeSearchError('EMPTY_QUERY', `The relative search ${label} cannot be empty.`)
  }
  if (length === 1 || (length === 2 && !allowTwoSymbols)) {
    throw new RelativeSearchError(
      'QUERY_TOO_SHORT',
      'Relative search requires at least three positions unless two positions are explicitly allowed.'
    )
  }
}
