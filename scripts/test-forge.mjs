#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forge = join(root, 'skills', 'ae-forge', 'scripts', 'forge.mjs')
const project = mkdtempSync(join(tmpdir(), 'ae-forge-simple-'))
let passed = 0
let failed = 0

function run(args) {
  return spawnSync(process.execPath, [forge, ...args, '--root', project], { encoding: 'utf8' })
}
function check(name, condition, detail = '') {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}${detail ? `: ${detail}` : ''}\n`) }
}
function body(result) {
  try { return JSON.parse(result.stdout) } catch { return null }
}

const help = run(['help'])
check('runner starts', help.status === 0 && help.stdout.includes('Users do not need to run these commands'))

const standard = run(['start', '--title', 'Add profile editing', '--kind', 'feature', '--id', 'profile'])
const standardBody = body(standard)
check('standard run starts without initialization', standard.status === 0)
check('standard team is Architect, Builder, Verifier',
  JSON.stringify(standardBody?.team) === JSON.stringify(['architect', 'builder', 'verifier']))
check('standard work does not demand ceremonial approval', standardBody?.approval_required === false)

const premature = run(['finish', '--id', 'profile', '--summary', 'done', '--verification', 'tests passed'])
check('run cannot finish without implementation and verification', premature.status === 5)

const earlyBuild = run(['phase', '--id', 'profile', '--to', 'build', '--summary', 'Building.'])
check('standard work requires Architect before build', earlyBuild.status === 5)
for (const [role, summary] of [['architect', 'Planned the smallest safe change.'], ['builder', 'Implemented the requested behavior.'], ['verifier', 'Reviewed the diff and checks passed.']]) {
  const note = run(['note', '--id', 'profile', '--role', role, '--summary', summary])
  check(`${role} contribution records`, note.status === 0)
  if (role === 'architect') check('planned standard work can build', run(['phase', '--id', 'profile', '--to', 'build', '--summary', 'Building planned scope.']).status === 0)
  if (role === 'builder') check('implemented work can enter verification', run(['phase', '--id', 'profile', '--to', 'verify', '--summary', 'Verifying candidate.']).status === 0)
}
const finish = run(['finish', '--id', 'profile', '--summary', 'Profile editing delivered.', '--verification', 'Focused tests passed; verifier PASS.'])
check('implemented and verified run finishes', finish.status === 0 && body(finish)?.status === 'done')

const quick = body(run(['start', '--title', 'Fix copy', '--kind', 'feature', '--signals', 'copy,local', '--id', 'copy-fix']))
check('small reversible work selects two roles', quick?.tier === 'quick' && quick?.team.length === 2)

const deep = body(run(['start', '--title', 'Tenant payments', '--kind', 'feature', '--signals', 'tenant,payment', '--id', 'tenant-payments']))
check('high-risk work selects the dedicated Security expert', deep?.tier === 'deep' && deep?.team.includes('security'))
const blockedBuild = run(['phase', '--id', 'tenant-payments', '--to', 'build', '--summary', 'Ready to build.'])
check('deep work requires every pre-build expert',
  blockedBuild.status === 5 &&
  body(blockedBuild)?.missing?.includes('architect') &&
  body(blockedBuild)?.missing?.includes('security'))
for (const role of ['architect', 'security']) {
  run(['note', '--id', 'tenant-payments', '--role', role, '--summary', `${role} completed its work.`])
}
const unapprovedBuild = run(['phase', '--id', 'tenant-payments', '--to', 'build', '--summary', 'Ready after planning.'])
check('deep work requires material approval before build', unapprovedBuild.status === 5 && body(unapprovedBuild)?.error.includes('approval'))
check('approval records', run(['approve', '--id', 'tenant-payments', '--by', 'user']).status === 0)
check('approved and planned deep work can build', run(['phase', '--id', 'tenant-payments', '--to', 'build', '--summary', 'Building approved scope.']).status === 0)
run(['note', '--id', 'tenant-payments', '--role', 'builder', '--summary', 'Builder completed its work.'])
check('deep work enters verification after build', run(['phase', '--id', 'tenant-payments', '--to', 'verify', '--summary', 'Verifying deep change.']).status === 0)
const earlyVerifier = run(['note', '--id', 'tenant-payments', '--role', 'verifier', '--summary', 'Verifier reviewed the integrated candidate.'])
check('Verifier waits for specialist candidate review',
  earlyVerifier.status === 5 && body(earlyVerifier)?.missing?.includes('security'))
run(['note', '--id', 'tenant-payments', '--role', 'security', '--summary', 'Security completed its candidate review.'])
run(['note', '--id', 'tenant-payments', '--role', 'verifier', '--summary', 'Verifier reviewed the integrated candidate.'])
const failedVerdict = run(['finish', '--id', 'tenant-payments', '--summary', 'Not safe.', '--verification', 'Verifier found a blocker.', '--result', 'FAIL'])
check('a failed verifier verdict cannot close a run', failedVerdict.status === 2)

const record = JSON.parse(readFileSync(join(project, '.dev', 'work', 'profile', 'run.json'), 'utf8'))
check('one compact record preserves phased contributions',
  record.status === 'done' && record.contributions.length === 3 && record.contributions.every((item) => item.phase))
const audit = body(run(['start', '--title', 'Review tenant authorization', '--kind', 'audit', '--signals', 'tenant,security', '--id', 'auth-audit']))
check('audit-only work excludes Builder', audit?.team.includes('verifier') && audit?.team.includes('security') && !audit?.team.includes('builder'))
check('audit-only work cannot enter build', run(['phase', '--id', 'auth-audit', '--to', 'build', '--summary', 'Should not build.']).status === 5)
for (const role of audit.team.filter((role) => role !== 'verifier')) {
  run(['note', '--id', 'auth-audit', '--role', role, '--summary', `${role} completed the audit.`])
}
check('audit can enter verification without implementation', run(['phase', '--id', 'auth-audit', '--to', 'verify', '--summary', 'Finalizing audit.']).status === 0)
run(['note', '--id', 'auth-audit', '--role', 'verifier', '--summary', 'Verifier completed the audit.'])
check('audit can finish without Builder', run(['finish', '--id', 'auth-audit', '--summary', 'Authorization audit complete.', '--verification', 'Verifier reviewed findings.']).status === 0)

const data = body(run(['start', '--title', 'Migrate account status', '--kind', 'feature', '--signals', 'schema,migration', '--id', 'data-change']))
check('schema work selects only the named Data expert', data?.team.includes('data') && !data?.team.includes('security'))
const experience = body(run(['start', '--title', 'Improve onboarding form', '--kind', 'feature', '--signals', 'ui,accessibility', '--id', 'journey-change']))
check('user-facing work selects the Experience expert', experience?.team.includes('experience'))
const reliability = body(run(['start', '--title', 'Diagnose slow requests', '--kind', 'performance', '--id', 'runtime-performance']))
check('performance work selects Investigator and Reliability',
  reliability?.team.includes('investigator') && reliability?.team.includes('reliability'))
const protectedTier = body(run(['start', '--title', 'Change tenant permissions', '--kind', 'feature', '--signals', 'tenant', '--tier', 'quick', '--id', 'protected-tier']))
check('an explicit quick tier cannot downgrade detected risk',
  protectedTier?.tier === 'deep' && protectedTier?.team.includes('security'))
const listed = body(run(['list']))
check('list reports runs', Array.isArray(listed) && listed.length === 8)

rmSync(project, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
