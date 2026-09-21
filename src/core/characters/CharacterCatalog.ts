import type { CharacterCategory, CharacterOption } from './CharacterCategory.ts'

function characterRange(firstCodePoint: number, length: number): CharacterOption[] {
  return Array.from({ length }, (_, index) =>
    characterOption(String.fromCodePoint(firstCodePoint + index))
  )
}

function characterOptions(values: readonly string[]): CharacterOption[] {
  return values.map(characterOption)
}

function characterOption(value: string): CharacterOption {
  const codePoint = value.codePointAt(0)
  return {
    value,
    unicode:
      codePoint === undefined
        ? undefined
        : `U+${codePoint.toString(16).padStart(4, '0').toUpperCase()}`
  }
}

export const uppercaseCategory: CharacterCategory = {
  id: 'uppercase',
  label: 'Maiúsculas (A-Z)',
  characters: characterRange(0x41, 26),
  behavior: 'sequential',
  presentation: 'compact'
}

export const lowercaseCategory: CharacterCategory = {
  id: 'lowercase',
  label: 'Minúsculas (a-z)',
  characters: characterRange(0x61, 26),
  behavior: 'sequential',
  presentation: 'compact'
}

export const numbersCategory: CharacterCategory = {
  id: 'numbers',
  label: 'Números (0-9)',
  characters: characterRange(0x30, 10),
  behavior: 'sequential',
  presentation: 'compact'
}

export const portugueseCategory: CharacterCategory = {
  id: 'pt-br',
  label: 'Português PT-BR',
  characters: characterOptions([
    'Á',
    'À',
    'Â',
    'Ã',
    'É',
    'Ê',
    'Í',
    'Ó',
    'Ô',
    'Õ',
    'Ú',
    'Ü',
    'Ç',
    'á',
    'à',
    'â',
    'ã',
    'é',
    'ê',
    'í',
    'ó',
    'ô',
    'õ',
    'ú',
    'ü',
    'ç'
  ]),
  behavior: 'picker',
  presentation: 'compact'
}

const romajiCharacters = [
  'a',
  'i',
  'u',
  'e',
  'o',
  'ka',
  'ki',
  'ku',
  'ke',
  'ko',
  'sa',
  'shi',
  'su',
  'se',
  'so',
  'ta',
  'chi',
  'tsu',
  'te',
  'to',
  'na',
  'ni',
  'nu',
  'ne',
  'no',
  'ha',
  'hi',
  'fu',
  'he',
  'ho',
  'ma',
  'mi',
  'mu',
  'me',
  'mo',
  'ya',
  'yu',
  'yo',
  'ra',
  'ri',
  'ru',
  're',
  'ro',
  'wa',
  'wo',
  'n'
]

const hiraganaCharacters = [
  'あ',
  'い',
  'う',
  'え',
  'お',
  'か',
  'き',
  'く',
  'け',
  'こ',
  'さ',
  'し',
  'す',
  'せ',
  'そ',
  'た',
  'ち',
  'つ',
  'て',
  'と',
  'な',
  'に',
  'ぬ',
  'ね',
  'の',
  'は',
  'ひ',
  'ふ',
  'へ',
  'ほ',
  'ま',
  'み',
  'む',
  'め',
  'も',
  'や',
  'ゆ',
  'よ',
  'ら',
  'り',
  'る',
  'れ',
  'ろ',
  'わ',
  'を',
  'ん'
]

const katakanaCharacters = [
  'ア',
  'イ',
  'ウ',
  'エ',
  'オ',
  'カ',
  'キ',
  'ク',
  'ケ',
  'コ',
  'サ',
  'シ',
  'ス',
  'セ',
  'ソ',
  'タ',
  'チ',
  'ツ',
  'テ',
  'ト',
  'ナ',
  'ニ',
  'ヌ',
  'ネ',
  'ノ',
  'ハ',
  'ヒ',
  'フ',
  'ヘ',
  'ホ',
  'マ',
  'ミ',
  'ム',
  'メ',
  'モ',
  'ヤ',
  'ユ',
  'ヨ',
  'ラ',
  'リ',
  'ル',
  'レ',
  'ロ',
  'ワ',
  'ヲ',
  'ン'
]

export const characterCatalog: readonly CharacterCategory[] = [
  uppercaseCategory,
  lowercaseCategory,
  numbersCategory,
  portugueseCategory,
  {
    id: 'romaji',
    label: 'Romaji',
    characters: characterOptions(romajiCharacters),
    behavior: 'picker',
    presentation: 'grid'
  },
  {
    id: 'katakana',
    label: 'Katakana',
    characters: characterOptions(katakanaCharacters),
    behavior: 'picker',
    presentation: 'grid'
  },
  {
    id: 'hiragana',
    label: 'Hiragana',
    characters: characterOptions(hiraganaCharacters),
    behavior: 'picker',
    presentation: 'grid'
  },
  { id: 'blocks', label: 'Blocos', characters: [], behavior: 'picker', presentation: 'grid' }
]
