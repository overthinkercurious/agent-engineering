#!/usr/bin/env node
// knowledge.mjs - render the project knowledge base from analysis.json.
//
// This is the deterministic half of stage 3. Evidence it writes comes from
// analysis.json rather than model recall. The
// model's job is the other half: the judgment slots this file leaves behind,
// marked TODO, which it fills after reading selection.files.
//
// Re-running is safe. Each document keeps one managed block; everything
// outside that block is preserved verbatim, so a regeneration after a code
// change refreshes the facts without destroying the synthesis written around
// them. Same marker pair as lib.sh, so the kit has one convention, not two.
//
// Usage: node knowledge.mjs [--root DIR] [--in FILE] [--out DIR] [--quiet]

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, isAbsolute, relative, resolve } from 'node:path'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ROOT = resolve(arg('--root', process.cwd()))
const IN = resolve(arg('--in', join(ROOT, '.dev', 'context', 'analysis.json')))
const OUT = resolve(arg('--out', join(ROOT, '.dev', 'knowledge')))
const QUIET = argv.includes('--quiet')

const MARK_START = '<!-- agent-engineering:start -->'
const MARK_END = '<!-- agent-engineering:end -->'

for (const [label, path] of [['--in', IN], ['--out', OUT]]) {
  const rel = relative(ROOT, path)
  if (rel.startsWith('..') || isAbsolute(rel)) { process.stderr.write(`${label} escapes the project root: ${path}\n`); process.exit(2) }
}

if (!existsSync(IN)) {
  process.stderr.write(`no analysis at ${IN}\nRun analyze.mjs first; stage 3 reads what stage 2 wrote.\n`)
  process.exit(2)
}
let a
let analysisText
try { analysisText = readFileSync(IN, 'utf8'); a = JSON.parse(analysisText) } catch (e) {
  process.stderr.write(`analysis.json is not valid JSON: ${e.message}\n`)
  process.exit(2)
}
if (a.schema !== 1) {
  process.stderr.write(`warning: analysis schema ${a.schema}, this renderer expects 1\n`)
}

// ------------------------------------------------------------- helpers ------

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const pct = (n) => `${n}%`
const num = (n) => Number(n ?? 0).toLocaleString('en-US')

// A markdown table, or an explicit statement of absence. "None found" is a
// finding; a blank section reads as an oversight and invites the model to
// invent something to fill it.
const table = (headers, rows, empty) => {
  if (!rows.length) return `_${empty}_\n`
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n') + '\n'
}

const TODO = (question) => {
  const id = createHash('sha256').update(question).digest('hex').slice(0, 16)
  return `<!-- agent-engineering:judgment:${id}:start -->\n` +
  `> **TODO (judgment).** ${question}\n>\n` +
  `> Answer from the files you read. If the evidence does not support an\n` +
  `> answer, write \`UNKNOWN\` and say what you would need to read. Mark any\n` +
  `> claim you did not read directly as \`INFERRED\`.\n` +
  `<!-- agent-engineering:judgment:${id}:end -->\n`
}

function preserveCompletedJudgments(current, generated) {
  const slots = new Map()
  const pattern = /<!-- agent-engineering:judgment:([a-f0-9]{16}):start -->([\s\S]*?)<!-- agent-engineering:judgment:\1:end -->/g
  for (const match of current.matchAll(pattern)) if (!/TODO \(judgment\)/.test(match[2])) slots.set(match[1], match[2])
  return generated.replace(pattern, (whole, id, body) => slots.has(id)
    ? `<!-- agent-engineering:judgment:${id}:start -->${slots.get(id)}<!-- agent-engineering:judgment:${id}:end -->`
    : whole)
}

// Write BODY between the markers, preserving everything outside them.
// On creation the title sits above the block and a Notes section below it, so
// the parts a human owns are already there and obviously outside the markers.
function writeManaged(file, title, body) {
  mkdirSync(dirname(file), { recursive: true })
  let block = `${MARK_START}\n${body.trimEnd()}\n${MARK_END}`
  if (!existsSync(file)) {
    writeFileSync(file,
      `# ${title}\n\n${block}\n\n## Notes\n\n`
      + '<!-- Anything outside the markers above survives a re-run. Put\n'
      + '     corrections, context the parser cannot see, and answers to the\n'
      + '     judgment slots here. -->\n')
    return 'created'
  }
  const cur = readFileSync(file, 'utf8')
  block = preserveCompletedJudgments(cur, block)
  const s = cur.indexOf(MARK_START)
  const e = cur.indexOf(MARK_END)
  if (s === -1) {
    writeFileSync(file, cur.trimEnd() + '\n\n' + block + '\n')
    return 'updated'
  }
  if (e === -1 || e < s) {
    // Same rule as lib.sh: a half-open block means guessing where it ends, and
    // guessing is how someone's synthesis gets eaten. Refuse instead.
    process.stderr.write(`${file} has a start marker but no end marker. Fix it by hand; this script will not guess where the block ends.\n`)
    process.exit(1)
  }
  const next = cur.slice(0, s) + block + cur.slice(e + MARK_END.length)
  if (next === cur) return 'unchanged'
  writeFileSync(file, next)
  return 'updated'
}

