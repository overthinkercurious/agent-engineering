#!/usr/bin/env node

// Behavioral evaluation of Forge's team + lens selection on representative
// requests. Complements test-forge.mjs (ledger mechanics) and
// validate-forge.mjs (structural wiring): this file checks routing quality
// — does the right lens attach to the right role for the right reason, and
// does an ambiguous or unavailable signal behave correctly instead of
// silently over- or under-triggering.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { loadTeamContract, selectLenses } from '../skills/ae-forge/scripts/lens-select.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forge = join(root, 'skills', 'ae-forge', 'scripts', 'forge.mjs')
const teamJsonPath = join(root, 'skills', 'ae-forge', 'references', 'team.json')
const team = loadTeamContract(teamJsonPath)
const project = mkdtempSync(join(tmpdir(), 'ae-forge-lens-eval-'))
let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}${detail ? `: ${detail}` : ''}\n`) }
}

function scenario(id, { title, kind, signals = [], stack = [] }) {
  const start = spawnSync(process.execPath, [
    forge, 'start', '--title', title, '--kind', kind,
    ...(signals.length ? ['--signals', signals.join(',')] : []),
    '--id', id, '--root', project,
  ], { encoding: 'utf8' })
  const body = JSON.parse(start.stdout)
  const lenses = selectLenses(team, body.team, signals, stack)
  return { tier: body.tier, roles: body.team, lenses }
}

// 1. Trivial, local, reversible change: no lens should attach at all.
{
  const r = scenario('trivial', { title: 'Fix a typo in the footer copy', kind: 'feature', signals: ['copy', 'local'] })
  check('trivial change selects no lens', Object.keys(r.lenses.attached).length === 0, JSON.stringify(r.lenses))
}

// 2. Genuine Android defect: android lens should attach to architect, builder, verifier.
{
  const r = scenario('android-defect', { title: 'App crashes after rotation on the sync screen', kind: 'bug', signals: ['android', 'kotlin', 'jetpack'] })
  check('android defect attaches android lens to architect/builder/verifier',
    ['architect', 'builder', 'verifier'].every((role) => (r.lenses.attached[role] || []).includes('android')),
    JSON.stringify(r.lenses))
  check('android defect does not attach android lens to investigator (not in attaches_to)',
    !(r.lenses.attached.investigator || []).includes('android'), JSON.stringify(r.lenses))
}

// 3. Ambiguous bare keyword ("gradle") must NOT auto-trigger the Android lens on its own.
{
  const r = scenario('ambiguous-gradle', { title: 'Speed up the build script', kind: 'feature', signals: ['gradle'] })
  check('bare "gradle" signal does not trigger the android lens',
    !(r.lenses.attached.architect || []).includes('android') && !(r.lenses.attached.builder || []).includes('android'),
    JSON.stringify(r.lenses))
}

// 4. UI-visual change should attach ui-finish to experience/architect/builder.
{
  const r = scenario('ui-visual', { title: 'Redesign the settings screen layout', kind: 'feature', signals: ['ui', 'design-system'] })
  check('UI-visual change attaches ui-finish to experience/architect/builder',
    ['experience', 'architect', 'builder'].every((role) => (r.lenses.attached[role] || []).includes('ui-finish')),
    JSON.stringify(r.lenses))
}

// 5. Cross-boundary change: android + ui-finish both apply, exercising the 2-lens cap
//    on the roles both lenses attach to (architect, builder), while experience and
//    verifier each get only the one lens that applies to them.
{
  const r = scenario('cross-boundary', { title: 'Redesign the Android app settings screen', kind: 'feature', signals: ['android', 'ui', 'design-system'] })
  check('cross-boundary change caps architect at 2 lenses (android + ui-finish)',
    JSON.stringify(r.lenses.attached.architect) === JSON.stringify(['android', 'ui-finish']), JSON.stringify(r.lenses))
  check('cross-boundary change caps builder at 2 lenses (android + ui-finish)',
    JSON.stringify(r.lenses.attached.builder) === JSON.stringify(['android', 'ui-finish']), JSON.stringify(r.lenses))
  check('cross-boundary change gives verifier only android (ui-finish does not attach there)',
    JSON.stringify(r.lenses.attached.verifier) === JSON.stringify(['android']), JSON.stringify(r.lenses))
  check('cross-boundary change gives experience only ui-finish (android does not attach there)',
    JSON.stringify(r.lenses.attached.experience) === JSON.stringify(['ui-finish']), JSON.stringify(r.lenses))
}

// 6. Missing specialist guidance: a signal names a backlog (not-yet-written) lens.
//    Must surface as LENS UNAVAILABLE, not silently ignored or improvised.
{
  const r = scenario('missing-lens', { title: 'Add a new checkout payment method', kind: 'feature', signals: ['payments'] })
  check('a backlog-lens signal is reported unavailable rather than silently dropped',
    r.lenses.unavailable.includes('payments'), JSON.stringify(r.lenses))
  check('an unavailable lens does not get invented as an attached lens',
    Object.values(r.lenses.attached).every((list) => list.length === 0 || !list.includes('payments')), JSON.stringify(r.lenses))
}

rmSync(project, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
