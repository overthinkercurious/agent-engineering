#!/usr/bin/env node
// rules.mjs - derive the project's enforceable rules from analysis.json.
//
// The deterministic half of stage 4. It emits only rules whose enforcement
// already exists in this project: a rule is admitted when analysis.json shows
// a command or a config file that can fail it. Everything else is left to the
// model, under the admission contract written into the index.
//
// The point of that contract: a rule nothing can check is a suggestion, and
// suggestions accumulate until the file is too long to read. A short list of
// rules with exit codes behind them beats a long list of good intentions.
//
// Same managed-block convention as knowledge.mjs, so re-running refreshes the
// derived rules and preserves anything written around them.
//
// Usage: node rules.mjs [--root DIR] [--in FILE] [--out DIR] [--quiet]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, isAbsolute, relative, resolve } from 'node:path'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ROOT = resolve(arg('--root', process.cwd()))
const IN = resolve(arg('--in', join(ROOT, '.dev', 'context', 'analysis.json')))
const OUT = resolve(arg('--out', join(ROOT, '.dev', 'rules')))
const QUIET = argv.includes('--quiet')

const MARK_START = '<!-- agent-engineering:start -->'
const MARK_END = '<!-- agent-engineering:end -->'

for (const [label, path] of [['--in', IN], ['--out', OUT]]) {
  const rel = relative(ROOT, path)
  if (rel.startsWith('..') || isAbsolute(rel)) { process.stderr.write(`${label} escapes the project root: ${path}\n`); process.exit(2) }
}