const analysisDigest = createHash('sha256').update(analysisText).digest('hex')
const stamp = `<!-- Generated by agent-engineering from .dev/context/analysis.json
     input sha256 ${analysisDigest}
     analysed ${a.generated_at}${a.git?.head ? ` at commit ${String(a.git.head).slice(0, 8)}` : ''}
     Facts inside this block are machine-extracted. Edit outside the markers;
     a re-run replaces the block and preserves the rest. -->`

const docs = []
const doc = (name, title, body) => docs.push([name, title, `${stamp}\n\n${body}`])

// ----------------------------------------------------------- 05 product ----

doc('05-product.md', 'Product context', [
  '_Product intent cannot be derived from source code alone. These answers are\n'
    + 'the durable brief that keeps later feature work tied to user outcomes._\n\n',
  '## Judgment\n\n',
  TODO('Who are the primary users, what situation brings them here, and what outcome are they trying to achieve?'),
  '\n',
  TODO('What does the product deliberately optimize for, and which tempting adjacent outcomes are outside its current scope?'),
  '\n',
  TODO('Which observable product and business signals define success, and what guardrails must not regress?'),
  '\n',
  TODO('Which constraints, promises, or historical decisions materially limit future product and engineering choices?'),
].join(''))

// ------------------------------------------------------------ 10 stack ------

const langs = Object.entries(a.inventory?.by_language ?? {})
  .filter(([l]) => l !== 'other')
  .map(([l, v]) => [l, num(v.files), num(v.loc),
    pct(+((v.loc / (a.inventory.total_loc || 1)) * 100).toFixed(1))])

const deps = a.stack?.manifests?.flatMap((m) =>
  Object.entries(m.deps ?? {}).map(([k, v]) => [k, v, m.file])) ?? []
const topImports = Object.entries(a.stack?.external_imports ?? {}).slice(0, 25)

doc('10-stack.md', 'Stack', [
  '## Languages\n',
  table(['Language', 'Files', 'Lines', 'Share'], langs, 'No recognised source languages.'),
  `\nTotal: ${num(a.inventory?.total_files)} files, ${num(a.inventory?.total_loc)} lines, `
    + `${num(a.inventory?.test_files)} of them test files.\n`,
  '\n## Package managers and runtimes\n',
  table(['Key', 'Value'], [
    ['package managers', (a.stack?.package_managers ?? []).join(', ') || 'none detected'],
    ...Object.entries(a.stack?.runtimes ?? {}).map(([k, v]) => [k, v]),
  ], 'No manifest found.'),
  '\n## Declared dependencies\n',
  table(['Package', 'Range', 'Manifest'], deps.slice(0, 60), 'No declared dependencies.'),
  '\n## Most imported external modules\n',
  '_What the code actually reaches for, by import count. A dependency that is\ndeclared but never imported here is a candidate for removal._\n\n',
  table(['Module', 'Imports'], topImports.map(([k, v]) => [k, num(v)]), 'No external imports resolved.'),
  '\n## Enforcement configuration\n',
  table(['Tool', 'Config file'], Object.entries(a.enforcement ?? {})
    .filter(([k]) => k !== 'typescript_options').map(([k, v]) => [k, v]),
  'No linter or formatter configuration found at the project root.'),
  a.enforcement?.typescript_options
    ? `\nTypeScript \`strict\`: \`${a.enforcement.typescript_options.strict ?? 'unset'}\`.\n`
    : '',
  '\n## Judgment\n\n',
  TODO('Which of these dependencies are load-bearing architectural choices, and which are incidental? Name the ones a change would ripple through.'),
].join(''))

// --------------------------------------------------------- 20 commands ------

const scripts = Object.entries(a.commands?.scripts ?? {})
const ci = a.commands?.ci ?? []

doc('20-commands.md', 'Commands', [
  '_How this project is run, tested and built. Every command here was read out\nof a manifest or a CI workflow; none was guessed._\n\n',
  '## Package scripts\n',
  table(['Script', 'Runs'], scripts, 'No package scripts defined.'),
  '\n## Make targets\n',
  table(['Target'], (a.commands?.make_targets ?? []).map((t) => [t]), 'No Makefile targets found.'),
  '\n## CI\n',
  ci.length
    ? ci.map((w) => `### \`${w.file}\`\n\n` + table(['Step'], (w.run_steps ?? []).map((s) => [s]), 'No run steps parsed.')).join('\n')
    : '_No CI workflows found. Nothing verifies a change before it merges._\n',
  '\n## Judgment\n\n',
  TODO('Which single command is the real gate - the one that must pass before a change is done? If CI runs something the local scripts do not, say which, because that gap is where "works on my machine" comes from.'),
  '\n',
  TODO('How is this project run locally, end to end, from a fresh clone? List the exact steps including any required environment variables.'),
].join(''))

