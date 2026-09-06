import { readFileSync, writeFileSync } from 'node:fs'

const file = 'src/generated/meta.ts'
const content = readFileSync(file, 'utf8')
const cleaned = content
  .split('\n')
  .filter(line => !line.startsWith('// @see '))
  .join('\n')

writeFileSync(file, cleaned)
