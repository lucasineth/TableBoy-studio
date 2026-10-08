import { useEffect, useState } from 'react'

import type { TableEntry } from '../../../../core/table/index.ts'
import type { SerializedSearchError } from '../../../../shared/searchApi.ts'
import { formatFileSize, formatHexOffset } from './formatting.ts'
import { SearchControls } from './SearchControls.tsx'
import { SearchResults } from './SearchResults.tsx'
import type { RomSearchRequest } from './searchRequest.ts'
import type { RomSearchState } from './romSearchTypes.ts'

interface RomSearchPanelProps {
  state: RomSearchState
  tableEntries: readonly TableEntry[]
  onBack: () => void
  onOpenDocument: () => void
  onCloseDocument: () => void
  onSearch: (request: RomSearchRequest) => void
  onCancel: () => void
  onSelectResult: (offset: number) => void
}

export function RomSearchPanel({
  state,
  tableEntries,
  onBack,
  onOpenDocument,
  onCloseDocument,
  onSearch,
  onCancel,
  onSelectResult
}: RomSearchPanelProps): React.JSX.Element {
  const [relativeValueWidth, setRelativeValueWidth] = useState<1 | 2>(1)

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && state.status === 'searching') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', cancelOnEscape)
    return () => window.removeEventListener('keydown', cancelOnEscape)
  }, [onCancel, state.status])

  const handleSearch = (request: RomSearchRequest): void => {
    if (request.type === 'relative') setRelativeValueWidth(request.options?.valueWidth ?? 1)
    onSearch(request)
  }

  return (
    <main className="rom-search-workspace">
      <header className="rom-tools-header">
        <div>
          <span>ROM Tools</span>
          <h1>Text Search</h1>
        </div>
        <div className="rom-tools-header__actions">
          <button type="button" className="secondary-button" onClick={onBack}>
            Back to Table Editor
          </button>
        </div>
      </header>

      {!state.document ? (
        <section className="rom-empty-state" aria-labelledby="rom-empty-title">
          <div className="rom-empty-state__icon" aria-hidden="true">
            01
          </div>
          <h2 id="rom-empty-title">Open a ROM or binary file</h2>
          <p>The document remains read-only. TableBoy exposes only its name and size here.</p>
          {state.error ? <SearchErrorMessage error={state.error} /> : null}
          <button type="button" className="primary-button" onClick={onOpenDocument}>
            Open ROM or Binary…
          </button>
        </section>
      ) : (
        <>
          <section className="rom-document-bar" aria-label="Open binary document">
            <div>
              <span className="rom-document-bar__indicator" aria-hidden="true" />
              <span>
                <strong>{state.document.name}</strong>
                <small>{formatFileSize(state.document.size)}</small>
              </span>
            </div>
            <div>
              <button type="button" className="secondary-button" onClick={onOpenDocument}>
                Open another…
              </button>
              <button type="button" className="secondary-button" onClick={onCloseDocument}>
                Close ROM
              </button>
            </div>
          </section>

          {state.document.size === 0 ? (
            <section className="rom-empty-state rom-empty-state--compact">
              <h2>The binary document is empty</h2>
              <p>There are no bytes available to search.</p>
            </section>
          ) : (
            <div className="rom-search-layout">
              <SearchControls
                documentSize={state.document.size}
                tableEntries={tableEntries}
                status={state.status}
                onSearch={handleSearch}
                onCancel={onCancel}
              />
              <section className="rom-search-results" aria-label="Search results">
                <SearchSummary state={state} />
                {state.error ? <SearchErrorMessage error={state.error} /> : null}
                <SearchResults
                  key={state.runId}
                  results={state.results}
                  documentSize={state.document.size}
                  relativeValueWidth={relativeValueWidth}
                  selectedOffset={state.selectedResultOffset}
                  onSelect={onSelectResult}
                />
                {state.selectedResultOffset !== null ? (
                  <div className="selected-search-result" role="status">
                    <span>
                      Selected offset:{' '}
                      {formatHexOffset(state.selectedResultOffset, state.document.size)}
                    </span>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  )
}

function SearchSummary({ state }: { state: RomSearchState }): React.JSX.Element {
  const visibleCount = state.results.length
  const reportedCount =
    state.status === 'completed' || state.status === 'cancelled' ? state.resultCount : visibleCount
  return (
    <div className="rom-search-summary">
      <div>
        <strong>{statusLabel(state.status)}</strong>
        <span>{reportedCount} results</span>
      </div>
      <div className="rom-search-progress">
        <progress
          max={100}
          value={state.progress?.percentage ?? 0}
          aria-label="Search progress"
          aria-valuetext={`${formatPercentage(state.progress?.percentage ?? 0)} percent`}
        />
        <span>{formatPercentage(state.progress?.percentage ?? 0)}%</span>
      </div>
    </div>
  )
}

function SearchErrorMessage({ error }: { error: SerializedSearchError }): React.JSX.Element {
  const details = error.details
  return (
    <div className="rom-search-error" role="alert">
      <strong>{friendlyError(error.code, error.message)}</strong>
      {typeof details?.fragment === 'string' ? <span>Fragment: {details.fragment}</span> : null}
      {typeof details?.position === 'number' ? <span>Position: {details.position}</span> : null}
      {typeof details?.reason === 'string' ? <span>{details.reason}</span> : null}
    </div>
  )
}

function friendlyError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'UNMAPPED_TEXT':
      return 'Some characters are not present in the loaded table.'
    case 'QUERY_TOO_SHORT':
      return 'Relative Search requires at least 3 symbols.'
    case 'SEARCH_QUEUE_FULL':
      return 'The search queue is full. Try again after the current search finishes.'
    case 'DOCUMENT_NOT_FOUND':
      return 'The binary document is no longer available.'
    case 'INSUFFICIENT_CONSTRAINTS':
      return 'Use at least two known positions in a wildcard search.'
    case 'SYMBOL_NOT_IN_SEQUENCE':
      return 'The query contains a symbol missing from the custom sequence.'
    case 'DUPLICATE_SEQUENCE_SYMBOL':
      return 'The custom character sequence contains duplicate symbols.'
    case 'EMPTY_CHARACTER_SEQUENCE':
      return 'Enter a custom character sequence.'
    case 'INVALID_RELATIVE_VALUE':
      return 'One or more Value Scan numbers are outside the selected width.'
    default:
      return fallback
  }
}

function statusLabel(status: RomSearchState['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
