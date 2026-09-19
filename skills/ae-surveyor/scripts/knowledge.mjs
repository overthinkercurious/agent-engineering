#!/usr/bin/env node
// knowledge.mjs - scaffold the five knowledge documents from analysis.json.
//
// The deterministic half of stage 3. This script writes only what a parser
// observed: languages, manifests, components, routes, commands, schema files.
// Every claim that needs judgment is left as an explicit judgment slot for the
// model pass to fill, under the tagging contract in 00-index.md.
//
// Why a script at all, when stage 3 is a model pass: the marker convention,
// the snapshot stamp and the slot-preservation rules are mechanical, and a
// model asked to reproduce them by hand gets them subtly wrong on rerun -
// which silently destroys the human notes below the block. writeManaged owns
// that; the model owns the synthesis. The deterministic/judgment boundary is
// the same one stage 2 and stage 4 already draw.
//
// Same managed-block convention as rules.mjs, so re-running refreshes the
// derived facts and preserves anything written around them.
//
// Usage: node knowledge.mjs [--root DIR] [--in FILE] [--out DIR] [--quiet]

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { commandEntries, ciEntries, invocation, stamp, table, writeManaged } from './artifact-support.mjs'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ROOT = resolve(arg('--root', process.cwd()))
const IN = resolve(arg('--in', join(ROOT, '.dev', 'context', 'analysis.json')))
const OUT = resolve(arg('--out', join(ROOT, '.dev', 'knowledge')))
const QUIET = argv.includes('--quiet')

for (const [label, path] of [['--in', IN], ['--out', OUT]]) {
  const rel = relative(ROOT, path)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    process.stderr.write(`${label} escapes the project root: ${path}\n`); process.exit(2)
  }
}

if (!existsSync(IN)) {
  process.stderr.write(`no analysis at ${IN}\nRun analyze.mjs first; stage 3 reads what stage 2 wrote.\n`)
  process.exit(2)
}

const raw = readFileSync(IN, 'utf8')
let a
try { a = JSON.parse(raw) } catch (e) {
  process.stderr.write(`analysis.json is not valid JSON: ${e.message}\n`); process.exit(2)
}

// A judgment slot is the only place a model may write inside the managed
// block. writeManaged carries a filled slot across a rerun when the snapshot
// is unchanged, and demotes it to a labelled stale copy when it is not.
const slot = (id, prompt) => [
  `<!-- agent-engineering:judgment:${id}:start -->\n`,
  `> **TODO (judgment).** ${prompt}\n`,
  `<!-- agent-engineering:judgment:${id}:end -->\n`,
].join('')

const pct = (v) => (v === null || v === undefined ? 'UNKNOWN' : `${v}%`)
const langs = Object.entries(a.inventory?.by_language ?? {})
const components = a.components ?? []
const routes = a.routes ?? []
const cmds = commandEntries(a)
const ci = ciEntries(a)
const schemaFiles = a.schema_files ?? []
const riskFiles = a.risk_files ?? []
const ranked = a.ranking ?? []

const docs = []

// ---------------------------------------------------------------- stack ----
docs.push(['stack.md', 'Stack', [
  stamp(a, raw), '\n\n',
  '_What this is built with, and what may be imported. Every row below is\n',
  'OBSERVED by a parser; resolved versions are judgment until read from a\n',
  'lockfile or version catalog._\n\n',
  '## Languages\n\n',
  table(['Language', 'Files', 'Lines'],
    langs.map(([lang, v]) => [lang, v.files ?? 'UNKNOWN', v.loc ?? 'UNKNOWN']),
    'No languages detected; the inventory may have excluded everything.'),
  '\n## Package managers and manifests\n\n',
  table(['Manager', 'Manifest'],
    (a.stack?.manifests ?? []).map((m) => [
      typeof m === 'string' ? (a.stack?.package_managers ?? []).join(', ') || 'UNKNOWN' : (m.manager ?? 'UNKNOWN'),
      typeof m === 'string' ? m : (m.path ?? 'UNKNOWN'),
    ]),
    'No manifest detected by supported parsers.'),
  '\n## Most-imported external packages\n\n',
  table(['Package', 'Import sites'],
    Object.entries(a.stack?.external_imports ?? {}).slice(0, 20).map(([k, v]) => [k, v]),
    'No external imports resolved. Import edges come from regex, so this is a lower bound.'),
  '\n## Resolved versions\n\n',
  slot('stack-versions',
    'Read the lockfile or version catalog and record the resolved version of '
    + 'each load-bearing dependency with its `path:line`. A version from a '
    + 'README or a manifest range is not a resolved version. Tag each claim '
    + 'OBSERVED, INFERRED or UNKNOWN.'),
].join('')])

