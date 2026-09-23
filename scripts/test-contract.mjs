#!/usr/bin/env node
// test-contract.mjs - the sensor/consumer wire contract.
//
// .dev/context/analysis.json is the only artifact that crosses a skill
// boundary in this kit: ae-surveyor writes it, ae-forge's lens-select reads
// it, and the surveyor's own knowledge/rules renderers read it again. It
// carries a `schema` field and nothing ever checked it.
//
// That mattered because every consumer reads with `?? []` and lens-select
// wraps the whole parse in a catch. A renamed field therefore produced FEWER
// LENSES, returned as a legitimate selection - indistinguishable from "no
// lens applies". The same drift had already happened inside the surveyor:
// knowledge.mjs read `m.manager` and `c.name` against a sensor that writes
// `kind` and `id`, so every manifest and component row rendered UNKNOWN with
// the value one field away in the same JSON.
//
// This test runs the real analyzer over the eval fixture and asserts that
// every path a consumer actually reads is present AND populated. A field that
// exists but is empty passes a schema check and still breaks the feature.

import { existsSync, mkdtempSync, readFileSync, rmSync, cpSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const surveyor = join(repo, 'skills', 'ae-surveyor', 'scripts')
const forge = join(repo, 'skills', 'ae-forge')
const temp = mkdtempSync(join(tmpdir(), 'ae-contract-'))
let passed = 0
let failed = 0

const check = (name, condition, detail = '') => {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) } else {
    failed++
    process.stdout.write(`  FAIL  ${name}${detail ? `: ${detail}` : ''}\n`)
  }
}
const node = (script, args, cwd) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })

