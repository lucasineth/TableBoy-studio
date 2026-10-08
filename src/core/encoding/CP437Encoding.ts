import { IconvCharacterEncoding } from './IconvCharacterEncoding.ts'

export class CP437Encoding extends IconvCharacterEncoding {
  constructor() {
    super('cp437', 'CP437', 'oem', 'cp437')
  }
}
