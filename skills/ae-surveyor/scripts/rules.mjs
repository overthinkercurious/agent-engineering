#!/usr/bin/env node
// rules.mjs - derive the project's enforceable rules from analysis.json.
//
// The deterministic half of stage 4 discovers candidate checks. The existing
// model pass inspects their actual enforcement before admitting any rule.
//
// The point of that contract: a rule nothing can check is a suggestion, and
// suggestions accumulate until the file is too long to read. A short list of
// rules with exit codes behind them beats a long list of good intentions.
//
// Same managed-block convention as knowledge.mjs, so re-running refreshes the
// derived rules and preserves anything written around them.
//
// Usage: node rules.mjs [--root DIR] [--in FILE] [--out DIR] [--quiet]

import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, isAbsolute, relative, resolve } from 'node:path'
import { commandEntries, ciEntries, commandTable, stamp, table, writeManaged } from './artifact-support.mjs'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ROOT = resolve(arg('--root', process.cwd()))
const IN = resolve(arg('--in', join(ROOT, '.dev', 'context', 'analysis.json')))
const OUT = resolve(arg('--out', join(ROOT, '.dev', 'rules')))
const QUIET = argv.includes('--quiet')

for (const [label, path] of [['--in', IN], ['--out', OUT]]) {
  const rel = relative(ROOT, path)
  if (rel.startsWith('..') || isAbsolute(rel)) { process.stderr.write(`${label} escapes the project root: ${path}\n`); process.exit(2) }
}

if (!existsSync(IN)) {
  process.stderr.write(`no analysis at ${IN}\nRun analyze.mjs first; stage 4 reads what stage 2 wrote.\n`)
  process.exit(2)
}
let a
const raw = readFileSync(IN, 'utf8')
try { a = JSON.parse(raw) } catch (e) {
  process.stderr.write(`analysis.json is not valid JSON: ${e.message}\n`)
  process.exit(2)
}

// ------------------------------------------------------------- gates --------
// Names identify candidates, not proof that a command enforces a policy.
const gates = commandEntries(a).filter((entry) => entry.kind !== 'other')
const ciSteps = ciEntries(a)

// ------------------------------------------------------------- rules --------
// Keep the existing judgment slots; do not manufacture rules from config names.

const derived = []
const ts = a.enforcement?.typescript_options
if (a.enforcement?.typescript) {
  derived.push({
    id: '10-typescript',
    title: 'TypeScript',
    kinds: ['typecheck', 'build'],
    evidence: `\`${a.enforcement.typescript}\` present; \`strict\` is \`${ts?.strict ?? 'unset'}\`.`,
  })
}
const linter = a.enforcement?.eslint || a.enforcement?.eslint_flat || a.enforcement?.ruff
  || a.enforcement?.ruff_py || a.enforcement?.golangci
if (linter) {
  derived.push({
    id: '20-lint',
    title: 'Lint',
    kinds: ['lint'],
    evidence: `Config found at \`${linter}\`.`,
  })
}
if (a.enforcement?.precommit) {
  derived.push({
    id: '30-precommit',
    title: 'Pre-commit',
    kinds: [],
    evidence: '`.pre-commit-config.yaml` present.',
  })
}
// -------------------------------------------------------------- write -------

const docs = []

docs.push(['00-index.md', 'Project rules', [
  '_Candidate checks from analysis; enforcement must be inspected before a rule is admitted._\n\n',
  '## The admission contract\n\n',
  'A rule belongs here only if it names a command that fails when the rule is\n',
  'broken. A rule nothing can check is a suggestion, and suggestions accumulate\n',
  'until nobody reads the file. If you want a rule that has no enforcement yet,\n',
  'the task is to build the enforcement, not to write the rule.\n\n',
  '## Gates\n\n',
  '_Discovered commands, not yet verified enforcement. Inspect their implementation and scope._\n\n',
  gates.length ? commandTable(gates) : 'No test, lint, typecheck or build command was detected; inspect manifests and CI before concluding none exists.\n',
  '\n## What CI runs\n\n',
  table(['Workflow', 'Step', 'Working directory'], ciSteps.slice(0, 40).map((step) => [step.source, `\`${step.run}\``, step.cwd ?? 'UNKNOWN']),
    'No CI workflows found.'),
  '\n## Rule files\n\n',
  table(['File', 'Covers'], derived.map((d) => [`[${d.id}.md](${d.id}.md)`, d.title]),
    'No rule review files were scaffolded from the detected configuration.'),
  '\n## The ratchet\n\n',
  'Claim a ratchet only when the check supports it. Record existing failures\n',
  'as a baseline; do not claim a global check ignores unchanged code.\n',
].join('')])

for (const d of derived) {
  docs.push([`${d.id}.md`, d.title, [
    `_Derived from analysis. Evidence: ${d.evidence}_\n\n`,
    '## Candidate checks\n\n',
    commandTable(gates.filter((gate) => d.kinds.includes(gate.kind))),
    '\n## Judgment\n\n',
    `<!-- agent-engineering:judgment:${d.id}:start -->\n`,
    '> **TODO (judgment).** Inspect the check and admit only rules whose exact\n',
    '> violations make it fail. Record command, scope/cwd, evidence and measured\n',
    '> existing violations (UNKNOWN until measured). Keep unsupported policies\n',
    '> in knowledge Notes as gaps. See the stage-4 admission contract.\n',
    `<!-- agent-engineering:judgment:${d.id}:end -->\n`,
  ].join('')])
}

mkdirSync(OUT, { recursive: true })
const results = docs.map(([name, title, body]) => [name, writeManaged(join(OUT, name), title, `${stamp(a, raw)}\n\n${body}`)])

if (!QUIET) {
  process.stdout.write('\nproject rules\n')
  for (const [name, st] of results) process.stdout.write(`  ${st.padEnd(10)} .dev/rules/${name}\n`)
  process.stdout.write(`\n${gates.length} candidate check(s), ${derived.length} rule review file(s).\n`)
  if (!gates.length) {
    process.stdout.write('No gate detected; inspect manifests and CI before concluding none exists.\n')
  }
  process.stdout.write('\n')
}
