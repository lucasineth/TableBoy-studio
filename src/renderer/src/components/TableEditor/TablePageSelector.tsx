import { useState, type ChangeEvent, type KeyboardEvent } from 'react'

import { assertTablePage } from '../../../../core/table/TableAddress.ts'

interface TablePageSelectorProps {
  page: number
  availablePages: readonly number[]
  onPageChange: (page: number) => void
}

export function TablePageSelector({
  page,
  availablePages,
  onPageChange
}: TablePageSelectorProps): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const displayedDraft = draft ?? formatPage(page)
  const selectablePages = [...new Set([...availablePages, page])].sort(
    (left, right) => left - right
  )

  const commitDraft = (): void => {
    if (!/^[0-9A-F]{1,2}$/i.test(displayedDraft)) {
      setDraft(null)
      return
    }

    const nextPage = Number.parseInt(displayedDraft, 16)
    assertTablePage(nextPage)
    onPageChange(nextPage)
    setDraft(null)
  }

  const handleDraftChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value.toUpperCase()
    if (/^[0-9A-F]{0,2}$/.test(value)) setDraft(value)
  }

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    }
  }

  return (
    <div className="table-page-selector" aria-label="16-bit table page selector">
      <span className="table-page-selector__mode">Mode: 16-bit</span>
      <button
        type="button"
        aria-label="Previous page"
        title="Previous page"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        ‹
      </button>
      <label>
        <span>Page</span>
        <input
          value={displayedDraft}
          maxLength={2}
          aria-label="Hexadecimal table page"
          spellCheck={false}
          onBlur={commitDraft}
          onChange={handleDraftChange}
          onKeyDown={handleDraftKeyDown}
        />
      </label>
      <button
        type="button"
        aria-label="Next page"
        title="Next page"
        disabled={page === 0xff}
        onClick={() => onPageChange(page + 1)}
      >
        ›
      </button>
      <label>
        <span>Existing</span>
        <select
          value={page}
          aria-label="Pages present in the document"
          onChange={(event) => onPageChange(Number(event.target.value))}
        >
          {selectablePages.map((availablePage) => (
            <option key={availablePage} value={availablePage}>
              {formatPage(availablePage)}
            </option>
          ))}
        </select>
      </label>
      <span className="table-page-selector__range">
        Range: {formatPage(page)}00–{formatPage(page)}FF
      </span>
    </div>
  )
}

function formatPage(page: number): string {
  return page.toString(16).padStart(2, '0').toUpperCase()
}
