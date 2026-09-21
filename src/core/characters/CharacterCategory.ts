export interface CharacterOption {
  value: string
  label?: string
  unicode?: string
}

export interface CharacterCategory {
  id: string
  label: string
  characters: readonly CharacterOption[]
  behavior: 'sequential' | 'picker'
  presentation?: 'compact' | 'grid'
}
