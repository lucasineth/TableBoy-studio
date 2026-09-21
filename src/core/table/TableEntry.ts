/** A single variable-width byte sequence and its textual representation. */
export interface TableEntry {
  key: number[]
  value: string
  comment?: string
}
