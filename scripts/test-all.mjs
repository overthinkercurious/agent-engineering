#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function findBash() {
  if (process.platform !== 'win32') return 'bash'
  const candidates = [
    'C:/Program Files/Git/bin/bash.exe',
    'C:/Program Files/Git/usr/bin/bash.exe',
    `${process.env.LOCALAPPDATA || ''}/Programs/Git/bin/bash.exe`,
  ]
  return candidates.find((path) => existsSync(path)) || 'bash'
}

const bash = findBash()
const checks = [
  [bash, ['scripts/validate-suite.sh']],
  [process.execPath, ['scripts/validate-forge.mjs']],
  [process.execPath, ['scripts/test-forge.mjs']],
  // test-lens-selection was present but never run by the suite; a test nothing
  // invokes is a test that cannot fail.
  [process.execPath, ['scripts/test-lens-selection.mjs']],
  [process.execPath, ['scripts/test-evals.mjs']],
  // The one artifact that crosses a skill boundary. Its fields were read with
  // ?? [] everywhere, so a rename degraded lens depth silently instead of
  // failing - the only fail-open path in a kit that is fail-closed elsewhere.
  [process.execPath, ['scripts/test-contract.mjs']],
  // The enforcement tier. It must refuse the two things the kit claims, and
  // fail open on everything it cannot parse.
  [process.execPath, ['scripts/test-guard.mjs']],
  [process.execPath, ['scripts/test-packaging.mjs']],
  [process.execPath, ['scripts/test-docs-consistency.mjs']],
  [bash, ['scripts/test-scaffold.sh']],
  [bash, ['scripts/test-artifacts.sh']],
]

// Two real gates used to sit outside this list, which is the same "a test
// nothing invokes is a test that cannot fail" problem the lens CLI had.
// verify-citations needs a knowledge base to check; skipping when the
// repository has none is honest, claiming it passed would not be.
if (existsSync(join(process.cwd(), '.dev', 'knowledge'))) {
  checks.push([process.execPath, ['skills/ae-surveyor/scripts/verify-citations.mjs', '--quiet']])
} else {
  process.stdout.write('  SKIP  verify-citations.mjs (no .dev/knowledge in this checkout)\n')
}

for (const [command, args] of checks) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit' })
  if (result.error) {
    process.stderr.write(`Unable to start ${command}: ${result.error.message}\n`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
