import createSearchWorker from './searchWorker.ts?nodeWorker'
import { SearchCoordinator } from './SearchCoordinator.ts'

export function createSearchCoordinator(): SearchCoordinator {
  return new SearchCoordinator(() => createSearchWorker({ name: 'tableboy-search' }))
}
