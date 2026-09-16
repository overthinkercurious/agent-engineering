#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const skill = readFileSync(join(root, 'skills', 'ae-forge', 'SKILL.md'), 'utf8')
const team = JSON.parse(readFileSync(join(root, 'skills', 'ae-forge', 'references', 'team.json'), 'utf8'))
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

for (const role of Object.keys(team.roles)) {
  check(new RegExp(role.replace('-', ' '), 'i').test(readme), `README does not describe ${role}`)
}
for (const command of ['start', 'list', 'status', 'note', 'phase', 'approve', 'finish', 'cancel']) {
  check(new RegExp(`\\| ${command} \\|`).test(readme), `README does not document ${command}`)
}
check(/not a prerequisite/i.test(readme), 'README must say initialization is optional')
check(/implementation and independent verification/i.test(readme), 'README must state the end-to-end outcome')
check(/five is the maximum/i.test(skill), 'skill must cap ordinary team size')

if (failures.length) {
  for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`)
  process.exit(1)
}
process.stdout.write('  PASS  documentation matches the simplified workflow\n')
