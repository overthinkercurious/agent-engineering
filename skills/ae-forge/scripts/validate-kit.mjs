#!/usr/bin/env node
// Check the executable routing contract against the files and the role
// assignments stated by lens checklists. Run after changing team.json.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'references')
const team = JSON.parse(readFileSync(resolve(root, 'team.json'), 'utf8'))
const errors = []
const roleNames = Object.keys(team.roles)
const names = Object.keys(team.lenses)
const nameFor = Object.fromEntries(roleNames.map((role) => [role.toLowerCase().replaceAll('-', ' '), role]))
for (const [role, data] of Object.entries(team.roles)) {
  if (!existsSync(resolve(root, data.file))) errors.push(`missing role file: ${role} -> ${data.file}`)
}
for (const [name, lens] of Object.entries(team.lenses)) {
  const file = resolve(root, lens.file)
  if (!existsSync(file)) { errors.push(`missing lens file: ${name} -> ${lens.file}`); continue }
  for (const role of lens.attaches_to ?? []) if (!roleNames.includes(role)) errors.push(`${name}: unknown role ${role}`)
  const body = readFileSync(file, 'utf8')
  for (const heading of body.matchAll(/^\*\*[^\n]*\(([^\n)]+)\)\*\*/gm)) {
    for (const label of heading[1].split(/,|\band\b|\+/i).map((s) => s.trim().toLowerCase())) {
      const role = nameFor[label]
      if (role && !(lens.attaches_to ?? []).includes(role)) errors.push(`${name}: checklist assigns ${role} but lens does not attach to it`)
    }
  }
  if (lens.review_after && !/^\d{4}-\d{2}-\d{2}$/.test(lens.review_after)) errors.push(`${name}: invalid review_after`)
}
for (const role of ['plan-reviewer', 'plan-challenger', 'auditor']) {
  if (!Object.values(team.lenses).some((lens) => lens.attaches_to?.includes(role))) {
    errors.push(`${role}: no domain lens can attach`)
  }
}
const handled = new Set([...names, ...(team.lenses_backlog ?? []),
  ...Object.values(team.lenses).flatMap((lens) => lens.signals ?? []),
  ...Object.values(team.signals).flat()])
for (const rule of team.domain_detectors ?? []) {
  for (const tag of rule.emit ?? []) if (!handled.has(tag)) errors.push(`unhandled detector tag: ${tag}`)
}
const result = { ok: errors.length === 0, roles: roleNames.length, lenses: names.length, detectors: team.domain_detectors?.length ?? 0, errors }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (errors.length) process.exitCode = 1
