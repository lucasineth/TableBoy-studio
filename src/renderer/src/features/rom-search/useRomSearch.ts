import { useCallback, useEffect, useReducer, useRef } from 'react'

import type {
  SearchCancelledEvent,
  SearchCompleteEvent,
  SearchErrorEvent,
  SearchProgressEvent,
  SearchResultsEvent,
  SerializedSearchError
} from '../../../../shared/searchApi.ts'
import type { RomSearchRequest } from './searchRequest.ts'
import {
  initialRomSearchState,
  romSearchReducer,
  type RomSearchResultItem
} from './romSearchTypes.ts'

type BufferedSearchEvent =
  | { readonly kind: 'progress'; readonly payload: SearchProgressEvent }
  | { readonly kind: 'results'; readonly payload: SearchResultsEvent }
  | { readonly kind: 'complete'; readonly payload: SearchCompleteEvent }
  | { readonly kind: 'cancelled'; readonly payload: SearchCancelledEvent }
  | { readonly kind: 'error'; readonly payload: SearchErrorEvent }

const MAX_BUFFERED_START_EVENTS = 256

export function useRomSearch() {
  const [state, dispatch] = useReducer(romSearchReducer, initialRomSearchState)
  const activeJobIdRef = useRef<string | null>(null)
  const startingRef = useRef(false)
  const generationRef = useRef(0)
  const documentRef = useRef(state.document)
  const bufferedEventsRef = useRef<BufferedSearchEvent[]>([])

  useEffect(() => {
    documentRef.current = state.document
  }, [state.document])

  const applyEvent = useCallback((event: BufferedSearchEvent): void => {
    switch (event.kind) {
      case 'progress':
        dispatch({ type: 'PROGRESS', ...event.payload })
        break
      case 'results':
        dispatch({
          type: 'RESULTS',
          jobId: event.payload.jobId,
          results: toResultItems(event.payload)
        })
        break
      case 'complete':
        activeJobIdRef.current = null
        dispatch({ type: 'COMPLETE', ...event.payload })
        break
      case 'cancelled':
        activeJobIdRef.current = null
        dispatch({ type: 'CANCELLED', ...event.payload })
        break
      case 'error':
        activeJobIdRef.current = null
        dispatch({ type: 'ERROR', ...event.payload })
        break
    }
  }, [])

  const routeEvent = useCallback(
    (event: BufferedSearchEvent): void => {
      const jobId = event.payload.jobId
      if (jobId === activeJobIdRef.current) {
        applyEvent(event)
        return
      }
      if (startingRef.current && bufferedEventsRef.current.length < MAX_BUFFERED_START_EVENTS) {
        bufferedEventsRef.current.push(event)
      }
    },
    [applyEvent]
  )

  useEffect(() => {
    const api = window.searchAPI
    if (!api) return

    const unsubscribers = [
      api.onProgress((payload) => routeEvent({ kind: 'progress', payload })),
      api.onResults((payload) => routeEvent({ kind: 'results', payload })),
      api.onComplete((payload) => routeEvent({ kind: 'complete', payload })),
      api.onCancelled((payload) => routeEvent({ kind: 'cancelled', payload })),
      api.onError((payload) => routeEvent({ kind: 'error', payload }))
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [routeEvent])

  const cancelActiveSearch = useCallback(async (): Promise<void> => {
    const jobId = activeJobIdRef.current
    if (!jobId) return
    const api = window.searchAPI
    if (!api) return

    try {
      const response = await api.cancel(jobId)
      if (!response.ok) dispatch({ type: 'ERROR', jobId, error: response.error })
    } catch (error) {
      dispatch({
        type: 'ERROR',
        jobId,
        error: uiError('SEARCH_CANCEL_FAILED', errorMessage(error, 'Could not cancel the search.'))
      })
    }
  }, [])

  const closeDocument = useCallback(async (): Promise<void> => {
    const document = documentRef.current
    generationRef.current += 1
    startingRef.current = false
    bufferedEventsRef.current = []
    const jobId = activeJobIdRef.current
    activeJobIdRef.current = null

    try {
      if (jobId) await window.searchAPI?.cancel(jobId)
      if (document) await window.binaryDocuments?.close(document.id)
      documentRef.current = null
      dispatch({ type: 'DOCUMENT_CLOSED' })
    } catch (error) {
      dispatch({
        type: 'ERROR',
        error: uiError(
          'BINARY_CLOSE_FAILED',
          errorMessage(error, 'Could not close the binary file.')
        )
      })
    }
  }, [])

  const openDocument = useCallback(async (): Promise<void> => {
    const api = window.binaryDocuments
    if (!api) {
      dispatch({
        type: 'ERROR',
        error: uiError('BINARY_API_UNAVAILABLE', 'The binary file API is unavailable.')
      })
      return
    }

    try {
      const opened = await api.open()
      if (opened.canceled) return

      const previous = documentRef.current
      const previousJobId = activeJobIdRef.current
      generationRef.current += 1
      startingRef.current = false
      bufferedEventsRef.current = []
      activeJobIdRef.current = null
      try {
        if (previousJobId) await window.searchAPI?.cancel(previousJobId)
        if (previous) await api.close(previous.id)
      } catch (error) {
        await api.close(opened.document.id).catch(() => false)
        throw error
      }
      documentRef.current = opened.document
      dispatch({ type: 'DOCUMENT_OPENED', document: opened.document })
    } catch (error) {
      dispatch({
        type: 'ERROR',
        error: uiError('BINARY_OPEN_FAILED', errorMessage(error, 'Could not open the binary file.'))
      })
    }
  }, [])

  const startSearch = useCallback(
    async (request: RomSearchRequest): Promise<void> => {
      const document = documentRef.current
      const api = window.searchAPI
      if (!document || !api) {
        dispatch({
          type: 'ERROR',
          error: uiError('SEARCH_API_UNAVAILABLE', 'Open a binary document before searching.')
        })
        return
      }

      const generation = generationRef.current + 1
      generationRef.current = generation
      const previousJobId = activeJobIdRef.current
      activeJobIdRef.current = null
      startingRef.current = true
      bufferedEventsRef.current = []
      dispatch({ type: 'SEARCH_STARTING' })

      try {
        if (previousJobId) await api.cancel(previousJobId)
        const response = await api.start(document.id, request)
        if (generation !== generationRef.current) {
          if (response.ok) await api.cancel(response.jobId)
          return
        }

        startingRef.current = false
        if (!response.ok) {
          bufferedEventsRef.current = []
          dispatch({ type: 'ERROR', error: response.error })
          return
        }

        activeJobIdRef.current = response.jobId
        dispatch({ type: 'SEARCH_STARTED', jobId: response.jobId })
        const buffered = bufferedEventsRef.current
        bufferedEventsRef.current = []
        buffered
          .filter((event) => event.payload.jobId === response.jobId)
          .forEach((event) => applyEvent(event))
      } catch (error) {
        if (generation !== generationRef.current) return
        startingRef.current = false
        bufferedEventsRef.current = []
        dispatch({
          type: 'ERROR',
          error: uiError('SEARCH_START_FAILED', errorMessage(error, 'Could not start the search.'))
        })
      }
    },
    [applyEvent]
  )

  const selectResult = useCallback((offset: number): void => {
    dispatch({ type: 'SELECT_RESULT', offset })
  }, [])

  return {
    state,
    openDocument,
    closeDocument,
    startSearch,
    cancelActiveSearch,
    selectResult
  }
}

function toResultItems(event: SearchResultsEvent): RomSearchResultItem[] {
  if (event.searchType === 'strings')
    return event.results.map((result) => ({ kind: 'strings', result }))
  if (event.searchType === 'table') {
    return event.results.map((result) => ({ kind: 'table', result }))
  }
  if (event.searchType === 'relative') {
    return event.results.map((result) => ({ kind: 'relative', result }))
  }
  return []
}

function uiError(code: string, message: string): SerializedSearchError {
  return { name: 'RomSearchUiError', code, message }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
