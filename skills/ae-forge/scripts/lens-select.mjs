#!/usr/bin/env node

// Deterministic lens-attachment matcher. Mechanizes team.md's "Lens
// selection" algorithm so it is testable and repeatable instead of a prose
// instruction each Forge run interprets freshly.
//
// Three things this must get right, all of them failure modes the role router
// already learned the hard way:
//
//   1. It must ADAPT TO THE PROJECT, not to whatever domain words the model
//      happened to type. Detected stack markers in .dev/context/analysis.json
//      derive domain tags mechanically, so a React project gets the web
//      performance and accessibility lenses whether or not anyone said so.
//   2. It must FAIL SAFE. No domain input at all is reported as unassessed,
//      never as "no lens applies" - the same distinction --risk draws between
//      "assessed and clear" and "never asked".
//   3. It must KNOW WHEN IT IS OUT OF DATE. A lens carrying versioned facts
//      declares verified/review_after in team.json; past that date it reports
//      LENS STALE rather than quoting a threshold nobody rechecked.
//
// Usage as a library: import { selectLenses } from './lens-select.mjs'
// Usage as a CLI: node lens-select.mjs --team architect,builder --domain react
//                 (reads .dev/context/analysis.json automatically when present)

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

export function loadTeamContract(teamPath) {
  return JSON.parse(readFileSync(teamPath, 'utf8'))
}

/**
 * Derive domain tags from what a parser actually observed in the repository.
 * This is the "adapts to the project" half: the stack decides which lenses
 * are relevant, so nobody has to remember to ask for them.
 *
 * @param {object} analysis - parsed .dev/context/analysis.json
 * @param {object[]} detectors - team.json domain_detectors
 * @returns {{ tags: string[], because: Record<string,string> }}
 */
export function deriveDomains(analysis, detectors = []) {
  if (!analysis) return { tags: [], because: {} }
  const imports = Object.keys(analysis.stack?.external_imports ?? {}).map((s) => s.toLowerCase())
  const languages = Object.keys(analysis.inventory?.by_language ?? {}).map((s) => s.toLowerCase())
  const paths = [
    ...(analysis.selection?.files ?? []),
    ...(analysis.selection?.control_files ?? []),
    ...(analysis.schema_files ?? []).map((f) => (typeof f === 'string' ? f : f.path)),
  ].filter(Boolean).map((s) => String(s).toLowerCase())

  const tags = new Set()
  const because = {}
  const mark = (emit, reason) => {
    for (const tag of emit) { if (!tags.has(tag)) { tags.add(tag); because[tag] = reason } }
  }

  for (const rule of detectors) {
    const hitImport = (rule.when_imports ?? []).find((name) =>
      imports.some((imp) => imp === name || imp.startsWith(`${name}/`) || imp.endsWith(`/${name}`)))
    if (hitImport) { mark(rule.emit ?? [], `imports ${hitImport}`); continue }

    const hitLanguage = (rule.when_languages ?? []).find((name) => languages.includes(name))
    if (hitLanguage) { mark(rule.emit ?? [], `${hitLanguage} in the tree`); continue }

    const hitPath = (rule.when_paths ?? []).find((pattern) => {
      try { return paths.some((p) => new RegExp(pattern, 'i').test(p)) } catch { return false }
    })
    if (hitPath) { mark(rule.emit ?? [], `matched ${hitPath}`); continue }

    if (rule.when_schema && (analysis.schema_files ?? []).length) { mark(rule.emit ?? [], 'schema files detected'); continue }
    if (rule.when_routes && (analysis.routes ?? []).length) { mark(rule.emit ?? [], 'routes detected') }
  }
  return { tags: [...tags], because }
}

/**
 * @param {object} team - parsed team.json
 * @param {string[]} roles - the selected team roles (from forge.mjs chooseTeam)
 * @param {string[]} signals - the request's own signals
 * @param {string[]} stackSignals - domain tags, supplied or derived from the survey
 * @param {object} [options] - { assessed: boolean, today: Date }
 */
