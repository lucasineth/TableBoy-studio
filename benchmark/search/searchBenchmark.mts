import { performance } from 'node:perf_hooks'

import { BinarySearchEngine } from '../../src/core/search/index.ts'
import { createPattern, createSyntheticBinary, MIB, placePattern } from './syntheticData.mts'

type Scenario = 'none' | 'few' | 'many' | 'end'

interface BenchmarkResult {
  sizeMiB: number
  patternBytes: number
  scenario: Scenario
  results: number
  durationMs: number
  throughputMiBs: number
}

interface StrategyResult {
  strategy: string
  scenario: 'none' | 'many'
  results: number
  durationMs: number
  throughputMiBs: number
}

const sizesMiB = [1, 4, 16, 32, 64]
const patternSizes = [4, 8, 16, 32]
const scenarios: Scenario[] = ['none', 'few', 'many', 'end']
const engine = new BinarySearchEngine()

function scenarioOffsets(scenario: Scenario, dataLength: number, patternLength: number): number[] {
  const finalOffset = dataLength - patternLength

  switch (scenario) {
    case 'none':
      return []
    case 'few':
      return [Math.floor(dataLength / 5), Math.floor(dataLength / 2), finalOffset - 17]
    case 'many': {
      const offsets: number[] = []
      for (let offset = 1024; offset <= finalOffset; offset += 4096) offsets.push(offset)
      return offsets
    }
    case 'end':
      return [finalOffset]
  }
}

function benchmarkCase(
  baseData: Uint8Array,
  sizeMiB: number,
  patternBytes: number,
  scenario: Scenario
): BenchmarkResult {
  const data = baseData.slice()
  const pattern = createPattern(patternBytes)
  placePattern(data, pattern, scenarioOffsets(scenario, data.length, pattern.length))

  const startedAt = performance.now()
  const results = engine.search(data, pattern)
  const durationMs = performance.now() - startedAt

  return {
    sizeMiB,
    patternBytes,
    scenario,
    results: results.length,
    durationMs,
    throughputMiBs: sizeMiB / (durationMs / 1000)
  }
}

function formatResults(results: readonly BenchmarkResult[]): void {
  console.log('size  pattern  scenario  results  duration(ms)  throughput(MiB/s)')
  for (const result of results) {
    console.log(
      `${String(result.sizeMiB).padStart(4)}  ${String(result.patternBytes).padStart(7)}  ${result.scenario.padEnd(8)}  ${String(result.results).padStart(7)}  ${result.durationMs.toFixed(2).padStart(12)}  ${result.throughputMiBs.toFixed(2).padStart(17)}`
    )
  }
}

function benchmarkBatchDelivery(): void {
  const data = createSyntheticBinary(64)
  const pattern = createPattern(8)
  placePattern(data, pattern, scenarioOffsets('many', data.length, pattern.length))

  const withoutCallbackStart = performance.now()
  const withoutCallback = engine.search(data, pattern)
  const withoutCallbackMs = performance.now() - withoutCallbackStart

  let delivered = 0
  const callbackStart = performance.now()
  const withCallback = engine.search(data, pattern, {
    onResults(batch) {
      delivered += batch.length
    }
  })
  const withCallbackMs = performance.now() - callbackStart

  console.log('\nBatch delivery (64 MiB, 8-byte pattern, many occurrences)')
  console.log(
    JSON.stringify({
      results: withCallback.length,
      delivered,
      withoutCallbackMs: Number(withoutCallbackMs.toFixed(2)),
      withCallbackMs: Number(withCallbackMs.toFixed(2)),
      overheadPercent: Number(((withCallbackMs / withoutCallbackMs - 1) * 100).toFixed(2))
    })
  )
}

function indexOfSearch(data: Uint8Array, pattern: Uint8Array): number {
  const lastOffset = data.length - pattern.length
  let count = 0
  let fromOffset = 0

  while (fromOffset <= lastOffset) {
    const offset = data.indexOf(pattern[0], fromOffset)
    if (offset < 0 || offset > lastOffset) break

    let matches = true
    for (let patternOffset = 1; patternOffset < pattern.length; patternOffset += 1) {
      if (data[offset + patternOffset] !== pattern[patternOffset]) {
        matches = false
        break
      }
    }
    if (matches) count += 1
    fromOffset = offset + 1
  }

  return count
}

