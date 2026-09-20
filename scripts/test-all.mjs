#!/usr/bin/env node

import { existsSync } from 'node:fs'
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
  [process.execPath, ['scripts/test-packaging.mjs']],
  [process.execPath, ['scripts/test-docs-consistency.mjs']],
  [bash, ['scripts/test-scaffold.sh']],
  [bash, ['scripts/test-artifacts.sh']],
]

for (const [command, args] of checks) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit' })
  if (result.error) {
    process.stderr.write(`Unable to start ${command}: ${result.error.message}\n`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
