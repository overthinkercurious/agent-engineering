import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const forge = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills/ae-forge/scripts/forge.mjs')

test('request scope and completed source state select a current run without duplicating active work', () => {
  const root = mkdtempSync(join(tmpdir(), 'ae-run-identity-'))
  const put = (name, content) => {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  const start = (...extra) => {
    const result = spawnSync(process.execPath, [forge, 'start', '--title', 'Review names', '--kind', 'audit',
      '--risk', 'none', ...extra, '--root', root], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    return JSON.parse(result.stdout)
  }
  try {
    put('src/name.js', 'export const name = "first"\n')
    const first = start()
    assert.equal(start().id, first.id)
    assert.equal(start().reused, true)
    const record = join(root, `.dev/work/${first.id}/run.json`)
    const run = JSON.parse(readFileSync(record, 'utf8'))
    run.status = 'done'
    run.phase = 'done'
    run.source_fingerprint_at_finish = JSON.parse(readFileSync(join(root, '.dev/context/analysis.json'), 'utf8')).provenance.fingerprint
    put(`.dev/work/${first.id}/run.json`, `${JSON.stringify(run)}\n`)
    assert.equal(start().id, first.id)
    put('src/name.js', 'export const name = "second"\n')
    const stale = spawnSync(process.execPath, [forge, 'start', '--id', first.id, '--title', 'Review names',
      '--kind', 'audit', '--risk', 'none', '--root', root], { encoding: 'utf8' })
    assert.equal(stale.status, 4)
    const changed = start()
    assert.notEqual(changed.id, first.id)
    assert.equal(start().id, changed.id)
    const differentScope = start('--domain', 'android')
    assert.notEqual(differentScope.id, changed.id)
    assert.equal(start('--domain', 'android').id, differentScope.id)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('deep review does not automatically require user approval', () => {
  const root = mkdtempSync(join(tmpdir(), 'ae-review-authority-'))
  const start = (...extra) => spawnSync(process.execPath, [forge, 'start', '--id', extra.length ? 'decision' : 'review',
    '--title', extra.length ? 'Decide migration policy' : 'Inspect access boundary', '--kind', 'feature',
    '--risk', 'access', ...extra, '--root', root], { encoding: 'utf8' })
  try {
    const invalid = spawnSync(process.execPath, [forge, 'start', '--id', 'bad-read-only', '--title', 'Audit',
      '--kind', 'audit', '--risk', 'none', '--approval-required', '--approval-reason', 'Approve build',
      '--root', root], { encoding: 'utf8' })
    assert.equal(invalid.status, 2)
    const reviewed = start()
    assert.equal(reviewed.status, 0, reviewed.stdout)
    assert.equal(JSON.parse(reviewed.stdout).depth, 'deep')
    assert.equal(JSON.parse(reviewed.stdout).approval_required, false)
    const decision = start('--approval-required', '--approval-reason', 'Choose a data retention policy')
    assert.equal(decision.status, 0, decision.stdout)
    assert.equal(JSON.parse(decision.stdout).approval_required, true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
