import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'ae-forge', 'scripts', 'forge.mjs')

test('Forge requires first-run survey and keeps the readable run status current', () => {
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
    const start = ['start', '--id', 'live-status', '--title', 'Live status', '--kind', 'audit', '--tier', 'quick', '--risk', 'none']
    const missing = invoke(...start)
    assert.equal(missing.code, 5)
    assert.match(missing.body.error, /survey is required/)

    for (const name of ['00-index', 'stack', 'architecture', 'schema', 'commands', 'decisions']) {
      put(`.dev/knowledge/${name}.md`, `# ${name}\n`)
    }
    assert.equal(invoke(...start).code, 5, 'rules index is part of the first survey')
    put('.dev/rules/00-index.md', '# Rules\n')
    put('.dev/knowledge/00-index.md', '# Index\nTODO (judgment)\n')
    assert.equal(invoke(...start).code, 5, 'a scaffolded survey is not a completed survey')
    put('.dev/knowledge/00-index.md', '# Index\nReadiness: ready for reuse\n')
    assert.equal(invoke(...start).code, 0)
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