// ----------------------------------------------------- 30 architecture ------

const rank = a.ranking ?? []
const entry = rank.filter((r) => r.fan_in > 0).sort((x, y) => y.fan_in - x.fan_in).slice(0, 20)
const hot = [...rank].sort((x, y) => y.score - x.score).slice(0, 25)
const byFw = {}
for (const r of a.routes ?? []) (byFw[r.framework ?? 'unknown'] ??= []).push(r)

doc('30-architecture.md', 'Architecture', [
  `_Shape derived from ${num(a.imports?.edges_resolved)} resolved import edges of `
    + `${num(a.imports?.edges_found)} found._\n\n`,
  '## Most depended-on files\n',
  '_Highest import fan-in. These are the files a change is most likely to break._\n\n',
  table(['File', 'Fan-in', 'Lines', 'Has test'],
    entry.map((r) => [r.path, r.fan_in, r.loc, r.has_test ? 'yes' : 'NO']),
    'No import edges resolved, so fan-in is unknown for this project.'),
  '\n## Routes\n',
  Object.keys(byFw).length
    ? Object.entries(byFw).map(([fw, rs]) =>
      `### ${fw}\n\n` + table(['Method', 'Route', 'File'],
        rs.slice(0, 80).map((r) => [r.method ?? '-', r.route, r.path]), 'none')).join('\n')
    : '_No HTTP routes detected. This may be a library, a CLI, or a framework whose routing this parser does not recognise._\n',
  '\n## Data schema\n',
  table(['File', 'Kind'], (a.schema_files ?? []).map((s) => [s.path ?? s, s.kind ?? '']),
    'No schema or migration files detected.'),
  '\n## Highest-signal files\n',
  '_Ranked by fan-in, churn, size and risk together. This is the reading order\nfor someone new to the codebase._\n\n',
  table(['File', 'Score', 'Fan-in', 'Churn', 'Lines', 'Risk', 'Has test'],
    hot.map((r) => [r.path, r.score, r.fan_in, r.churn, r.loc, (r.risk ?? []).join(' ') || '-', r.has_test ? 'yes' : 'NO']),
    'No code files ranked.'),
  '\n## Judgment\n\n',
  TODO('Describe the request lifecycle, or the main control flow if this is not a service: entry point through to persistence. Name real files.'),
  '\n',
  TODO('What are the module boundaries, and which ones are actually respected? Point at a specific import that crosses a boundary it should not.'),
].join(''))

// ------------------------------------------------------------ 40 risks ------

const risk = a.risk_files ?? []
const byTag = {}
for (const f of risk) for (const t of f.tags ?? []) (byTag[t] ??= []).push(f.path)
const rankByPath = new Map(rank.map((r) => [r.path, r]))
const untested = risk.filter((f) => {
  const r = rankByPath.get(f.path)
  return r && !r.has_test
})

doc('40-risks.md', 'Risk surfaces', [
  '_Files whose names indicate they touch authentication, money, data\nmigration, secrets, external callbacks or model calls. Filename evidence\nonly - a file is flagged for review here, not accused of a defect._\n\n',
  '## By category\n',
  Object.keys(byTag).length
    ? Object.entries(byTag).map(([t, ps]) =>
      `### ${t} (${ps.length})\n\n` + ps.slice(0, 40).map((p) => `- \`${p}\``).join('\n') + '\n').join('\n')
    : '_No risk-tagged files detected._\n',
  '\n## Risk surfaces with no apparent test\n',
  untested.length
    ? '_The highest-value gap in the project. Each of these touches something\nexpensive to get wrong and has no test file naming it._\n\n'
      + table(['File', 'Tags', 'Lines'],
        untested.slice(0, 40).map((f) => [f.path, (f.tags ?? []).join(' '), rankByPath.get(f.path)?.loc ?? '?']), 'none')
    : '_Every risk-tagged file has an apparent test._\n',
  '\n## Environment variables referenced in code\n',
  table(['Variable'], (a.deployment?.env_vars ?? []).map((v) => [v]),
    'No environment variable references found.'),
  '\n## Deployment\n',
  table(['Kind', 'File'], [
    ...(a.deployment?.containers ?? []).map((c) => ['container', c.file]),
    ...(a.deployment?.platforms ?? []).map((p) => ['platform', p.file]),
    ...(a.deployment?.iac ?? []).map((f) => ['infrastructure', f]),
  ], 'No deployment configuration detected.'),
  '\n## Judgment\n\n',
  TODO('For each category above, what is the actual blast radius of getting it wrong here? Rank them, and say which one you would test first.'),
].join(''))