// --------------------------------------------------------- architecture ----
docs.push(['architecture.md', 'Architecture', [
  stamp(a, raw), '\n\n',
  '_Components, entrypoints, and who owns what. Import edges are regex-derived,\n',
  'so fan-in is a lower bound and an empty route list means undetected, not absent._\n\n',
  '## Components\n\n',
  table(['Component', 'Root', 'Entrypoints detected'],
    components.map((c) => [c.name ?? 'UNKNOWN', c.root ?? 'UNKNOWN', (c.entrypoints ?? []).length]),
    'No component boundary detected; treat the repository as one component until proven otherwise.'),
  '\n## Routes and entrypoints\n\n',
  table(['Route', 'Method', 'Framework', 'Declared in'],
    routes.slice(0, 40).map((r) => [
      r.route ?? 'UNKNOWN', (r.method ?? '-').toUpperCase(),
      r.fw ?? r.framework ?? 'UNKNOWN', r.path ?? 'UNKNOWN',
    ]),
    'No routes detected. Route discovery is convention-based; this is unknown, not empty.'),
  routes.length > 40 ? `\n_${routes.length - 40} further route(s) not listed._\n` : '',
  '\n## Highest fan-in files\n\n',
  table(['File', 'Fan-in', 'Lines', 'Risk tags'],
    ranked.filter((f) => f.fan_in > 0).slice(0, 15)
      .map((f) => [f.path, f.fan_in, f.loc, (f.risk ?? []).join(', ') || '-']),
    'No resolved import edges; fan-in ranking is unavailable.'),
  '\n## Files carrying risk tags\n\n',
  '_Pattern-matched attention signals, not findings. A tag here means a\n',
  'reviewer should look, never that a vulnerability exists._\n\n',
  table(['File', 'Tags'],
    riskFiles.slice(0, 25).map((f) => [f.path ?? 'UNKNOWN', (f.tags ?? []).join(', ') || '-']),
    'No risk tags matched. Pattern matching is a lower bound, not an all-clear.'),
  riskFiles.length > 25 ? `\n_${riskFiles.length - 25} further tagged file(s) not listed._\n` : '',
  '\n## Dependency direction and ownership\n\n',
  slot('architecture-boundaries',
    'Name each component boundary, which direction dependencies are allowed to '
    + 'cross, and which module owns each shared concern. Cite `path:line` for '
    + 'each claim. Do not call an import a boundary violation without first '
    + 'establishing the boundary.'),
].join('')])

// -------------------------------------------------------------- schema ----
docs.push(['schema.md', 'Schema', [
  stamp(a, raw), '\n\n',
  '_What persisted state looks like, how it changes, and what is safe to rewrite._\n\n',
  '## Schema and migration files\n\n',
  table(['File', 'Kind'],
    schemaFiles.map((f) => (typeof f === 'string' ? [f, 'detected'] : [f.path ?? 'UNKNOWN', f.kind ?? 'detected'])),
    'No schema or migration file detected. This project may hold no persistent state, or may define it somewhere the parser does not recognise.'),
  '\n## Persisted state\n\n',
  slot('schema-state',
    'For each store, record the entities, their invariants, which fields are '
    + 'mutable versus append-only, and the migration path actually in use '
    + '(forward-only, reversible, or ad hoc). Cite `path:line`. Where no '
    + 'persistent state exists, say so explicitly rather than leaving this empty.'),
].join('')])

// ------------------------------------------------------------ commands ----
docs.push(['commands.md', 'Commands', [
  stamp(a, raw), '\n\n',
  '_The exact invocations, and what each one actually checks. Builder and\n',
  'Verifier read this file; a paraphrased command is a defect here._\n\n',
  '## Detected commands\n\n',
  // The raw body matters as much as the alias: `npm run test` tells Verifier
  // nothing about whether the runner caches, but `jest --ci` does.
  table(['Kind', 'Command', 'Runs', 'Working directory', 'Env names', 'Source'],
    cmds.map((e) => [
      e.kind ?? 'unclassified', invocation(e), e.body ?? e.run ?? '-',
      e.cwd ?? 'UNKNOWN', (e.env_names ?? []).join(', ') || '-', e.source ?? 'UNKNOWN',
    ]),
    'No commands detected by supported parsers; inspect component manifests and CI before concluding that no gate exists.'),
  '\n## CI steps\n\n',
  table(['Step', 'Source'],
    ci.slice(0, 30).map((s) => [invocation(s) || 'UNKNOWN', s.source ?? 'UNKNOWN']),
    'No CI steps parsed. Supported forms are ordinary GitHub Actions mappings and literal run blocks.'),
  '\n## What each command proves\n\n',
  slot('commands-meaning',
    'For each command above, record its working directory, required environment '
    + 'variable names (never values), prerequisites, and precisely what it fails '
    + 'on. Note any clean-test form the project requires - a cached pass is not '
    + 'a pass. Mark a command UNKNOWN rather than guessing what it covers.'),
].join('')])

