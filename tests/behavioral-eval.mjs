#!/usr/bin/env node
// Kit-development harness. A host adapter receives only a case project and
// writes a structured result; expectations stay outside that project.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, 'fixtures/behavioral-cases.json'), 'utf8')).cases
const expected = {
  assessment: { verdict: 'PASS', findings: [] },
  authorization: { verdict: 'REVISE', findings: ['cross-organization-access'] },
  diagnosis: { verdict: 'DIAGNOSED', findings: ['duplicate-order-on-retry'] },
  frontend: { verdict: 'REVISE', findings: ['keyboard-inoperable'] },
  migration: { verdict: 'REVISE', findings: ['data-loss', 'rolling-version-breakage', 'rollback-data-loss'] },
  routine: { verdict: 'APPROVED', findings: [] },
}
const taxonomy = Object.values(expected).flatMap((item) => item.findings)
  .filter((id, index, all) => all.indexOf(id) === index)
const flag = (name) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1]
}
const digest = (text) => createHash('sha256').update(text).digest('hex')
const fail = (message) => { process.stderr.write(`${message}\n`); process.exit(2) }
const base = flag('--out') ?? flag('--score')
if (!base) fail('usage: node tests/behavioral-eval.mjs --out <directory> [--runner <executable>] | --score <directory>')
const out = resolve(base)
const scoring = Boolean(flag('--score'))
const runner = flag('--runner')
if (scoring && runner) fail('--runner applies only to --out')
if (!scoring) {
  mkdirSync(out, { recursive: true })
  const inputHashes = {}
  for (const item of cases) {
    const root = join(out, item.id)
    if (existsSync(root)) fail(`case already exists; choose a fresh output directory: ${root}`)
    for (const [name, body] of Object.entries(item.inputs)) {
      const path = join(root, name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, body, 'utf8')
    }
    inputHashes[item.id] = Object.fromEntries(
      Object.entries(item.inputs).map(([name, body]) => [name, digest(body)]))
    writeFileSync(join(root, 'evaluation-prompt.md'), [
      readFileSync(join(root, 'request.md'), 'utf8').trim(), '',
      'Inspect the project evidence and use the installed ae-forge method. Do not edit inputs.',
      'Write evaluation-result.json with JSON fields: verdict and findings.',
      'Verdict is APPROVED, REVISE, DIAGNOSED, or PASS.',
      'Each finding has id and concrete evidence of at least 20 characters.',
      `Use a finding id only when demonstrated: ${taxonomy.join(', ')}.`,
      'Use findings: [] when no blocker is established.', '',
    ].join('\n'), 'utf8')
    if (runner) {
      const command = runner.endsWith('.mjs') || runner.endsWith('.js') ? process.execPath : runner
      const argv = command === process.execPath ? [runner, root, join(root, 'evaluation-prompt.md'), join(root, 'evaluation-result.json')]
        : [root, join(root, 'evaluation-prompt.md'), join(root, 'evaluation-result.json')]
      const result = spawnSync(command, argv,
        { cwd: root, encoding: 'utf8' })
      if (result.error || result.status !== 0) fail(`${item.id}: runner failed: ${result.error?.message ?? result.stderr}`)
    }
  }
  writeFileSync(join(out, 'input-hashes.json'), JSON.stringify(inputHashes, null, 2))
  process.stdout.write(`${JSON.stringify({ cases: cases.map((item) => item.id), output: out,
    runner: runner ?? null, score_command: `node tests/behavioral-eval.mjs --score "${out}"` }, null, 2)}\n`)
} else {
  const results = []
  const allInputHashes = JSON.parse(readFileSync(join(out, 'input-hashes.json'), 'utf8'))
  for (const item of cases) {
    const root = join(out, item.id)
    const path = join(root, 'evaluation-result.json')
    if (!existsSync(path)) { results.push({ id: item.id, pass: false, error: 'missing result' }); continue }
    let answer
    try { answer = JSON.parse(readFileSync(path, 'utf8')) } catch {
      results.push({ id: item.id, pass: false, error: 'invalid result JSON' }); continue
    }
    const found = Array.isArray(answer.findings) ? answer.findings : []
    const ids = found.map((finding) => finding?.id)
    const required = expected[item.id].findings
    const missed = required.filter((id) => !ids.includes(id))
    const unexpected = ids.filter((id) => !required.includes(id))
    const weakEvidence = found.filter((finding) => typeof finding.evidence !== 'string'
      || finding.evidence.trim().length < 20).map((finding) => finding.id)
    const inputHashes = allInputHashes[item.id]
    const changed = Object.entries(inputHashes).filter(([name, hash]) => {
      const file = join(root, name)
      return !existsSync(file) || digest(readFileSync(file)) !== hash
    }).map(([name]) => name)
    const pass = answer.verdict === expected[item.id].verdict && !missed.length
      && !unexpected.length && !weakEvidence.length && !changed.length
    results.push({ id: item.id, pass, verdict: answer.verdict, expected: expected[item.id].verdict,
      missed, unexpected, weak_evidence: weakEvidence, changed_inputs: changed })
  }
  const summary = { passed: results.filter((item) => item.pass).length, total: results.length, results }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (summary.passed !== summary.total) process.exitCode = 1
}
