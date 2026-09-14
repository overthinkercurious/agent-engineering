#!/usr/bin/env node
// Development-only runner for the versioned Phase 4 real-model comparison.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FORGE = join(ROOT, 'skills', 'ae-forge', 'scripts', 'forge.mjs')
const ADAPTER = join(ROOT, 'skills', 'ae-forge', 'scripts', 'codex-host.mjs')
const FIXTURE = join(ROOT, 'scripts', 'fixtures', 'forge', 'config-precedence')
const POLICY = join(ROOT, 'scripts', 'fixtures', 'forge', 'policy', 'prototype')
const argv = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const index = argv.indexOf(name)
  return index === -1 ? fallback : (argv[index + 1] ?? fallback)
}
const arm = arg('--arm')
const model = arg('--model')
const modelClass = arg('--model-class')
const reasoning = arg('--reasoning-effort', 'low')
const codexCommand = arg('--codex-command', 'codex')
const attempt = Number(arg('--attempt', '1'))
const series = arg('--series', 'v1')
if (!['smaller', 'reference'].includes(arm)) throw new Error('--arm must be smaller or reference')
if (!model) throw new Error('--model is required')
if (!['smaller', 'strongest'].includes(modelClass)) throw new Error('--model-class must be smaller or strongest')
if ((arm === 'smaller') !== (modelClass === 'smaller')) throw new Error('arm and model class do not match')
if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 2) throw new Error('--attempt must be 1 or 2')
if (!/^[a-z0-9][a-z0-9-]{1,20}$/.test(series)) throw new Error('--series must be a short lowercase identifier')

const runId = `phase4-${arm}-${series}`
const adapterId = `phase4-${arm}-${series}`
const project = join(ROOT, 'tmp', 'phase4-model-trace', `${arm}-${series}`)

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: options.cwd || project,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 2 * 1024 * 1024,
  timeout: options.timeout || 300000,
})
if (attempt === 1) {
  if (existsSync(project)) throw new Error(`trace workspace already exists: ${project}`)
  mkdirSync(project, { recursive: true })
  cpSync(FIXTURE, project, { recursive: true })
  mkdirSync(join(project, '.dev', 'knowledge'), { recursive: true })
  mkdirSync(join(project, '.dev', 'rules'), { recursive: true })
  mkdirSync(join(project, '.dev', 'policy'), { recursive: true })
  mkdirSync(join(project, '.dev', 'context'), { recursive: true })
  writeFileSync(join(project, '.dev', 'knowledge', '00-index.md'), '# Trace fixture knowledge\n', 'utf8')
  writeFileSync(join(project, '.dev', 'rules', '00-index.md'), '# Trace fixture rules\n', 'utf8')
  for (const name of ['authority.yml', 'quality-gates.yml', 'release.yml', 'routing.yml']) cpSync(join(POLICY, name), join(project, '.dev', 'policy', name))
  if (arm === 'reference') {
    const path = join(project, '.dev', 'policy', 'routing.yml')
    const source = readFileSync(path, 'utf8')
    if (!source.includes('model_profile: smaller-model-only')) throw new Error('prototype model profile changed unexpectedly')
    writeFileSync(path, source.replace('model_profile: smaller-model-only', 'model_profile: mixed'), 'utf8')
  }
  const host = {
    schema: 1,
    id: adapterId,
    command: 'node',
    args: [
      ADAPTER, '--adapter-id', adapterId, '--model', model, '--model-class', modelClass,
      '--reasoning-effort', reasoning, '--codex-command', codexCommand, '--model-timeout-ms', '240000',
    ],
    deterministic: false,
    cacheable: false,
    timeout_ms: 300000,
  }
  writeFileSync(join(project, '.dev', 'context', 'host.json'), `${JSON.stringify(host, null, 2)}\n`, 'utf8')
  run('git', ['init', '-q'])
  run('git', ['add', '-A'])
  run('git', ['-c', 'user.email=trace@example.com', '-c', 'user.name=Trace', 'commit', '-qm', 'phase4 trace fixture'])
  run('node', [FORGE, 'start', '--title', `Phase 4 ${arm} diagnosis ${series}`, '--kind', 'bug', '--id', runId, '--root', project])
} else {
  if (!existsSync(project)) throw new Error(`trace workspace is missing: ${project}`)
  run('node', [FORGE, 'resume', '--id', runId, '--root', project])
}

const dispatchArgs = [
  FORGE, 'dispatch', '--id', runId, '--dispatch-id', `probe-${arm}-${series}-${attempt}`,
  '--specialist', 'probe', '--stage', 'discovery', '--host-config', '.dev/context/host.json', '--independent',
  '--request', 'Diagnose why explicit request configuration does not override stored defaults. Establish the smallest causal account and state how the behavior reaches both directConfig and wrapperConfig. Do not prescribe or implement a repair.',
  '--acceptance', 'AC-PRECEDENCE-DIAGNOSIS',
  '--inputs', 'README.md,src/config.mjs,src/direct.mjs,src/wrapper.mjs', '--tools', 'read',
  '--invariants', 'Explicit request options should override stored defaults,Use only routed files,Do not modify source,Return no findings or release verdict',
  '--procedure', 'Inspect the merge order,Trace the direct caller,Trace the wrapper caller,Separate observations from inference',
  '--next-check', 'Compare the causal account against the committed fixture oracle',
  '--calls', '1', '--input-tokens', '12000', '--output-tokens', '3000', '--context-tokens', '16000', '--wall-time-seconds', '240',
  '--root', project,
]
if (arm === 'reference') dispatchArgs.push('--model-escalation-reason', 'Development-only stronger reference required by the Phase 4 comparison design')
const dispatch = JSON.parse(run('node', dispatchArgs, { timeout: 310000 }))
const doctor = JSON.parse(run('node', [FORGE, 'doctor', '--id', runId, '--root', project]))
const evidenceDir = join(project, '.dev', 'work', runId, 'runs', 'dispatches', `probe-${arm}-${series}-${attempt}`)
const resultPath = join(evidenceDir, 'result.json')
const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : null
const record = JSON.parse(readFileSync(join(evidenceDir, 'record.json'), 'utf8'))
process.stdout.write(`${JSON.stringify({
  schema: 1,
  arm,
  requested_model: model,
  reasoning_effort: reasoning,
  attempt,
  series,
  workspace: project,
  dispatch_ok: dispatch.ok,
  doctor_ok: doctor.ok,
  record,
  result,
}, null, 2)}\n`)
