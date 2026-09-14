#!/usr/bin/env node

import { assessRisk } from '../skills/ae-forge/scripts/risk.mjs'

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nPhase 5 risk classification\n\n')

const isolated = assessRisk({ kind: 'bug', policyFloor: 'light' })
check('isolated reversible defect stays light', isolated.effective_tier === 'light' && isolated.diagnosis_required)

const security = assessRisk({ kind: 'bug', signals: ['security'], policyFloor: 'light' })
check('the same defect becomes deep at a security boundary', security.effective_tier === 'deep' && security.added_specialists.includes('vault') && security.added_lenses.includes('threat'))

const filenameLead = assessRisk({ kind: 'bug', diffPaths: ['src/auth-helper.mjs'], diffText: '+const localValue = 1', policyFloor: 'light', source: 'completed_diff' })
check('a filename match is a lead rather than proof of risk', filenameLead.effective_tier === 'light' && filenameLead.inputs.filename_leads.includes('src/auth-helper.mjs'))

const changedBehavior = assessRisk({ kind: 'bug', diffPaths: ['src/service.mjs'], diffText: '+export function authorizeTenant(permission) { return permission }', policyFloor: 'light', source: 'completed_diff' })
check('changed security behavior raises completed-diff risk', changedBehavior.effective_tier === 'deep' && changedBehavior.dimensions.sensitivity === 'security')

const noDowngrade = assessRisk({ kind: 'bug', policyFloor: 'light', previousTier: 'deep' })
check('reclassification cannot lower prior rigor', noDowngrade.effective_tier === 'deep')

const crossSystem = assessRisk({ kind: 'feature', signals: ['external'], policyFloor: 'light' })
check('cross-system scope adds integration and failure coverage', crossSystem.effective_tier === 'deep' && crossSystem.added_specialists.includes('spine') && crossSystem.added_lenses.includes('failure'))

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1

