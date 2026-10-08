export const UNICODE_NORMALIZATION_FORMS = ['none', 'NFC', 'NFD', 'NFKC', 'NFKD'] as const

export type UnicodeNormalizationForm = (typeof UNICODE_NORMALIZATION_FORMS)[number]

export class UnicodeNormalizationError extends Error {
  readonly code = 'INVALID_NORMALIZATION'
  readonly form: string

  constructor(form: string) {
    super(`Unknown Unicode normalization form: ${JSON.stringify(form)}.`)
    this.name = 'UnicodeNormalizationError'
    this.form = form
  }
}

export function normalizeUnicode(text: string, form: UnicodeNormalizationForm = 'none'): string {
  if (form === 'none') return text
  if (!UNICODE_NORMALIZATION_FORMS.includes(form)) throw new UnicodeNormalizationError(form)
  return text.normalize(form)
}
