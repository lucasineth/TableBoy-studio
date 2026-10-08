export const CHARACTER_ENCODING_IDS = ['windows-1252', 'cp437', 'cp850', 'shift-jis'] as const

export type CharacterEncodingId = (typeof CHARACTER_ENCODING_IDS)[number]
export type CharacterEncodingFamily = 'windows' | 'oem' | 'japanese'
export type EncodedBytes = Uint8Array | readonly number[]

export interface CharacterEncoding {
  readonly id: CharacterEncodingId
  readonly label: string
  readonly family: CharacterEncodingFamily

  encode(text: string): Uint8Array
  decode(bytes: EncodedBytes): string
}
