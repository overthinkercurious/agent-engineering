#!/usr/bin/env node
// test-evals.mjs - Layer A of the eval suite.
//
// Runs every golden case in evals/cases.json through the real router and
// asserts the tier, team, skip set and approval requirement. Routing is a pure
// function of its inputs, so this is a genuine regression suite: change
// chooseTeam and these cases fail.
//
// What this CANNOT test is whether a specialist was deep enough to find
// anything - that needs a model, and it is Layer B (see evals/README.md).
// Keeping the two layers in one cases file is deliberate: a routing failure
// and a depth failure look identical from the outside and are fixed in
// completely different places.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forge = join(root, 'skills', 'ae-forge', 'scripts', 'forge.mjs')
const lensSelect = join(root, 'skills', 'ae-forge', 'scripts', 'lens-select.mjs')
const suite = JSON.parse(readFileSync(join(root, 'evals', 'cases.json'), 'utf8'))
const project = mkdtempSync(join(tmpdir(), 'ae-evals-'))

let passed = 0
let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}${detail ? `: ${detail}` : ''}\n`) }
}

process.stdout.write('\ngolden routing cases\n\n')

for (const item of suite.cases) {
  const argv = ['start', '--title', item.request, '--kind', item.kind, '--id', item.id, '--root', project]
  if (!item.omit_risk) argv.push('--risk', item.expect_risk?.length ? item.expect_risk.join(',') : 'none')
  if (item.signals?.length) argv.push('--signals', item.signals.join(','))
  if (item.domain?.length) argv.push('--domain', item.domain.join(','))

  const result = spawnSync(process.execPath, [forge, ...argv], { encoding: 'utf8' })
  let run
  try { run = JSON.parse(result.stdout) } catch { run = null }
  if (!run?.ok) { check(`${item.id}: starts`, false, result.stdout.slice(0, 200)); continue }

  const want = item.expect ?? {}
  const label = `${item.id} (${item.request.slice(0, 44)}…)`

  if (want.tier) {
    check(`${label} → tier ${want.tier}`, run.tier === want.tier, `got ${run.tier}`)
  }
  for (const role of want.team_includes ?? []) {
    check(`${label} → selects ${role}`, run.team.includes(role), `team=${run.team.join(',')}`)
  }
  for (const role of want.team_excludes ?? []) {
    check(`${label} → does not select ${role}`, !run.team.includes(role), `team=${run.team.join(',')}`)
  }
  for (const role of want.skipped_includes ?? []) {
    const why = run.routing?.skipped?.[role]
    check(`${label} → records why ${role} was skipped`, typeof why === 'string' && why.length > 0)
  }
  if (want.approval_required !== undefined) {
    check(`${label} → approval ${want.approval_required}`,
      run.approval_required === want.approval_required, `got ${run.approval_required}`)
  }
  if (want.risk_assessed !== undefined) {
    check(`${label} → risk_assessed ${want.risk_assessed}`,
      run.routing?.risk_assessed === want.risk_assessed)
  }
  if (want.lenses_include) {
    const lens = spawnSync(process.execPath, [lensSelect,
      '--team', run.team.join(','),
      '--signals', (item.signals ?? []).join(','),
      '--stack', (item.domain ?? []).join(',')], { encoding: 'utf8' })
    let attached = {}
    try { attached = JSON.parse(lens.stdout).attached ?? {} } catch { /* reported below */ }
    for (const [role, name] of Object.entries(want.lenses_include)) {
      check(`${label} → attaches ${name} to ${role}`,
        (attached[role] ?? []).includes(name), JSON.stringify(attached))
    }
  }
}

// Every planted defect must be owned by a role the case actually routes to.
// A defect nobody is selected to find is an un-gradeable case, not a hard one.
process.stdout.write('\nplanted defects are reachable by their owner\n\n')
for (const item of suite.cases) {
  for (const planted of item.planted ?? []) {
    const included = item.expect?.team_includes ?? []
    check(`${item.id}: ${planted.defect} is owned by a routed role (${planted.owner})`,
      included.includes(planted.owner),
      `owner ${planted.owner} not in ${included.join(',')}`)
  }
}

rmSync(project, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
