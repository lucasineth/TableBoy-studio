declare module '*?asset' {
  const assetPath: string
  export default assetPath
}

declare module '*?nodeWorker' {
  import type { Worker, WorkerOptions } from 'node:worker_threads'

  export default function createNodeWorker(options: WorkerOptions): Worker
}
