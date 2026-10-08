import { TableCodecError } from '../../core/codec/index.ts'
import { SearchExecutionError } from './SearchCoordinatorError.ts'
import type { SerializedSearchError } from './SearchProtocol.ts'

export function serializeSearchError(error: unknown): SerializedSearchError {
  if (error instanceof SearchExecutionError) return error.serialized

  if (error instanceof TableCodecError) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      details: {
        reason: error.reason,
        position: error.position,
        fragment: error.fragment,
        entryIndexes: [...error.entryIndexes]
      }
    }
  }

  if (error instanceof Error) {
    const code = readStringProperty(error, 'code')
    return {
      name: error.name,
      code,
      message: error.message
    }
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : 'An unknown search error occurred.'
  }
}

function readStringProperty(value: object, key: string): string | undefined {
  const property = (value as Record<string, unknown>)[key]
  return typeof property === 'string' ? property : undefined
}
