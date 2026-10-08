export interface CharacterOption {
  value: string
  label?: string
  unicode?: string
}

export interface CharacterCategory {
  id: string
  label: string
  group: 'Latin' | 'Symbols' | 'Japanese'
  characters: readonly CharacterOption[]
  presentation?: 'compact' | 'grid'
  ordered: boolean
  discoverable: boolean
}