try {
  // A project with two components, two manifests and real routes, so the
  // tables under test have something to render.
  const project = join(temp, 'project')
  mkdirSync(project, { recursive: true })
  cpSync(join(repo, 'evals', 'fixture'), project, { recursive: true })
  mkdirSync(join(project, 'tool'), { recursive: true })
  const toolPkg = { name: 'contract-tool', scripts: { test: 'node --test', build: 'tsc -p .' } }
  const fs = await import('node:fs')
  fs.writeFileSync(join(project, 'tool', 'package.json'), `${JSON.stringify(toolPkg, null, 2)}\n`)
  // A declared dependency, because the analyzer classifies an undeclared
  // specifier as `unknown` rather than `external` on purpose - "unclassified
  // imports remain unknown, not external".
  const rootPkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
  rootPkg.dependencies = { ...rootPkg.dependencies, express: '^4.19.2' }
  fs.writeFileSync(join(project, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`)
  // A route that exists only inside a comment. It must not be reported.
  fs.writeFileSync(join(project, 'src', 'commented.js'),
    ['const express = require(\'express\')',
      '// app.get(\'/ghost\', handler) - documentation, not a route',
      '/* router.post(\'/phantom\', handler) */',
      'const url = \'http://example.test//real\'',
      'app.get(\'/live\', handler)',
      ''].join('\n'))

  const analysisPath = join(project, '.dev', 'context', 'analysis.json')
  const run = node(join(surveyor, 'analyze.mjs'), ['--root', project, '--quiet'], project)
  check('analyze.mjs exits 0 on a two-component project', run.status === 0, run.stderr?.trim())
  if (!existsSync(analysisPath)) {
    check('analysis.json written', false, 'no file')
    throw new Error('cannot continue without an analysis')
  }
  const a = JSON.parse(readFileSync(analysisPath, 'utf8'))

  // -------------------------------------------------- declared schema ------
  const team = JSON.parse(readFileSync(join(forge, 'references', 'team.json'), 'utf8'))
  check('team.json declares the analysis schema it expects', typeof team.analysis_schema === 'number')
  check('analyze.mjs writes that same schema', a.schema === team.analysis_schema,
    `analysis.schema=${a.schema} team.analysis_schema=${team.analysis_schema}`)

  // ------------------------------------- fields lens-select.mjs reads ------
  // Named individually rather than looped, so a rename shows up as the exact
  // path that broke instead of a count that went down.
  check('stack.external_imports is populated', Object.keys(a.stack?.external_imports ?? {}).length > 0)
  check('inventory.by_language is populated', Object.keys(a.inventory?.by_language ?? {}).length > 0)
  check('selection.files is populated', (a.selection?.files ?? []).length > 0)
  check('selection.control_files is populated', (a.selection?.control_files ?? []).length > 0)
  check('schema_files is an array', Array.isArray(a.schema_files))
  check('routes is an array', Array.isArray(a.routes))

  // The detector path must actually fire on this fixture, or the assertions
  // above prove only that fields exist.
  const lens = node(join(forge, 'scripts', 'lens-select.mjs'),
    ['--team', 'architect,builder,verifier'], project)
  check('lens-select.mjs exits 0', lens.status === 0, lens.stderr?.trim())
  let selection = {}
  try { selection = JSON.parse(lens.stdout) } catch { /* reported below */ }
  check('lens-select derives domains from the survey alone',
    (selection.derived_from_project ?? []).length > 0,
    `derived_from_project=${JSON.stringify(selection.derived_from_project)}`)
  check('no schema mismatch against a current survey', !selection.schema_mismatch,
    JSON.stringify(selection.schema_mismatch))

  // A survey from another generation must REPORT, never silently thin out.
  const stalePath = join(project, '.dev', 'context', 'stale.json')
  fs.writeFileSync(stalePath, JSON.stringify({ ...a, schema: 999 }))
  const staleRun = node(join(forge, 'scripts', 'lens-select.mjs'),
    ['--team', 'architect', '--analysis', stalePath], project)
  const staleOut = (() => { try { return JSON.parse(staleRun.stdout) } catch { return {} } })()
  check('a foreign analysis schema is reported, not swallowed',
    Boolean(staleOut.schema_mismatch) && staleOut.schema_mismatch.found === 999)

  // ---------------------------------- fields knowledge.mjs renders ---------
  const know = node(join(surveyor, 'knowledge.mjs'), ['--root', project, '--quiet'], project)
  check('knowledge.mjs exits 0', know.status === 0, know.stderr?.trim())
  const stack = readFileSync(join(project, '.dev', 'knowledge', 'stack.md'), 'utf8')
  const arch = readFileSync(join(project, '.dev', 'knowledge', 'architecture.md'), 'utf8')

  const managerRows = stack.split('\n')
    .filter((line) => /^\| (npm|node|deno|gradle|python|go|rust|ruby|php|maven|UNKNOWN)/.test(line))
  check('the manifest table has rows', managerRows.length > 0)
  check('no manifest row renders UNKNOWN',
    managerRows.length > 0 && !managerRows.some((line) => line.includes('UNKNOWN')),
    managerRows.find((line) => line.includes('UNKNOWN')))

  const componentSection = arch.split('## Components')[1]?.split('##')[0] ?? ''
  const componentRows = componentSection.split('\n').filter((line) => /^\|/.test(line) && !/^\|\s*-+/.test(line) && !/Component \| Root/.test(line))
  check('the component table has rows', componentRows.length > 0)
  check('no component row renders UNKNOWN',
    componentRows.length > 0 && !componentRows.some((line) => line.includes('UNKNOWN')),
    componentRows.find((line) => line.includes('UNKNOWN')))

  // ------------------------------------------- comments are not routes -----
  const routePaths = (a.routes ?? []).map((r) => r.route)
  check('a route written only in a line comment is not detected', !routePaths.includes('/ghost'),
    JSON.stringify(routePaths))
  check('a route written only in a block comment is not detected', !routePaths.includes('/phantom'))
  check('a real route beside those comments is still detected', routePaths.includes('/live'),
    JSON.stringify(routePaths))
  check('a // inside a string literal does not eat the line',
    !routePaths.includes('/real'))

  // -------------------------------------- dotfile citations resolve --------
  const kdir = join(project, '.dev', 'knowledge')
  fs.appendFileSync(join(kdir, 'stack.md'), '\nOBSERVED `.dev/context/analysis.json:1`\n')
  const cites = node(join(surveyor, 'verify-citations.mjs'), ['--root', project, '--quiet'], project)
  check('a citation into a dot-prefixed directory resolves', cites.status === 0,
    `${cites.stdout}${cites.stderr}`)
} catch (error) {
  failed++
  process.stdout.write(`  FAIL  contract suite aborted: ${error.message}\n`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