// ------------------------------------------------------ 50 conventions ------

const noTest = rank.filter((r) => !r.has_test).length

doc('50-conventions.md', 'Conventions', [
  '_Mostly judgment. The numbers below are the evidence to reason from; the\nconventions themselves have to be read out of the code._\n\n',
  '## Evidence\n',
  table(['Measure', 'Value'], [
    ['code files ranked', num(rank.length)],
    ['ranked files with no apparent test', `${num(noTest)} (${pct(rank.length ? +((noTest / rank.length) * 100).toFixed(1) : 0)})`],
    ['test files', num(a.inventory?.test_files)],
    ['files read by the model', `${num(a.coverage?.files_to_model_read)} of ${num(a.coverage?.code_files)} (${pct(a.coverage?.files_to_model_read_pct)})`],
  ], 'No evidence available.'),
  '\n## Judgment\n\n',
  TODO('What naming, file layout and error-handling patterns does this codebase actually follow? Quote one file that exemplifies each.'),
  '\n',
  TODO('Where do the patterns disagree with each other? Name two files that solve the same problem differently. This is the most useful thing in this document - a codebase with two competing conventions will get a third unless the disagreement is written down.'),
  '\n',
  TODO('Which convention is non-obvious enough that a new contributor would violate it by default?'),
].join(''))

// ------------------------------------------------------------ 00 index ------

const cov = a.coverage ?? {}
doc('00-index.md', 'Project knowledge base', [
  '_Generated by `agent-engineering`. Read the document that answers your\nquestion; do not read all of them._\n\n',
  table(['Document', 'Answers'], [
    ['[05-product.md](05-product.md)', 'Who is this for, what outcomes matter, and what is out of scope?'],
    ['[10-stack.md](10-stack.md)', 'What is this built with? What may I import?'],
    ['[20-commands.md](20-commands.md)', 'How do I run, test and build it?'],
    ['[30-architecture.md](30-architecture.md)', 'How is it shaped? What breaks if I change this?'],
    ['[40-risks.md](40-risks.md)', 'What is expensive to get wrong here?'],
    ['[50-conventions.md](50-conventions.md)', 'How is code written here, and where do the patterns disagree?'],
    ['[../rules/](../rules/)', 'What is enforced, and by which command?'],
  ], ''),
  '\n## Provenance\n\n',
  `- Analysed: \`${a.generated_at}\`\n`,
  a.git?.is_repo
    ? `- Commit: \`${String(a.git.head ?? '').slice(0, 12)}\` on \`${a.git.branch}\`, ${num(a.git.commits_last_12mo)} commits in the last 12 months\n`
    : '- Not a git repository, so churn is unavailable and ranking leans on fan-in and size alone.\n',
  `- Parsed ${num(cov.files_parsed)} files (${pct(cov.files_parsed_pct)} of the tree)\n`,
  `- Model read ${num(cov.files_to_model_read)} of ${num(cov.code_files)} code files (${pct(cov.files_to_model_read_pct)}), covering `
    + `${pct(cov.fan_in_weight_covered_pct)} of import fan-in, ${pct(cov.route_files_covered_pct)} of route files and `
    + `${pct(cov.risk_files_covered_pct)} of risk-flagged files\n`,
  '\n## What was not read\n\n',
  table(['Category', 'Files'], Object.entries(cov.not_read ?? {}).map(([k, v]) => [k.replace(/_/g, ' '), num(v)]), 'nothing'),
  '\n## Caveats\n\n',
  (cov.caveats ?? []).map((c) => `- ${c}\n`).join('') || '- none recorded\n',
  (a.selection?.deferred_high_signal?.length
    ? `\n> **${a.selection.deferred_high_signal.length} high-signal file(s) did not fit the reading budget.**\n`
      + '> This knowledge base is incomplete by that much. Re-run with a larger\n'
      + '> `--budget-tokens` to close the gap.\n'
    : ''),
].join(''))

// --------------------------------------------------------------- write ------

mkdirSync(OUT, { recursive: true })
const results = docs.map(([name, title, body]) => [name, writeManaged(join(OUT, name), title, body)])

if (!QUIET) {
  process.stdout.write('\nknowledge base\n')
  for (const [name, st] of results) process.stdout.write(`  ${st.padEnd(10)} .dev/knowledge/${name}\n`)
  const todos = docs.reduce((n, [, , b]) => n + (b.match(/TODO \(judgment\)/g) ?? []).length, 0)
  process.stdout.write(`\n${todos} judgment slot(s) left for the model to fill.\n`)
  process.stdout.write('Evidence above the slots came from analysis.json; its coverage and caveats are recorded in 00-index.md.\n\n')
}
