import { useState } from 'react'

import { formatHexBytes, formatHexOffset, formatMapping } from './formatting.ts'
import type { RomSearchResultItem } from './romSearchTypes.ts'

const RESULTS_PER_PAGE = 100

interface SearchResultsProps {
  results: readonly RomSearchResultItem[]
  documentSize: number
  relativeValueWidth: 1 | 2
  selectedOffset: number | null
  onSelect: (offset: number) => void
}

export function SearchResults({
  results,
  documentSize,
  relativeValueWidth,
  selectedOffset,
  onSelect
}: SearchResultsProps): React.JSX.Element {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(results.length / RESULTS_PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * RESULTS_PER_PAGE
  const visibleResults = results.slice(start, start + RESULTS_PER_PAGE)

  if (results.length === 0) {
    return (
      <div className="rom-search-results__empty">
        <strong>No results yet</strong>
        <span>Open a binary, configure a search and results will appear here.</span>
      </div>
    )
  }

  return (
    <div className="rom-search-results__content">
      <div className="rom-search-result-list" role="listbox" aria-label="Search results">
        {visibleResults.map((item, index) => {
          const absoluteIndex = start + index
          const offset = item.result.offset
          const selected = selectedOffset === offset
          return (
            <button
              type="button"
              role="option"
              aria-selected={selected}
              className={`rom-search-result${selected ? ' rom-search-result--selected' : ''}`}
              key={`${item.kind}-${offset}-${absoluteIndex}`}
              onClick={() => onSelect(offset)}
            >
              <span className="rom-search-result__offset">
                {formatHexOffset(offset, documentSize)}
              </span>
              {item.kind === 'table' ? (
                <TableResultContent item={item} />
              ) : item.kind === 'strings' ? (
                <>
                  <span className="rom-search-result__primary">
                    {item.result.text}
                    {item.result.previewTruncated ? '…' : ''}
                  </span>
                  <span className="rom-search-result__bytes">
                    {formatHexBytes(item.result.matchedBytes)}
                  </span>
                  <span className="rom-search-result__context">
                    {item.result.encoding} · {item.result.characterLength} characters ·{' '}
                    {item.result.length} bytes
                    {item.result.previewTruncated ? ' · Preview truncated' : ''}
                  </span>
                </>
              ) : (
                <RelativeResultContent item={item} valueWidth={relativeValueWidth} />
              )}
            </button>
          )
        })}
      </div>
      <div className="rom-search-pagination" aria-label="Result pages">
        <button
          type="button"
          disabled={safePage === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
        >
          Previous
        </button>
        <span>
          Page {safePage + 1} of {pageCount} · showing {start + 1}–
          {Math.min(start + RESULTS_PER_PAGE, results.length)} of {results.length}
        </span>
        <button
          type="button"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
        >
          Next
        </button>
      </div>
    </div>
  )
}

function TableResultContent({
  item
}: {
  item: Extract<RomSearchResultItem, { kind: 'table' }>
}): React.JSX.Element {
  const { result } = item
  return (
    <>
      <span className="rom-search-result__primary">{result.matchedText}</span>
      <span className="rom-search-result__bytes">{formatHexBytes(result.matchedBytes)}</span>
      <span className="rom-search-result__context">
        {result.context?.decodedText ?? formatBinaryContext(result)}
      </span>
    </>
  )
}

function RelativeResultContent({
  item,
  valueWidth
}: {
  item: Extract<RomSearchResultItem, { kind: 'relative' }>
  valueWidth: 1 | 2
}): React.JSX.Element {
  return (
    <>
      <span className="rom-search-result__primary">{formatHexBytes(item.result.matchedBytes)}</span>
      <span className="rom-search-result__mapping">
        {item.result.mappings.length > 0
          ? formatMapping(item.result.mappings, valueWidth)
          : 'Numeric value pattern'}
      </span>
    </>
  )
}

function formatBinaryContext(
  result: Extract<RomSearchResultItem, { kind: 'table' }>['result']
): string {
  if (!result.context) return 'No context requested'
  const before = formatHexBytes(result.context.before)
  const after = formatHexBytes(result.context.after)
  return `Before: ${before || '—'} · After: ${after || '—'}`
}