if (!existsSync(IN)) {
  process.stderr.write(`no analysis at ${IN}\nRun analyze.mjs first; stage 4 reads what stage 2 wrote.\n`)
  process.exit(2)
}
let a
try { a = JSON.parse(readFileSync(IN, 'utf8')) } catch (e) {
  process.stderr.write(`analysis.json is not valid JSON: ${e.message}\n`)
  process.exit(2)
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const table = (headers, rows, empty) => {
  if (!rows.length) return `_${empty}_\n`
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n') + '\n'
}

function writeManaged(file, title, body) {
  mkdirSync(dirname(file), { recursive: true })
  let block = `${MARK_START}\n${body.trimEnd()}\n${MARK_END}`
  if (!existsSync(file)) {
    writeFileSync(file, `# ${title}\n\n${block}\n\n## Notes\n\n`
      + '<!-- Anything outside the markers above survives a re-run. -->\n')
    return 'created'
  }
  const cur = readFileSync(file, 'utf8')
  const slotPattern = /<!-- agent-engineering:judgment:([a-z0-9-]+):start -->([\s\S]*?)<!-- agent-engineering:judgment:\1:end -->/g
  const completed = new Map()
  for (const match of cur.matchAll(slotPattern)) if (!/TODO \(judgment\)/.test(match[2])) completed.set(match[1], match[2])
  block = block.replace(slotPattern, (whole, id) => completed.has(id)
    ? `<!-- agent-engineering:judgment:${id}:start -->${completed.get(id)}<!-- agent-engineering:judgment:${id}:end -->`
    : whole)
  const s = cur.indexOf(MARK_START)
  const e = cur.indexOf(MARK_END)
  if (s === -1) { writeFileSync(file, cur.trimEnd() + '\n\n' + block + '\n'); return 'updated' }
  if (e === -1 || e < s) {
    process.stderr.write(`${file} has a start marker but no end marker. Fix it by hand.\n`)
    process.exit(1)
  }
  const next = cur.slice(0, s) + block + cur.slice(e + MARK_END.length)
  if (next === cur) return 'unchanged'
  writeFileSync(file, next)
  return 'updated'
}

// ------------------------------------------------------------- gates --------
// A gate is a command this project already has that can fail. Classified by
// what the script is named, because that is the only evidence available
// without running anything.

const pm = (a.stack?.package_managers ?? [])[0] ?? 'npm'
const runner = pm === 'npm' ? 'npm run' : `${pm} run`
const KINDS = [
  ['test', /^(test|tests|spec|jest|vitest|pytest)(:|$)/],
  ['typecheck', /^(typecheck|tsc|types|check-types)(:|$)/],
  ['lint', /^(lint|eslint|ruff|flake8|clippy)(:|$)/],
  ['format', /^(format|fmt|prettier)(:|$)/],
  ['build', /^(build|compile|bundle)(:|$)/],
]
const gates = []
for (const [name, cmd] of Object.entries(a.commands?.scripts ?? {})) {
  const kind = KINDS.find(([, re]) => re.test(name))?.[0]
  if (kind) gates.push({ kind, invoke: `${runner} ${name}`, source: 'package.json', cmd })
}
for (const t of a.commands?.make_targets ?? []) {
  const kind = KINDS.find(([, re]) => re.test(t))?.[0]
  if (kind && !gates.some((g) => g.kind === kind)) {
    gates.push({ kind, invoke: `make ${t}`, source: 'Makefile', cmd: '' })
  }
}
const ciSteps = (a.commands?.ci ?? []).flatMap((w) => (w.run_steps ?? []).map((s) => [w.file, s]))

// ------------------------------------------------------------- rules --------
// Each derived rule must name the command that fails it. No command, no rule.

const derived = []
const ts = a.enforcement?.typescript_options
if (a.enforcement?.typescript) {
  const strict = ts?.strict === true
  derived.push({
    id: '10-typescript',
    title: 'TypeScript',
    rules: [
      [strict ? 'No new `any`, and no `@ts-ignore` without a comment naming the reason.'
        : '`strict` is OFF in tsconfig.json. Treat turning it on as a task, not a drive-by change.',
      gates.find((g) => g.kind === 'typecheck')?.invoke
        ?? `npx tsc --noEmit -p ${a.enforcement.typescript}`],
    ],
    evidence: `\`${a.enforcement.typescript}\` present; \`strict\` is \`${ts?.strict ?? 'unset'}\`.`,
  })
}
const linter = a.enforcement?.eslint || a.enforcement?.eslint_flat || a.enforcement?.ruff
  || a.enforcement?.ruff_py || a.enforcement?.golangci
if (linter) {
  derived.push({
    id: '20-lint',
    title: 'Lint',
    rules: [['Code must pass the configured linter with no new warnings.',
      gates.find((g) => g.kind === 'lint')?.invoke ?? 'see the linter config']],
    evidence: `Config found at \`${linter}\`.`,
  })
}
if (a.enforcement?.precommit) {
  derived.push({
    id: '30-precommit',
    title: 'Pre-commit',
    rules: [['Hooks in `.pre-commit-config.yaml` must pass before a commit is claimed done.',
      'pre-commit run --all-files']],
    evidence: '`.pre-commit-config.yaml` present.',
  })
}
const untestedRisk = (a.risk_files ?? []).filter((f) => {
  const r = (a.ranking ?? []).find((x) => x.path === f.path)
  return r && !r.has_test
})
if (untestedRisk.length) {
  derived.push({
    id: '40-risk-coverage',
    title: 'Risk coverage',
    rules: [[`Changing any file listed under "Files carrying risk tags" in \`.dev/knowledge/architecture.md\` requires a test in the same change. `
      + `${untestedRisk.length} such file(s) currently have none; those are existing debt, not a blocker on unrelated work.`,
    gates.find((g) => g.kind === 'test')?.invoke ?? 'no test command detected']],
    evidence: `${untestedRisk.length} risk-tagged file(s) with no apparent test, at the time of analysis.`,
  })
}

// -------------------------------------------------------------- write -------

const docs = []

docs.push(['00-index.md', 'Project rules', [
  '_Rules this project enforces, and the command that enforces each one._\n\n',
  '## The admission contract\n\n',
  'A rule belongs here only if it names a command that fails when the rule is\n',
  'broken. A rule nothing can check is a suggestion, and suggestions accumulate\n',
  'until nobody reads the file. If you want a rule that has no enforcement yet,\n',
  'the task is to build the enforcement, not to write the rule.\n\n',
  '## Gates\n\n',
  '_Commands this project already has. These are what "done" can be checked against._\n\n',
  table(['Kind', 'Command', 'Defined in'],
    gates.map((g) => [g.kind, `\`${g.invoke}\``, g.source]),
    'No test, lint, typecheck or build command was found. Nothing here can '
    + 'currently be verified by exit code - building one gate is the highest-value '
    + 'change available to this project.'),
  '\n## What CI runs\n\n',
  table(['Workflow', 'Step'], ciSteps.slice(0, 40).map(([f, s]) => [f, `\`${s}\``]),
    'No CI workflows found.'),
  '\n## Rule files\n\n',
  table(['File', 'Covers'], derived.map((d) => [`[${d.id}.md](${d.id}.md)`, d.title]),
    'No rules could be derived: this project has no linter, type checker or '
    + 'pre-commit configuration for them to attach to.'),
  '\n## The ratchet\n\n',
  'Rules apply to code you change, not to code that already exists. A rule\n',
  'introduced today turns existing breakages into listed debt, never into an\n',
  'immediate blocker on unrelated work. Record the count when the rule lands;\n',
  'the number may go down over time and must not go up.\n',
].join('')])

for (const d of derived) {
  docs.push([`${d.id}.md`, d.title, [
    `_Derived from analysis. Evidence: ${d.evidence}_\n\n`,
    '## Rules\n\n',
    table(['Rule', 'Enforced by'], d.rules.map(([r, c]) => [r, `\`${c}\``]), 'none'),
    '\n## Judgment\n\n',
    `<!-- agent-engineering:judgment:${d.id}:start -->\n`,
    '> **TODO (judgment).** Add the stack-specific rules that this project\n',
    '> actually needs, using the admission contract in `00-index.md`: each one\n',
    '> must name a command that fails when it is broken. Search official\n',
    '> documentation for the detected stack rather than recalling it. Count the\n',
    '> existing violations and record them as debt.\n',
    `<!-- agent-engineering:judgment:${d.id}:end -->\n`,
  ].join('')])
}

mkdirSync(OUT, { recursive: true })
const results = docs.map(([name, title, body]) => [name, writeManaged(join(OUT, name), title, body)])

if (!QUIET) {
  process.stdout.write('\nproject rules\n')
  for (const [name, st] of results) process.stdout.write(`  ${st.padEnd(10)} .dev/rules/${name}\n`)
  process.stdout.write(`\n${gates.length} gate(s) detected, ${derived.length} rule file(s) derived.\n`)
  if (!gates.length) {
    process.stdout.write('No gate exists in this project, so no rule here can be verified by exit code.\n')
  }
  process.stdout.write('\n')
}
