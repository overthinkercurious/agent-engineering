#!/usr/bin/env node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const riskOnly = body(run(['start', '--title', 'Adjust tenant listing', '--kind', 'feature', '--signals', 'tenant', '--id', 'tenant-only-risk']))
check('risk signal alone does not default to requiring approval',
  riskOnly?.tier === 'deep' && riskOnly?.approval_required === false)
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

run(['phase', '--id', 'tenant-payments', '--to', 'repair', '--summary', 'Repairing verifier finding.'])
run(['note', '--id', 'tenant-payments', '--role', 'builder', '--summary', 'Builder repaired the finding.'])
run(['phase', '--id', 'tenant-payments', '--to', 'verify', '--summary', 'Re-verifying repaired candidate.'])
run(['note', '--id', 'tenant-payments', '--role', 'security', '--summary', 'Security re-reviewed the repaired candidate.'])
const staleFinish = run(['finish', '--id', 'tenant-payments', '--summary', 'Repair verified.', '--verification', 'Rechecked.', '--result', 'PASS'])
check('a repaired candidate cannot finish on a stale verifier review',
  staleFinish.status === 5 && body(staleFinish)?.error.includes('fresh review'))
run(['note', '--id', 'tenant-payments', '--role', 'verifier', '--summary', 'Verifier re-reviewed the repaired candidate.'])
const freshFinish = run(['finish', '--id', 'tenant-payments', '--summary', 'Repair verified.', '--verification', 'Rechecked after repair.', '--result', 'PASS'])
check('a fresh verifier review after repair allows finish', freshFinish.status === 0)


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
// Behavioural risk routing. The vocabulary these requests would naturally
// produce (oauth, sso, rbac) matches no keyword, which is exactly why the
// router must not depend on the model guessing the right synonym.
const oauth = body(run(['start', '--title', 'Add OAuth login', '--kind', 'feature',
  '--risk', 'access,rendered', '--signals', 'oauth,login', '--id', 'oauth-login']))
check('an access risk selects Security whatever the wording',
  oauth?.tier === 'deep' && oauth?.team.includes('security') && oauth?.team.includes('experience'))
check('routing records why each role was selected',
  oauth?.routing.selected.security === 'risk=access' && oauth?.routing.selected.experience === 'risk=rendered')
check('routing records why each role was skipped',
  typeof oauth?.routing.skipped.data === 'string' && typeof oauth?.routing.skipped.reliability === 'string')

const stored = body(run(['start', '--title', 'Add a nullable column', '--kind', 'feature',
  '--risk', 'stored-shape,irreversible', '--id', 'stored-shape-change']))
check('stored-shape selects Data and irreversible demands approval',
  stored?.team.includes('data') && stored?.approval_required === true)

const assessedClear = body(run(['start', '--title', 'Rename a local helper', '--kind', 'refactor',
  '--risk', 'none', '--id', 'assessed-clear']))
check('an explicit "none" assessment is recorded as assessed',
  assessedClear?.routing.risk_assessed === true && !assessedClear?.team.includes('security'))

const unassessed = body(run(['start', '--title', 'Unassessed work', '--kind', 'feature', '--id', 'unassessed']))
check('omitting the risk assessment stays visible in routing',
  unassessed?.routing.risk_assessed === false &&
  unassessed?.routing.tier_reason.includes('risk not assessed'))

const badFlag = run(['start', '--title', 'Bad flag', '--kind', 'feature', '--risk', 'sekurity', '--id', 'bad-flag'])
check('an unknown risk flag is rejected rather than ignored', badFlag.status === 2)

// The brief is the reviewable artifact and the resume contract. Its sections
// are tier-bound so a one-line fix cannot grow enterprise ceremony.
const deepBrief = body(run(['brief', '--id', 'oauth-login']))
check('a deep brief carries the full contract',
  deepBrief?.sections.includes('Options considered') && deepBrief?.sections.includes('Rollback'))
check('the brief records acceptance criteria and a verification plan',
  deepBrief?.sections.includes('Acceptance criteria') && deepBrief?.sections.includes('Verification plan'))
const quickBrief = body(run(['brief', '--id', 'copy-fix']))
check('a quick brief omits sections outside its tier',
  quickBrief?.sections.length === 4 && !quickBrief?.sections.includes('Rollback'))
check('a brief is not silently overwritten', run(['brief', '--id', 'copy-fix']).status === 4)

const briefFile = join(project, '.dev', 'work', 'oauth-login', 'brief.md')
check('the brief names the team and the declared risk',
  readFileSync(briefFile, 'utf8').includes('security') &&
  readFileSync(briefFile, 'utf8').includes('access'))

// The report is rendered from the ledger, never recalled, so it can be used
// to judge whether routing worked.
const rendered = run(['report', '--id', 'oauth-login']).stdout
check('the report shows why each role was selected', rendered.includes('risk=access'))
check('the report names every skipped role and the reason',
  rendered.includes('Skipped') && rendered.includes('no stored-shape risk declared'))
check('the report warns when risk was never assessed',
  run(['report', '--id', 'unassessed']).stdout.includes('NOT ASSESSED'))

// Per-kind acceptance. A refactor is correct precisely when behaviour did not
// change, so rewriting its own tests contradicts the claim. This is the rare
// acceptance rule a script can settle, so a script settles it.
{
  const rr = (argv) => spawnSync(process.execPath, [forge, ...argv, '--root', project], { encoding: 'utf8' })
  const git = (argv) => spawnSync('git', argv, { cwd: project, encoding: 'utf8' })
  git(['init', '-q'])
  git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't'])
  mkdirSync(join(project, 'tests'), { recursive: true })
  writeFileSync(join(project, 'tests', 'a.test.js'), 'test("a",()=>{})\n')
  git(['add', '-A']); git(['commit', '-qm', 'base'])

  rr(['start', '--title', 'Extract a helper', '--kind', 'refactor', '--risk', 'none', '--id', 'refactor-run'])
  rr(['note', '--id', 'refactor-run', '--role', 'architect', '--summary', 'extract'])
  rr(['phase', '--id', 'refactor-run', '--to', 'build', '--summary', 'b'])
  rr(['note', '--id', 'refactor-run', '--role', 'builder', '--summary', 'extracted'])
  writeFileSync(join(project, 'tests', 'a.test.js'), 'test("a",()=>{/* rewritten */})\n')
  rr(['phase', '--id', 'refactor-run', '--to', 'verify', '--summary', 'v'])
  rr(['note', '--id', 'refactor-run', '--role', 'verifier', '--summary', 'ok'])
  const blocked = rr(['finish', '--id', 'refactor-run', '--summary', 'd', '--verification', 'tests (0)'])
  check('a refactor that rewrote its own tests cannot finish',
    blocked.status === 5 && blocked.stdout.includes('behaviour preservation is unproven'))
  git(['checkout', '--', 'tests/a.test.js'])
  const allowed = rr(['finish', '--id', 'refactor-run', '--summary', 'd', '--verification', 'tests (0)'])
  check('the same refactor finishes once its tests are unmodified', allowed.status === 0)
}

const listed = body(run(['list']))
check('list reports runs', Array.isArray(listed) && listed.length === 14)

rmSync(project, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