export function selectLenses(team, roles, signals, stackSignals = [], options = {}) {
  // Request signals describe THIS CHANGE; derived tags describe the PROJECT.
  // Both are useful, but they are not equal: a checkout change in a repository
  // that happens to import an LLM SDK should get the payments lens, not the
  // AI one. Weighting the request higher lets derived tags fill the remaining
  // slots without crowding out what the change is actually about.
  const requested = new Set(signals.map((s) => s.toLowerCase()))
  const derived = new Set(stackSignals.map((s) => s.toLowerCase()))
  const allSignals = new Set([...requested, ...derived])
  const lenses = team.lenses || {}
  const attached = {}

  for (const role of roles) {
    const scored = Object.entries(lenses)
      .filter(([, lens]) => (lens.attaches_to || []).includes(role))
      .map(([name, lens]) => {
        const own = (lens.signals || []).map((s) => s.toLowerCase())
        const byRequest = own.filter((s) => requested.has(s)).length
        const byProject = own.filter((s) => derived.has(s) && !requested.has(s)).length
        return { name, byRequest, byProject, score: byRequest + byProject }
      })
      .filter((m) => m.score > 0)
      // Lexicographic, not a weighted sum: ANY lens the request asked for
      // outranks every lens the project merely suggests. A weighted sum lets a
      // lens matching many project tags beat the one the change is actually
      // about. Ties break on declared team.json order (Object.entries
      // preserves insertion order), never on name, so adding a lens cannot
      // silently reorder an existing tie.
      .sort((a, b) =>
        (b.byRequest > 0) - (a.byRequest > 0)
        || b.byRequest - a.byRequest
        || b.byProject - a.byProject)

    if (scored.length) attached[role] = scored.slice(0, 2).map((m) => m.name)
  }

  // A named-but-unwritten domain must announce itself. This is the mechanism
  // that stops a role improvising expertise it has no checked source for.
  const backlog = new Set((team.lenses_backlog || []).map((s) => s.toLowerCase()))
  const unavailable = [...allSignals].filter((s) => backlog.has(s))

  // A lens whose facts have a shelf life says so rather than quoting a
  // threshold nobody rechecked. Confident staleness is the silent failure.
  const today = options.today ?? new Date()
  const stale = []
  for (const list of Object.values(attached)) {
    for (const name of list) {
      const after = lenses[name]?.review_after
      if (after && new Date(after) < today && !stale.includes(name)) stale.push(name)
    }
  }

  // No domain input at all is not the same as "assessed and nothing applies".
  const assessed = options.assessed ?? allSignals.size > 0
  return { attached, unavailable, stale, assessed }
}

function runCli() {
  const args = process.argv.slice(2)
  const option = (name, fallback = '') => {
    const i = args.indexOf(name)
    return i === -1 ? fallback : args[i + 1]
  }
  const split = (v) => v.split(',').map((x) => x.trim()).filter(Boolean)
  const teamPath = resolve(option('--team-json', resolve(SCRIPT_DIR, '..', 'references', 'team.json')))
  const team = loadTeamContract(teamPath)
  const roles = split(option('--team'))
  const signals = split(option('--signals'))
  const supplied = split(option('--domain') || option('--stack'))

  // Read the survey automatically. The project is the most reliable source of
  // domain truth available, and it does not depend on anyone remembering.
  const analysisPath = resolve(option('--analysis', join(process.cwd(), '.dev', 'context', 'analysis.json')))
  let derived = { tags: [], because: {} }
  let schemaMismatch = null
  if (existsSync(analysisPath)) {
    try {
      const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'))
      // A survey written by a different generation of the surveyor does not
      // fail here - it reports. Without this the failure mode was silent and
      // indistinguishable from success: a renamed field yields FEWER lenses,
      // returned as a legitimate selection. Every other absence in this kit
      // is recorded rather than inferred; this one was not.
      const expected = team.analysis_schema ?? null
      if (expected !== null && analysis.schema !== expected) {
        schemaMismatch = { expected, found: analysis.schema ?? null }
      } else {
        derived = deriveDomains(analysis, team.domain_detectors ?? [])
      }
    } catch { /* an unreadable survey is a missing survey, not a hard failure */ }
  }

  // --domain and --signals are both statements about THIS CHANGE, so they
  // carry request weight. Only what the sensor observed about the repository
  // is project-derived.
  const assessed = supplied.length > 0 || signals.length > 0 || derived.tags.length > 0
  const result = selectLenses(team, roles, [...signals, ...supplied], derived.tags, { assessed })
  process.stdout.write(`${JSON.stringify({
    ...result,
    derived_from_project: derived.tags,
    derived_because: derived.because,
    ...(schemaMismatch ? { schema_mismatch: schemaMismatch } : {}),
  }, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli()
