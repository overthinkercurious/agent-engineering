import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), 'behavioral-eval.mjs')

test('behavioral evaluation CLI prepares isolated cases and scores missing blockers and edits', () => {
  const parent = mkdtempSync(join(tmpdir(), 'ae-behavioral-eval-'))
  const out = join(parent, 'cases')
  const call = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  try {
    const prepared = call('--out', out)
    assert.equal(prepared.status, 0, prepared.stderr)
    const items = JSON.parse(prepared.stdout).cases
    assert.equal(items.length, 6)
    assert.doesNotMatch(readFileSync(join(out, 'routine/evaluation-prompt.md'), 'utf8'), /expected verdict/i)
    for (const id of items) {
      writeFileSync(join(out, id, 'evaluation-result.json'), JSON.stringify({ verdict: 'PASS', findings: [] }))
    }
    const scored = call('--score', out)
    assert.equal(scored.status, 1)
    const result = JSON.parse(scored.stdout)
    assert.equal(result.total, 6)
    assert.ok(result.results.find((item) => item.id === 'authorization').missed.includes('cross-organization-access'))
    writeFileSync(join(out, 'assessment/contract.md'), 'changed\n')
    const altered = JSON.parse(call('--score', out).stdout)
    assert.deepEqual(altered.results.find((item) => item.id === 'assessment').changed_inputs, ['contract.md'])
  } finally { rmSync(parent, { recursive: true, force: true }) }
})
