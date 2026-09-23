#!/usr/bin/env node
// guard.mjs - the enforcement tier.
//
// Every gate in forge.mjs is real, and every one of them only fires if the
// model chooses to call forge.mjs. That is an authority inversion: the
// instruction plane, which is prose, decides whether the control plane, which
// is code, runs at all. This file is the one place the kit can refuse
// something without being asked nicely.
//
// It is deliberately small. Two conditions, both already recorded in the run
// ledger, both already claimed in writing by this kit:
//
//   1. "Two keys, because a gate enforced at one point is a gate one mistake
//      opens."  phase --to build refuses without approval; nothing stopped an
//      edit that never went through phase at all.
//   2. "Verifier judges the integrated result and never repairs what it
//      reviews."  allowedPhases says so; nothing enforced it on the file
//      system.
//
// WHAT THIS IS NOT. Hooks run in the host that loaded them, from a file the
// model can edit, and a subagent's tool calls may not reach the parent
// session's hooks at all. This is defence in depth, not a sandbox, and the
// kit must never report it as one.
//
// FAIL OPEN, ALWAYS. A guard that blocks work because it could not parse its
// own input is worse than no guard: it teaches people to remove it. Every
// error path here exits 0.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const ALLOW = 0
const DENY = 2
const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/

function readStdin() {
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

function activeRun(root) {
  const base = join(root, '.dev', 'work')
  if (!existsSync(base)) return null
  let best = null
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(base, entry.name, 'run.json')
    if (!existsSync(path)) continue
    try {
      const run = JSON.parse(readFileSync(path, 'utf8'))
      if (run.status !== 'active') continue
      if (!best || String(run.updated_at) > String(best.updated_at)) best = run
    } catch { /* a corrupt record is not a reason to block an edit */ }
  }
  return best
}

// The kit's own bookkeeping is never the thing being gated. A Verifier writes
// its result file during verify, and Forge writes the artifact throughout;
// blocking those would stop the very records the gates read.
function isBookkeeping(root, filePath) {
  if (!filePath) return false
  const rel = resolve(String(filePath)).slice(resolve(root).length)
  return rel.startsWith(`${sep}.dev${sep}`) || rel.startsWith('/.dev/')
}

function sessionStart(input) {
  // The marker is evidence, not a claim: it exists only because this hook
  // actually ran in this session, which is the same reason the routing block
  // copies its contract number out of team.json rather than typing it.
  try {
    const root = input.cwd || process.cwd()
    const dir = join(root, '.dev', 'context')
    if (!existsSync(dir)) return ALLOW // an unsurveyed project keeps no context
    writeFileSync(join(dir, 'enforce.json'), `${JSON.stringify({
      enforce: 'native',
      by: 'agent-engineering guard.mjs',
      enforces: ['approval-before-edit', 'verifier-does-not-repair'],
      limits: [
        'hooks load in this host only; every other host is enforce: none',
        'a subagent\'s tool calls may not reach this hook',
        'the hook file is editable by the model it constrains',
      ],
      at: new Date().toISOString(),
    }, null, 2)}\n`)
  } catch { /* fail open */ }
  return ALLOW
}

function preToolUse(input) {
  const tool = input.tool_name || ''
  if (!EDIT_TOOLS.test(tool)) return ALLOW
  const root = input.cwd || process.cwd()
  if (isBookkeeping(root, input.tool_input?.file_path ?? input.tool_input?.notebook_path)) return ALLOW

  const run = activeRun(root)
  if (!run) return ALLOW // no run, no claim to enforce

  if (run.approval_required && !run.approval) {
    process.stderr.write(
      `Agent Engineering: run ${run.id} (${run.tier}) requires approval before any file is edited.\n` +
      'The brief is the thing to approve, not this message. Show it, then record the\n' +
      `user's decision:  forge.mjs approve --id ${run.id} --by "<person>"\n` +
      'A reviewer verdict is not user approval.\n')
    return DENY
  }
  if (run.phase === 'verify') {
    process.stderr.write(
      `Agent Engineering: run ${run.id} is in the verify phase; the reviewer does not repair\n` +
      'what it reviews. To apply a fix, move the run into repair first:\n' +
      `  forge.mjs phase --id ${run.id} --to repair --summary "<what is being repaired>"\n`)
    return DENY
  }
  return ALLOW
}

function main() {
  const mode = process.argv[2]
  let input = {}
  try { input = JSON.parse(readStdin() || '{}') } catch { return ALLOW }
  if (mode === 'session-start') return sessionStart(input)
  if (mode === 'pre-tool-use') return preToolUse(input)
  return ALLOW
}

let code = ALLOW
try { code = main() } catch { code = ALLOW }
process.exit(code)
