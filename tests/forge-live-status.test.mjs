import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'ae-forge', 'scripts', 'forge.mjs')
const analyze = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'ae-forge', 'scripts', 'analyze.mjs')

test('Forge starts without a survey and keeps the readable run status current', () => {
  const root = mkdtempSync(join(tmpdir(), 'ae-forge-status-'))
  const invoke = (...args) => {
    const result = spawnSync(process.execPath, [script, ...args, '--root', root], { encoding: 'utf8' })
    return { code: result.status, body: JSON.parse(result.stdout) }
  }
  const put = (name, content) => {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    return path
  }
  const readArtifact = () => readFileSync(join(root, '.dev', 'runs', 'live-status.md'), 'utf8')

  try {
    const start = ['start', '--id', 'live-status', '--title', 'Live status', '--kind', 'audit', '--risk', 'none']
    assert.equal(invoke(...start).code, 0)
    assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /\/\.dev\//)
    assert.equal(invoke(...start).body.reused, true)
    assert.equal(invoke('artifact', '--id', 'live-status').code, 0)
    assert.equal(invoke('lenses', '--id', 'live-status', '--json', JSON.stringify({ attached: { auditor: ['android'] } })).code, 0)

    assert.equal(invoke('focus', '--id', 'live-status', '--role', 'auditor', '--summary', 'Inspecting Android behavior').code, 0)
    assert.match(readArtifact(), /auditor \(ae-audit\)/)
    assert.match(readArtifact(), /\*\*Lenses:\*\* android/)
    assert.match(readArtifact(), /Inspecting Android behavior/)

    const result = put('.dev/work/live-status/results/auditor.md', 'Audited the change.\n')
    assert.equal(invoke('note', '--id', 'live-status', '--role', 'auditor', '--summary', 'Audit complete', '--result', result).code, 0)
    assert.match(readArtifact(), /\| 1 \| .* \| auditor \| understand \| 0 \| Audit complete \|/)
    assert.match(readArtifact(), /\*\*Current handler:\*\* forge \(ae-forge\)/)

    assert.equal(invoke('phase', '--id', 'live-status', '--to', 'verify', '--summary', 'Checking audit findings').code, 0)
    assert.equal(invoke('focus', '--id', 'live-status', '--role', 'verifier', '--summary', 'Checking evidence').code, 0)
    assert.match(readArtifact(), /\*\*Phase:\*\* verify/)
    assert.match(readArtifact(), /verifier \(ae-verify\)/)

    const doc = readArtifact().replace('**Phase:** verify', '**Phase:** obsolete')
    put('.dev/runs/live-status.md', doc)
    assert.equal(invoke('status', '--id', 'live-status').code, 0)
    assert.match(readArtifact(), /\*\*Phase:\*\* verify/)

    assert.equal(invoke('cancel', '--id', 'live-status', '--reason', 'Fixture complete').code, 0)
    assert.match(readArtifact(), /\*\*State:\*\* cancelled/)
    assert.match(readArtifact(), /\*\*Current handler:\*\* none/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Forge ignores all generated artifacts and preserves previously tracked copies', () => {
  const root = mkdtempSync(join(tmpdir(), 'ae-forge-ignore-'))
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args, '--root', root], { encoding: 'utf8' })
  try {
    assert.equal(git('init', '-q').status, 0)
    const old = join(root, '.dev/runs/old.md')
    mkdirSync(dirname(old), { recursive: true })
    writeFileSync(old, 'Prior run evidence\n')
    assert.equal(git('add', '.dev/runs/old.md').status, 0)
    assert.match(git('ls-files', '.dev').stdout, /old\.md/)
    const start = ['start', '--id', 'ignore', '--title', 'Ignore artifacts', '--kind', 'audit', '--risk', 'none']
    assert.equal(invoke(...start).status, 0)
    assert.equal(git('ls-files', '.dev').stdout, '')
    assert.equal(readFileSync(old, 'utf8'), 'Prior run evidence\n')
    assert.equal(git('check-ignore', '.dev/runs/old.md').status, 0)
    assert.equal(git('check-ignore', '.dev/work/ignore/run.json').status, 0)
    const before = readFileSync(join(root, '.gitignore'), 'utf8')
    assert.equal(invoke(...start).status, 0)
    assert.equal(readFileSync(join(root, '.gitignore'), 'utf8'), before)
    assert.equal(before.match(/agent-engineering:generated:start/g)?.length, 1)
    const second = invoke('start', '--new', '--id', 'ignore-second', '--title', 'Ignore artifacts',
      '--kind', 'audit', '--risk', 'none')
    assert.equal(second.status, 0)
    const resumed = invoke('start', '--id', 'ignore-second', '--title', 'Ignore artifacts',
      '--kind', 'audit', '--risk', 'none')
    assert.equal(JSON.parse(resumed.stdout).id, 'ignore-second')
    assert.equal(JSON.parse(resumed.stdout).reused, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('analyzer writes only below the requested project root', () => {
  const parent = mkdtempSync(join(tmpdir(), 'ae-analyze-root-'))
  const root = join(parent, 'app')
  try {
    mkdirSync(root)
    writeFileSync(join(root, 'app.js'), 'export const ready = true\n')
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: parent }).status, 0)
    const scan = spawnSync(process.execPath, [analyze, '--root', root], { encoding: 'utf8' })
    assert.equal(scan.status, 0, scan.stderr)
    assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /\/\.dev\//)
    assert.equal(readFileSync(join(root, '.dev/context/analysis.json'), 'utf8').includes('app.js'), true)
    assert.equal(existsSync(join(parent, '.dev')), false)
    assert.equal(spawnSync(process.execPath, [analyze, '--root', root, '--out', join(root, 'analysis.json')],
      { encoding: 'utf8' }).status, 2)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('resuming an older run installs the ignore rule before updating its record', () => {
  const root = mkdtempSync(join(tmpdir(), 'ae-resume-ignore-'))
  try {
    const path = join(root, '.dev/work/legacy/run.json')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ schema: 1, id: 'legacy', status: 'active', phase: 'understand',
      title: 'Legacy', kind: 'audit', team: ['auditor', 'verifier'], contributions: [] }))
    const result = spawnSync(process.execPath, [script, 'status', '--id', 'legacy', '--root', root],
      { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout)
    assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /\/\.dev\//)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