// ----------------------------------------------------------- decisions ----
docs.push(['decisions.md', 'Decisions', [
  stamp(a, raw), '\n\n',
  '_Why it is built this way, and what was rejected. Architect reads this file\n',
  'before proposing a design, so an absent decision costs a rediscovery._\n\n',
  '## Observed constraints\n\n',
  table(['Signal', 'Value'], [
    ['Enforcement detected', (a.enforcement?.length ?? 0) || 'none'],
    ['Deployment targets', (a.deployment?.length ?? 0) || 'none'],
    ['Components', components.length],
    ['Commits in last 12 months', a.git?.commits_last_12mo ?? 'UNKNOWN'],
  ], 'No constraints observed.'),
  '\n## Decision record\n\n',
  slot('decisions-record',
    'Record each load-bearing decision this repository has already made: the '
    + 'decision, the evidence for it (`path:line`), and the alternative it '
    + 'rejected where that is recoverable. This is synthesis of the other four '
    + 'documents, so write it last. Do not invent a rationale the repository '
    + 'does not evidence - UNKNOWN is the correct entry for an unexplained choice.'),
  '\n> Forge appends accepted design decisions here as work proceeds. Entries\n',
  '> below the managed block survive regeneration.\n',
].join('')])

// --------------------------------------------------------------- index ----
const c = a.coverage ?? {}
docs.push(['00-index.md', 'Knowledge index', [
  stamp(a, raw), '\n\n',
  '_Which document answers which question, and who reads it. Every other skill\n',
  'in this kit reads this file first, instead of re-reading the repository._\n\n',
  '## Documents\n\n',
  table(['Document', 'Answers', 'Read by'], [
    ['`stack.md`', 'What is this built with, what may I import, what is the resolved version', 'every role'],
    ['`architecture.md`', 'Components, entrypoints, who owns what, dependency direction', 'architect, builder'],
    ['`schema.md`', 'What persisted state looks like, migration path, mutable vs append-only', 'data-focused work'],
    ['`commands.md`', 'Exact command, cwd, environment names, what it actually checks', 'builder, verifier'],
    ['`decisions.md`', 'Why it is built this way; what was rejected and why', 'architect'],
  ], 'none'),
  '\n## Tagging contract\n\n',
  'Every claim inside a managed block carries exactly one tag:\n\n',
  '- `OBSERVED` - with the `path:line` the pass actually opened\n',
  '- `INFERRED` - with the reasoning stated, not just the conclusion\n',
  '- `UNKNOWN` - with the file or check that would resolve it\n\n',
  'There is no fourth tag. `ASSUMED` does not exist in this kit.\n',
  '\n## Reading coverage\n\n',
  table(['Measure', 'Value'], [
    ['Files parsed', `${c.files_parsed ?? 'UNKNOWN'} (${pct(c.files_parsed_pct)})`],
    ['Code files', c.code_files ?? 'UNKNOWN'],
    ['Proposed for model reading', `${c.files_to_model_read ?? 'UNKNOWN'} (${pct(c.files_to_model_read_pct)})`],
    ['Fan-in weight covered', pct(c.fan_in_weight_covered_pct)],
    ['Route detection', c.route_detection ?? 'UNKNOWN'],
    ['Risk files covered', pct(c.risk_files_covered_pct)],
  ], 'No coverage reported.'),
  '\n_A proposed reading set is a plan, not proof anything was read._\n',
  '\n## Limits of this snapshot\n\n',
  (c.caveats ?? []).map((x) => `- ${x}\n`).join('') || '_No caveats recorded._\n',
  '\n## Readiness\n\n',
  slot('index-readiness',
    'State which stage-3 shape ran (fan-out or combined), which high-signal '
    + 'files were not read, and whether this knowledge base is ready for reuse, '
    + 'partial, or needs repair. A generated knowledge base is not production '
    + 'certification of the code it describes.'),
].join('')])

mkdirSync(OUT, { recursive: true })
const results = docs.map(([name, title, body]) => [name, writeManaged(join(OUT, name), title, body)])

if (!QUIET) {
  process.stdout.write('\nproject knowledge\n')
  for (const [name, st] of results) process.stdout.write(`  ${String(st).padEnd(10)} .dev/knowledge/${name}\n`)
  const open = docs.length
  process.stdout.write(`\n${docs.length} document(s) scaffolded, ${open} judgment slot(s) awaiting the model pass.\n`)
  process.stdout.write('Stage 3 is not complete until every slot is filled and every citation resolves.\n\n')
}