function boyerMooreHorspoolSearch(data: Uint8Array, pattern: Uint8Array): number {
  const skip = new Uint32Array(256)
  skip.fill(pattern.length)
  for (let index = 0; index < pattern.length - 1; index += 1) {
    skip[pattern[index]] = pattern.length - 1 - index
  }

  let count = 0
  let offset = 0
  const lastOffset = data.length - pattern.length
  while (offset <= lastOffset) {
    let patternOffset = pattern.length - 1
    while (patternOffset >= 0 && data[offset + patternOffset] === pattern[patternOffset]) {
      patternOffset -= 1
    }

    if (patternOffset < 0) {
      count += 1
      offset += 1
    } else {
      offset += skip[data[offset + pattern.length - 1]]
    }
  }

  return count
}

function benchmarkStrategies(): void {
  const strategies = [
    {
      name: 'core-segmented-indexOf',
      search: (data: Uint8Array, pattern: Uint8Array): number => engine.search(data, pattern).length
    },
    { name: 'uint8-indexOf', search: indexOfSearch },
    { name: 'boyer-moore-horspool', search: boyerMooreHorspoolSearch }
  ]
  const results: StrategyResult[] = []
  const baseData = createSyntheticBinary(64)

  for (const scenario of ['none', 'many'] as const) {
    const data = baseData.slice()
    const pattern = createPattern(8)
    placePattern(data, pattern, scenarioOffsets(scenario, data.length, pattern.length))

    for (const strategy of strategies) {
      const startedAt = performance.now()
      const resultCount = strategy.search(data, pattern)
      const durationMs = performance.now() - startedAt
      results.push({
        strategy: strategy.name,
        scenario,
        results: resultCount,
        durationMs,
        throughputMiBs: 64 / (durationMs / 1000)
      })
    }
  }

  console.log('\nAlgorithm comparison (64 MiB, 8-byte pattern)')
  console.log('strategy                 scenario  results  duration(ms)  throughput(MiB/s)')
  for (const result of results) {
    console.log(
      `${result.strategy.padEnd(24)} ${result.scenario.padEnd(8)} ${String(result.results).padStart(8)}  ${result.durationMs.toFixed(2).padStart(12)}  ${result.throughputMiBs.toFixed(2).padStart(17)}`
    )
  }
}

async function measureEventLoopImpact(): Promise<void> {
  const data = createSyntheticBinary(64)
  const pattern = createPattern(8)
  let timerDelayMs = 0
  const scheduledAt = performance.now()
  const timer = new Promise<void>((resolve) => {
    setTimeout(() => {
      timerDelayMs = performance.now() - scheduledAt
      resolve()
    }, 0)
  })

  const searchStartedAt = performance.now()
  engine.search(data, pattern)
  const searchDurationMs = performance.now() - searchStartedAt
  await timer

  console.log('\nEvent-loop probe (64 MiB, 8-byte pattern, no occurrence)')
  console.log(
    JSON.stringify({
      searchDurationMs: Number(searchDurationMs.toFixed(2)),
      zeroDelayTimerObservedAfterMs: Number(timerDelayMs.toFixed(2))
    })
  )
}

const results: BenchmarkResult[] = []
for (const sizeMiB of sizesMiB) {
  const baseData = createSyntheticBinary(sizeMiB)
  for (const patternBytes of patternSizes) {
    for (const scenario of scenarios) {
      results.push(benchmarkCase(baseData, sizeMiB, patternBytes, scenario))
    }
  }
}

formatResults(results)
benchmarkBatchDelivery()
benchmarkStrategies()
await measureEventLoopImpact()

const totalBytesScanned = results.reduce((total, result) => total + result.sizeMiB * MIB, 0)
console.log(`\nTotal benchmark input scanned: ${(totalBytesScanned / MIB).toFixed(0)} MiB`)
