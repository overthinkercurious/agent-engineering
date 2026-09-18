#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forge = join(root, 'skills', 'ae-forge')
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

const team = JSON.parse(readFileSync(join(forge, 'references', 'team.json'), 'utf8'))
check(team.version === 2, 'team contract version must be 2')
check(team.roles && !Array.isArray(team.roles) && Object.keys(team.roles).length === 9,
  'exactly nine bounded experts are expected')
const roleNames = Object.keys(team.roles || {})
const ownership = Object.values(team.roles || {}).map((role) => role.owns)
check(new Set(roleNames).size === roleNames.length, 'role names must be unique')
check(ownership.every((value) => typeof value === 'string' && value.trim()), 'every role needs an ownership phrase')
check(new Set(ownership.map((value) => value.toLowerCase())).size === ownership.length,
  'role ownership phrases must be unique')
check(JSON.stringify(Object.keys(team.tiers)) === JSON.stringify(['quick', 'standard', 'deep']), 'quick, standard, and deep tiers are required')
for (const [tier, roles] of Object.entries(team.tiers)) {
  check(roles.includes('builder') && roles.includes('verifier'), `${tier} must include Builder and Verifier`)
  check(roles.every((role) => roleNames.includes(role)), `${tier} contains an unknown role`)
}

for (const [role, contract] of Object.entries(team.roles || {})) {
  const workflow = resolve(forge, 'references', contract.file || '')
  const rel = relative(join(forge, 'references'), workflow)
  check(Boolean(contract.file) && !rel.startsWith('..') && !isAbsolute(rel), `${role} workflow must stay inside references`)
  check(existsSync(workflow), `${role} dedicated workflow is missing: ${contract.file}`)
  if (existsSync(workflow)) {
    const content = readFileSync(workflow, 'utf8')
    check(/^# /m.test(content) && /^## Exclusive outcome$/m.test(content), `${role} workflow needs an exclusive outcome`)
    check(/does not/i.test(content), `${role} workflow must declare what it does not own`)
    check(/^## Workflow$/m.test(content) && /^## Output$/m.test(content), `${role} workflow needs workflow and output sections`)
  }
}

for (const [role, signals] of Object.entries(team.signals || {})) {
  check(['security', 'data', 'experience', 'reliability'].includes(role), `unexpected signal-routed expert: ${role}`)
  check(roleNames.includes(role), `signals target unknown expert: ${role}`)
  check(Array.isArray(signals) && signals.length > 0, `${role} needs routing signals`)
}
const routedSignals = Object.values(team.signals || {}).flat()
check(new Set(routedSignals).size === routedSignals.length,
  'a routing signal may belong to only one named specialist')

for (const path of ['SKILL.md', 'references/team.md', 'references/team.json', 'scripts/forge.mjs']) {
  check(existsSync(join(forge, path)), `missing shipped Forge file: ${path}`)
}

const lenses = team.lenses || {}
const lensIndexPath = join(forge, 'references', 'lenses', '_index.md')
const lensIndex = existsSync(lensIndexPath) ? readFileSync(lensIndexPath, 'utf8') : ''
for (const [name, contract] of Object.entries(lenses)) {
  const file = resolve(forge, 'references', contract.file || '')
  const rel = relative(join(forge, 'references'), file)
  check(Boolean(contract.file) && !rel.startsWith('..') && !isAbsolute(rel), `lens ${name} file must stay inside references`)
  check(existsSync(file), `lens ${name} file is missing: ${contract.file}`)
  check(Array.isArray(contract.attaches_to) && contract.attaches_to.length > 0, `lens ${name} needs at least one attaches_to role`)
  check((contract.attaches_to || []).every((role) => roleNames.includes(role)), `lens ${name} attaches to an unknown role`)
  check(Array.isArray(contract.signals) && contract.signals.length > 0, `lens ${name} needs routing signals`)
  check(typeof contract.owns === 'string' && contract.owns.trim(), `lens ${name} needs an ownership phrase`)
  if (existsSync(file)) {
    const content = readFileSync(file, 'utf8')
    check(/^# /m.test(content), `lens ${name} needs a title`)
    check(/^## Exclusive constraint$/m.test(content), `lens ${name} needs an Exclusive constraint section`)
    check(/^## Activates$/m.test(content), `lens ${name} needs an Activates section`)
    check(/^## Authority$/m.test(content), `lens ${name} needs an Authority section stating the project's own docs and gates outrank it`)
    check(/^## Hands off$/m.test(content), `lens ${name} needs a Hands off section`)
  }
  check(lensIndex.includes('`' + name + '`'), `lens ${name} is in team.json but not listed in lenses/_index.md`)
}

for (const path of [
  'references/budgets.json', 'references/registry.json',
  'scripts/dispatch.mjs', 'scripts/codex-host.mjs',
]) check(!existsSync(join(forge, path)), `obsolete runtime remains: ${path}`)

if (failures.length) {
  for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`)
  process.exit(1)
}
process.stdout.write('  PASS  Forge has nine dedicated, non-overlapping expert workflows and no legacy runtime\n')
