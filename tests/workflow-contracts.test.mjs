import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const script = (name) => resolve(repo, name)
const forge = script('skills/ae-forge/scripts/forge.mjs')
const lensSelect = script('skills/ae-forge/scripts/lens-select.mjs')
const guard = script('skills/ae-forge/scripts/guard.mjs')
const analyze = script('skills/ae-surveyor/scripts/analyze.mjs')
const knowledge = script('skills/ae-surveyor/scripts/knowledge.mjs')
const rules = script('skills/ae-surveyor/scripts/rules.mjs')

function withProject(name, run) {
  const root = mkdtempSync(join(tmpdir(), name))
  const put = (path, content) => {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
    return target
  }
  const invoke = (file, args, env = {}) => spawnSync(process.execPath, [file, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
  })
  try { run({ root, put, invoke }) } finally { rmSync(root, { recursive: true, force: true }) }
}

function surveyed(put) {
  for (const name of ['00-index', 'stack', 'architecture', 'schema', 'commands', 'decisions']) {
    put(`.dev/knowledge/${name}.md`, `# ${name}\nReadiness: ready for reuse\n`)
  }
  put('.dev/rules/00-index.md', '# Rules\n')
}

test('Surveyor generators reject incompatible analysis before writing knowledge or rules', () => {
  withProject('ae-analysis-schema-', ({ root, put, invoke }) => {
    put('.dev/context/analysis.json', JSON.stringify({ schema: 1, generated_at: '2026-01-01T00:00:00Z' }))
    for (const entry of [knowledge, rules]) {
      const result = invoke(entry, ['--root', root])
      assert.equal(result.status, 2)
      assert.match(result.stderr, /schema 1 is incompatible; expected 2/)
    }
  })
})

test('Surveyor analyzer produces the schema its generators accept', () => {
  withProject('ae-analysis-current-', ({ root, put, invoke }) => {
    put('src/answer.js', 'export const answer = 42\n')
    const scan = invoke(analyze, ['--root', root])
    assert.equal(scan.status, 0, scan.stderr)
    const analysis = JSON.parse(readFileSync(join(root, '.dev/context/analysis.json'), 'utf8'))
    assert.equal(analysis.schema, 2)
    assert.equal(invoke(knowledge, ['--root', root]).status, 0)
    assert.equal(invoke(rules, ['--root', root]).status, 0)
  })
})

test('lens selection reads the run request, ahead of project-only domain signals', () => {
  withProject('ae-lens-request-', ({ root, put, invoke }) => {
    put('.dev/work/request-lenses/run.json', JSON.stringify({
      id: 'request-lenses', team: ['builder'], signals: ['payments'], domains: [],
    }))
    put('.dev/context/analysis.json', JSON.stringify({
      schema: 2, stack: { external_imports: { react: 1 } },
      inventory: { by_language: { javascript: { files: 1 } } },
      selection: { files: [] }, schema_files: [], routes: [],
    }))
    const result = invoke(lensSelect, ['--id', 'request-lenses', '--analysis', join(root, '.dev/context/analysis.json')])
    assert.equal(result.status, 0, result.stderr)
    const selected = JSON.parse(result.stdout)
    assert.ok(selected.attached.builder.includes('payments'))
    assert.ok(selected.derived_from_project.includes('web-performance'))
  })
})

test('native enforcement is reported only for the current host session', () => {
  withProject('ae-enforce-session-', ({ root, put, invoke }) => {
    put('.dev/context/.keep', '')
    const hook = spawnSync(process.execPath, [guard, 'session-start'], {
      cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root, session_id: 'old-session' }),
    })
    assert.equal(hook.status, 0)
    const read = (session) => JSON.parse(invoke(forge, ['contract'], { CLAUDE_CODE_SESSION_ID: session }).stdout)
    assert.equal(read('current-session').enforce, 'none')
    assert.equal(read('old-session').enforce, 'native')
  })
})

test('Forge cannot finish with a verdict that disagrees with Verifier evidence', () => {
  withProject('ae-verdict-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    const start = call('start', '--id', 'verdict', '--title', 'Check verdict', '--kind', 'audit', '--tier', 'quick', '--risk', 'none')
    assert.equal(start.status, 0, start.stdout)
    assert.equal(call('artifact', '--id', 'verdict').status, 0)
    assert.equal(call('lenses', '--id', 'verdict', '--json', JSON.stringify({ attached: {}, assessed: true })).status, 0)
    const audit = put('.dev/work/verdict/results/auditor.md', '# Auditor\n\n## OUTCOME\nAudit complete.\n')
    assert.equal(call('note', '--id', 'verdict', '--role', 'auditor', '--summary', 'Audit complete', '--result', audit).status, 0)
    assert.equal(call('phase', '--id', 'verdict', '--to', 'verify', '--summary', 'Reviewing audit').status, 0)
    const fail = put('.dev/work/verdict/results/verifier.md', '# Verifier\n\n## OUTCOME\n\n### Verdict\nFAIL\n')
    assert.equal(call('note', '--id', 'verdict', '--role', 'verifier', '--summary', 'Failed', '--severity', 'none', '--review-context', 'same-session', '--result', fail).status, 0)
    const finish = (...extra) => call('finish', '--id', 'verdict', '--summary', 'Audit reviewed', '--verification', 'Review recorded', ...extra)
    assert.notEqual(finish().status, 0, 'the verdict must be explicit')
    const mismatch = finish('--result', 'PASS')
    assert.equal(mismatch.status, 5)
    assert.match(JSON.parse(mismatch.stdout).error, /verdict disagrees/)
    const pass = put('.dev/work/verdict/results/verifier-pass.md', '# Verifier\n\n## OUTCOME\n\n### Verdict\nPASS\n')
    assert.equal(call('section', '--id', 'verdict', '--name', 'verification', '--from', pass).status, 0)
    assert.equal(call('note', '--id', 'verdict', '--role', 'verifier', '--summary', 'Passed', '--severity', 'none', '--review-context', 'same-session', '--result', pass).status, 0)
    assert.equal(finish('--result', 'PASS').status, 0)
    assert.match(readFileSync(join(root, '.dev/runs/verdict.md'), 'utf8'), /### Verdict\nPASS/)
  })
})
