#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forge = join(root, 'skills', 'ae-forge')
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

const team = JSON.parse(readFileSync(join(forge, 'references', 'team.json'), 'utf8'))
check(team.version === 2, 'team contract version must be 2')
// Eleven, and the count is asserted rather than left open so that adding a
// twelfth is a deliberate act with a test to update. Each of the two most
// recent additions carved a question nobody previously owned: Plan Reviewer
// owns "is this design wrong before we build it" (Architect writes the plan,
// Verifier judges the result, neither reads the plan adversarially), and
// Auditor owns "what is already wrong here" read cold, without a plan or a
// diff. A role that cannot state such a question belongs in a lens.
check(team.roles && !Array.isArray(team.roles) && Object.keys(team.roles).length === 11,
  'exactly eleven bounded experts are expected')
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
    // A role that arrives without its contract produces the same shape of
    // answer with none of the guarantees, so every role file says so itself
    // rather than trusting the coordinator to have said it.
    check(/^> Governed by /m.test(content), `${role} workflow must refuse to run without its contract`)
    // The output section must be a form, not a description of one. Filling a
    // skeleton and composing a document from a list of required topics are
    // different tasks, and only the first renders the same way twice - which
    // is the entire reason these files carry templates.
    const output = content.split(/^## Output$/m)[1] ?? ''
    check(/```markdown\n[\s\S]*?```/.test(output), `${role} output must be a literal template, not a prose list`)
    check(/^\|[^\n]*\|$/m.test(output), `${role} output template needs at least one named-column table`)
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

// The six stage skills. Each is a thin invocable wrapper: it carries the
// protocol (resolve, read, record, hand back) while the method stays in
// ae-forge's role file, so a stage cannot drift from its own contract by
// being edited in one of two places.
const STAGE_SKILLS = {
  'ae-investigate': 'investigator',
  'ae-plan': 'architect',
  'ae-plan-review': 'plan-reviewer',
  'ae-build': 'builder',
  'ae-verify': 'verifier',
  'ae-audit': 'auditor',
}
for (const [skill, role] of Object.entries(STAGE_SKILLS)) {
  const path = join(root, 'skills', skill, 'SKILL.md')
  check(existsSync(path), `missing stage skill: ${skill}`)
  if (!existsSync(path)) continue
  const content = readFileSync(path, 'utf8')
  check(new RegExp(`^name: ${skill}$`, 'm').test(content), `${skill} frontmatter name must match its directory`)
  check(/^metadata:$/m.test(content) && /^ {2}owns: /m.test(content), `${skill} needs an owns phrase`)
  // Without the sibling contract a stage is a plausible-sounding role with no
  // rule behind it, and that is indistinguishable from one with a rule behind
  // it. Every stage must check, and every stage must stop.
  check(content.includes('AE-CONTRACT UNRESOLVED'), `${skill} must detect a missing contract`)
  check(/stop and say so/i.test(content), `${skill} must stop when its contract is missing`)
  check(content.includes(`roles/${role}.md`), `${skill} must load its role method from ae-forge (roles/${role}.md)`)
  check(/forge\.mjs"? section --id/.test(content), `${skill} must write its artifact section`)
  check(/forge\.mjs"? note --id/.test(content), `${skill} must record a ledger contribution`)
  check(/^## Hard stops$/m.test(content), `${skill} needs a Hard stops section`)
  check(roleNames.includes(role), `${skill} maps to an unknown role: ${role}`)
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

// Coverage: every domain a detector can emit must be handled by SOMETHING -
// a lens, a role's routing signals, or a declared backlog entry that will
// announce itself as LENS UNAVAILABLE. A tag handled by nothing is a domain
// the kit detects in a project and then silently ignores, which is the exact
// "we missed it" failure the lens system exists to prevent.
{
  const emitted = new Set((team.domain_detectors || []).flatMap((rule) => rule.emit || []))
  const handled = new Set([
    ...Object.values(lenses).flatMap((lens) => (lens.signals || []).map((s) => s.toLowerCase())),
    ...Object.values(team.signals || {}).flat().map((s) => s.toLowerCase()),
    ...(team.lenses_backlog || []).map((s) => s.toLowerCase()),
    ...Object.keys(team.risk || {}).map((s) => s.toLowerCase()),
  ])
  for (const tag of emitted) {
    check(handled.has(tag.toLowerCase()),
      `domain detector emits "${tag}" but no lens, role signal, or backlog entry handles it`)
  }
}

// Stage ordering is encoded in four places that have to agree - TRANSITIONS,
// allowedPhases(), SECTIONS[].owner and team.json's tiers - plus a fifth in
// each stage skill's read-list. Each was individually reasoned; nothing
// checked them as one surface, so a twelfth role or a seventh stage could
// contradict one of them silently. `forge.mjs contract` prints all four and
// this reads them back.
{
  const printed = spawnSync(process.execPath, [join(forge, 'scripts', 'forge.mjs'), 'contract'], { encoding: 'utf8' })
  check(printed.status === 0, `forge.mjs contract failed: ${printed.stderr?.trim()}`)
  let c = null
  try { c = JSON.parse(printed.stdout) } catch { check(false, 'forge.mjs contract did not print JSON') }
  if (c) {
    check(c.contract === team.version, 'contract command must report team.json\'s version')
    check(c.analysis_schema === team.analysis_schema,
      'contract command must report the analysis schema team.json declares')

    // Every phase a role may work in must be reachable from the opening
    // phase. A role gated to a phase the state machine cannot arrive at is
    // selected, required for completion, and unable to contribute - which
    // deadlocks the run with nothing saying why.
    const reachable = new Set(['understand'])
    for (let i = 0; i < c.phases.length + 1; i++) {
      for (const from of [...reachable]) for (const to of c.transitions[from] ?? []) reachable.add(to)
    }
    for (const [role, meta] of Object.entries(c.roles)) {
      check(meta.phases.length > 0, `${role} has no phase it may contribute in`)
      for (const phase of meta.phases) {
        check(c.phases.includes(phase), `${role} allows an unknown phase: ${phase}`)
        check(reachable.has(phase), `${role} is gated to ${phase}, which no transition reaches`)
      }
    }

    // Section ownership and role gating are two statements about the same
    // fact and must not disagree.
    for (const [section, owner] of Object.entries(c.sections)) {
      if (owner === null) continue
      check(roleNames.includes(owner), `section ${section} is owned by an unknown role: ${owner}`)
      check(c.roles[owner]?.section === section,
        `${owner} owns section ${section} but the contract maps it to ${c.roles[owner]?.section}`)
    }
    const owners = Object.values(c.sections).filter(Boolean)
    check(new Set(owners).size === owners.length, 'a role may own at most one artifact section')

    // Anyone on a default tier must be able to work and, if they own a
    // section, to write it before the run can legally leave their phase.
    for (const [tier, roles] of Object.entries(c.tiers)) {
      for (const role of roles) {
        check(Boolean(c.roles[role]), `tier ${tier} names an unknown role: ${role}`)
        check((c.roles[role]?.phases ?? []).length > 0,
          `tier ${tier} selects ${role}, which has no phase it may contribute in`)
      }
    }

    // The stage skills are the fifth encoding. A stage whose role cannot work
    // in any phase the stage claims is a contradiction no other check sees.
    for (const [skill, role] of Object.entries(STAGE_SKILLS)) {
      check(Boolean(c.roles[role]), `${skill} maps to a role the contract does not know: ${role}`)
      const section = c.roles[role]?.section
      const path = join(root, 'skills', skill, 'SKILL.md')
      if (section && existsSync(path)) {
        check(readFileSync(path, 'utf8').includes(`--name ${section}`),
          `${skill} must write the section its role owns (--name ${section})`)
      }
    }
  }
}

for (const path of [
  'references/budgets.json', 'references/registry.json',
  'scripts/dispatch.mjs', 'scripts/codex-host.mjs',
]) check(!existsSync(join(forge, path)), `obsolete runtime remains: ${path}`)

if (failures.length) {
  for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`)
  process.exit(1)
}
process.stdout.write('  PASS  Forge has eleven dedicated, non-overlapping expert workflows and no legacy runtime\n')
process.stdout.write('  PASS  phase transitions, role gating, section ownership and tiers agree\n')
