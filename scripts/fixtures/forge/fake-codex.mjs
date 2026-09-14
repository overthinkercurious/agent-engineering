#!/usr/bin/env node
// Deterministic Codex CLI protocol fixture for the shipped read-only adapter.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
if (argv.includes('--version')) {
  process.stdout.write('codex-cli fake-1.0.0\n')
  process.exit(0)
}
if (argv[0] === 'exec' && argv.includes('--help')) {
  process.stdout.write('--ephemeral --model --json --sandbox --output-schema\n')
  process.exit(0)
}
if (argv[0] !== 'exec') process.exit(2)

const required = ['--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--sandbox', '--model', '--output-schema', '--cd']
for (const flag of required) if (!argv.includes(flag)) {
  process.stderr.write(`missing adapter flag ${flag}\n`)
  process.exit(3)
}
for (const disabled of ['apps', 'plugins', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'multi_agent', 'multi_agent_v2', 'shell_tool', 'skill_search', 'tool_suggest']) {
  const index = argv.findIndex((value, offset) => value === '--disable' && argv[offset + 1] === disabled)
  if (index === -1) {
    process.stderr.write(`feature not disabled: ${disabled}\n`)
    process.exit(4)
  }
}
const sandbox = argv[argv.indexOf('--sandbox') + 1]
if (sandbox !== 'read-only') process.exit(5)
const configs = argv.flatMap((value, index) => value === '--config' ? [argv[index + 1]] : [])
if (!configs.includes('approval_policy="never"')) {
  process.stderr.write('non-interactive approval policy was not pinned\n')
  process.exit(6)
}

const prompt = readFileSync(0, 'utf8')
if (!prompt.includes('<forge_routed_context>') || !prompt.includes('source_text') || !prompt.includes('...requestOptions, ...storedDefaults')) {
  process.stderr.write('verified routed source was not embedded in the tool-free prompt\n')
  process.exit(7)
}

const packet = JSON.parse(readFileSync(join(process.cwd(), 'control', 'PACKET.json'), 'utf8'))
const result = {
  schema: 2,
  run_id: packet.run_id,
  dispatch_id: packet.dispatch_id,
  specialist: packet.specialist,
  status: 'complete',
  outcome: 'The isolated routed source identifies the precedence defect.',
  summary: 'Only the embedded routed project input and control artifacts were used.',
  evidence: [{ id: 'observed:config-source', class: 'OBSERVED', claim: 'project/src/config.mjs spreads stored defaults after request options.' }],
  assumptions: [],
  unknowns: [],
  confidence: { level: 'high', basis: 'The routed source directly exposes the merge order.' },
  diagnosis: null,
  artifact_changes: [],
  findings: [],
  needs_specialist: [],
}
process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'fake-thread' })}\n`)
process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text: JSON.stringify(result) } })}\n`)
process.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 321, cached_input_tokens: 21, output_tokens: 87, reasoning_output_tokens: 13 } })}\n`)
