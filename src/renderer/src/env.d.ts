import type { TableFileApi } from '../../shared/tableFileApi.ts'

declare global {
  interface Window {
    tableFiles?: TableFileApi
  }
}

export {}
