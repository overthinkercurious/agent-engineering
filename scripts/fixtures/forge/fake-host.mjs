#!/usr/bin/env node
// Deterministic fake execution host for Forge contract tests.

import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback = '') => { const index = argv.indexOf(name); return index === -1 ? fallback : (argv[index + 1] ?? fallback) }
const mode = arg('--mode', 'complete')

if (argv.includes('--capabilities')) {
  const isolation = arg('--isolation', 'fresh_process')
  process.stdout.write(`${JSON.stringify({
    schema: 1,
    adapter_id: arg('--adapter-id', `fake-${mode}`),
    model_id: 'fake-small-v1',
    model_class: arg('--model-class', 'smaller'),
    isolation,
    fresh_context: isolation === 'shared_context' ? 'unavailable' : 'available',
    per_dispatch_model_selection: 'available',
    usage_telemetry: arg('--telemetry-status', 'measured') === 'unavailable' ? 'unavailable' : 'available',
    tool_write_enforcement: arg('--permission-status', 'available'),
    cancellation_acknowledgement: 'available',
    observation_source: 'deterministic fake-host capability handshake',
  })}\n`)
  process.exit(0)
}

const packet = JSON.parse(readFileSync(arg('--packet'), 'utf8'))

if (mode === 'counted') appendFileSync(join(dirname(arg('--packet')), 'host-calls.log'), 'called\n')

if (mode === 'host-fail') {
  process.stderr.write('api_key=synthetic-secret-value-1234567890')
  process.exit(9)
}

if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 2000))

if (mode === 'malformed') {
  process.stdout.write('{"schema":2,"status":"complete"}\n')
  process.exit(0)
}

const unavailable = { value: null, provenance: 'unavailable' }
const result = {
  schema: 2,
  run_id: packet.run_id,
  dispatch_id: packet.dispatch_id,
  specialist: packet.specialist,
  status: mode.startsWith('needs-') ? 'needs_specialist' : mode === 'diagnosis-blocked' ? 'blocked' : 'complete',
  outcome: mode.startsWith('needs-') ? 'A specialist boundary requires Forge routing.' : mode === 'diagnosis-blocked' ? 'The available evidence cannot establish a cause.' : 'Bounded specialist task completed.',
  summary: mode === 'secret' ? 'Accidentally emitted sk-abcdefghijklmnopqrstuvwxyz123456' : mode === 'huge' ? 'x'.repeat(300000) : 'Used only the packet and bounded brief.',
  evidence: mode.startsWith('diagnosis')
    ? [
        { id: 'observed:symptom', class: 'OBSERVED', claim: 'The explicit request value is replaced by the stored value.' },
        { id: 'inferred:merge-order', class: 'INFERRED', claim: 'The later stored-default spread wins a colliding key.' },
      ]
    : [
        { id: 'observed:packet', class: 'OBSERVED', claim: 'The packet passed the host boundary.' },
        ...(arg('--cite-receipt') ? [{ id: `receipt:${arg('--cite-receipt')}`, class: 'MEASURED', claim: 'The runner-executed command receipt confirms the declared quality command passed on this candidate.' }] : []),
      ],
  assumptions: [],
  unknowns: [],
  confidence: { level: 'high', basis: 'Deterministic fake-host fixture.' },
  diagnosis: mode.startsWith('diagnosis')
    ? {
        symptom: 'An explicit request option does not override the stored default.',
        observation_ids: ['observed:symptom'],
        hypotheses: [
          { id: 'H1', statement: 'Stored defaults are spread after request options.', discriminating_test: 'Trace a colliding key through the shared resolver.', result: mode === 'diagnosis-blocked' ? 'The required input was unavailable.' : 'The later stored spread supplies the returned value.', evidence_ids: ['observed:symptom', 'inferred:merge-order'], disposition: mode === 'diagnosis-blocked' ? 'unresolved' : 'supported' },
          { id: 'H2', statement: 'The wrapper discards false values.', discriminating_test: 'Compare the direct and wrapper call paths.', result: 'Both paths reach the same shared merge unchanged.', evidence_ids: ['inferred:merge-order'], disposition: 'disproved' },
        ],
        established_cause: mode === 'diagnosis-blocked' ? null : 'The shared resolver spreads stored defaults after explicit request options.',
        contributing_factors: ['Both public callers delegate to the shared resolver.'],
        remaining_uncertainty: mode === 'diagnosis-blocked' ? ['The discriminating runtime input is missing.'] : [],
      }
    : null,
  artifact_changes: mode === 'bad-artifact' ? [{ path: 'src/unauthorized.txt', action: 'created', sha256: 'a'.repeat(64) }] : [],
  findings: [],
  needs_specialist: mode.startsWith('needs-')
    ? [{ specialty: mode === 'needs-self' ? packet.specialist : mode === 'needs-scout' ? 'scout' : mode === 'needs-probe' ? 'probe' : 'shift', reason: 'Schema ownership is required.', missing_inputs: ['migration contract'], blocking: true }]
    : [],
  usage: {
    schema: 1,
    calls: 1,
    input_tokens: mode === 'unavailable' ? { ...unavailable } : { value: 120, provenance: 'measured' },
    output_tokens: mode === 'unavailable' ? { ...unavailable } : { value: 40, provenance: 'measured' },
    reasoning_tokens: { ...unavailable },
    cached_tokens: { value: 0, provenance: 'measured' },
    charge_usd: { ...unavailable },
    wall_time_ms: 5,
  },
}
process.stdout.write(`${JSON.stringify(result)}\n`)
