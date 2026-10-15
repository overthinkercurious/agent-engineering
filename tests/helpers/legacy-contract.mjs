import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Existing lifecycle fixtures exercise stored v12 compatibility. New v13
// acceptance and rejection cases live in forge-evidence.test.mjs.
export function retainV12(root, args, result) {
  if (args[0] === 'start' && result.status === 0) {
    const { id } = JSON.parse(result.stdout)
    const path = join(root, '.dev/work', id, 'run.json')
    const run = JSON.parse(readFileSync(path, 'utf8'))
    if (run.contract === 13) {
      run.contract = 12
      writeFileSync(path, JSON.stringify(run, null, 2) + '\n')
    }
  }
  return result
}
