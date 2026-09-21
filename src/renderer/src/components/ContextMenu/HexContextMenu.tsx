import { useEffect, useState, type CSSProperties } from 'react'

import type {
  CharacterCategory,
  CharacterOption
} from '../../../../core/characters/CharacterCategory.ts'
import { toByteHex } from '../../../../core/table/EightBitTable.ts'

interface HexContextMenuProps {
  selectedByte: number
  x: number
  y: number
  categories: readonly CharacterCategory[]
  onClose: () => void
  onApplySequence: (category: CharacterCategory) => void
  onSelectCharacter: (option: CharacterOption) => void
}

export function HexContextMenu({
  selectedByte,
  x,
  y,
  categories,
  onClose,
  onApplySequence,
  onSelectCharacter
}: HexContextMenuProps): React.JSX.Element {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [previewOption, setPreviewOption] = useState<CharacterOption | null>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('pointerdown', onClose)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', onClose)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const activeCategory = categories.find((category) => category.id === activeCategoryId)
  const style: CSSProperties = {
    left: Math.max(6, Math.min(x, window.innerWidth - 224)),
    top: Math.max(6, Math.min(y, window.innerHeight - 330))
  }
  const opensToLeft = x > window.innerWidth - 570

  const activateCategory = (category: CharacterCategory): void => {
    if (category.behavior !== 'picker') {
      setActiveCategoryId(null)
      setPreviewOption(null)
      return
    }

    setActiveCategoryId(category.id)
    setPreviewOption(category.characters[0] ?? null)
  }

  const handleCategoryClick = (category: CharacterCategory): void => {
    if (category.behavior === 'sequential') {
      onApplySequence(category)
      return
    }

    activateCategory(category)
  }

  return (
    <div
      className={`context-menu${opensToLeft ? ' context-menu--picker-left' : ''}`}
      style={style}
      role="menu"
      aria-label={`Character catalog for byte ${toByteHex(selectedByte)}`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="context-menu__eyebrow">Choose character · {toByteHex(selectedByte)}</div>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="menuitem"
          aria-haspopup={category.behavior === 'picker' ? 'dialog' : undefined}
          aria-expanded={
            category.behavior === 'picker' ? activeCategoryId === category.id : undefined
          }
          title={
            category.behavior === 'sequential'
              ? `Fill sequentially from ${toByteHex(selectedByte)}`
              : undefined
          }
          onClick={() => handleCategoryClick(category)}
          onFocus={() => activateCategory(category)}
          onPointerEnter={() => activateCategory(category)}
        >
          <span>{category.label}</span>
          <span aria-hidden="true">{category.behavior === 'sequential' ? '↦' : '›'}</span>
        </button>
      ))}

      {activeCategory ? (
        <CharacterPicker
          category={activeCategory}
          previewOption={previewOption}
          onPreview={setPreviewOption}
          onSelect={onSelectCharacter}
        />
      ) : null}
    </div>
  )
}

interface CharacterPickerProps {
  category: CharacterCategory
  previewOption: CharacterOption | null
  onPreview: (option: CharacterOption) => void
  onSelect: (option: CharacterOption) => void
}

function CharacterPicker({
  category,
  previewOption,
  onPreview,
  onSelect
}: CharacterPickerProps): React.JSX.Element {
  return (
    <section className="character-picker" role="dialog" aria-label={category.label}>
      <header className="character-picker__header">
        <strong>{category.label}</strong>
        <span>{category.characters.length} characters</span>
      </header>

      {category.characters.length === 0 ? (
        <div className="character-picker__empty">Nenhum caractere definido ainda.</div>
      ) : (
        <div
          className={`character-picker__grid${category.presentation === 'grid' ? ' character-picker__grid--large' : ''}`}
          role="group"
          aria-label={`${category.label} characters`}
        >
          {category.characters.map((option) => (
            <button
              key={`${option.value}-${option.unicode ?? option.label ?? ''}`}
              type="button"
              className="character-option"
              aria-label={`${option.label ?? option.value}${option.unicode ? `, ${option.unicode}` : ''}`}
              title={option.unicode}
              onClick={() => onSelect(option)}
              onFocus={() => onPreview(option)}
              onPointerEnter={() => onPreview(option)}
            >
              {option.label ?? option.value}
            </button>
          ))}
        </div>
      )}

      <footer className="character-picker__preview" aria-live="polite">
        <span>
          Character: <strong>{previewOption?.value ?? '—'}</strong>
        </span>
        <span>
          Unicode: <strong>{previewOption?.unicode ?? '—'}</strong>
        </span>
      </footer>
    </section>
  )
}
