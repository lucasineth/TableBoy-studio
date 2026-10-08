import { IconvCharacterEncoding } from './IconvCharacterEncoding.ts'

export class CP850Encoding extends IconvCharacterEncoding {
  constructor() {
    super('cp850', 'CP850', 'oem', 'cp850')
  }
}
