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
// Malformed or unsupported host events fail open and cannot establish a
// native-enforcement claim. A recognized edit with unreadable run state,
// ambiguous ownership, or unverifiable authorization is refused.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ensureArtifactIgnore } from './artifact-ignore.mjs'

const ALLOW = 0
const DENY = 2
const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|write_to_file|replace_file_content|multi_replace_file_content)$/

function readStdin() {
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

function activeRun(root, session) {
  const base = join(root, '.dev', 'work')
  if (!existsSync(base)) return null
  const runs = []
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(base, entry.name, 'run.json')
    if (!existsSync(path)) continue
    try {
      const run = JSON.parse(readFileSync(path, 'utf8'))
      if (run.status !== 'active') continue
      runs.push(run)
    } catch { return { error: 'run record is unreadable; recover it before editing source' } }
  }
  if (!runs.length) return null
  const matching = session ? runs.filter((run) => run.session_ids?.includes(session)) : []
  if (matching.length === 1) return matching[0]
  if (matching.length > 1 || runs.length > 1) return { error: 'multiple active runs; use Forge focus to bind this session to exactly one run, or use separate checkouts' }
  if (session && runs[0].session_ids?.length && !matching.length) return { error: 'active run belongs to another session; resume it explicitly with Forge focus' }
  return runs[0]
}

// The kit's own bookkeeping is never the thing being gated. A Verifier writes
// its result file during verify, and Forge writes the artifact throughout;
// blocking those would stop the very records the gates read.
function isBookkeeping(root, filePath) {
  if (!filePath) return false
  const rel = relative(resolve(root), resolve(root, String(filePath)))
  return rel.startsWith(`.dev${sep}work${sep}`) || rel.startsWith(`.dev${sep}runs${sep}`)
    || rel.startsWith(`.dev${sep}completed${sep}`) || rel.startsWith(`.dev${sep}context${sep}`)
}

function sessionStart(input) {
  // A marker can survive a session. Bind it to the host's session ID so a
  // later session cannot inherit a false native-enforcement claim.
  try {
    const root = input.cwd || process.cwd()
    if (!existsSync(join(root, '.dev'))) return ALLOW
    ensureArtifactIgnore(root)
    const dir = join(root, '.dev', 'context')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'enforce.json'), `${JSON.stringify({
      enforce: 'native',
      session_id: input.session_id ?? null,
      by: 'agent-engineering guard.mjs',
      host: input.host ?? 'plugin',
      enforces: ['reviewed-plan-before-edit', 'implementation-phase-only', 'approval-before-edit', 'read-only-assessments', 'verifier-does-not-repair', 'session-run-routing'],
      limits: [
        'hooks load in this host only; every other host is enforce: none',
        'a subagent\'s tool calls may not reach this hook',
        'only the configured edit tools are intercepted; shell writes may bypass it',
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
  const patch = String(input.tool_input?.command ?? input.tool_input?.patch ?? '')
  const patchPaths = tool === 'apply_patch'
    ? [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File:|Move to:) (.+)$/gm)].map((m) => m[1].trim())
    : []
  const directPath = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? input.tool_input?.TargetFile
  if (tool === 'apply_patch' ? (patchPaths.length > 0 && patchPaths.every((p) => isBookkeeping(root, p)))
    : isBookkeeping(root, directPath)) return ALLOW

  const run = activeRun(root, input.session_id ?? process.env.CODEX_SESSION_ID ?? process.env.CLAUDE_CODE_SESSION_ID)
  if (!run) return ALLOW // no run, no claim to enforce
  if (run.error) { process.stderr.write(`Agent Engineering: ${run.error}.\n`); return DENY }

  if (run.read_only || ['audit', 'plan', 'diagnose', 'review'].includes(run.kind)) {
    process.stderr.write(`Agent Engineering: run ${run.id} is read-only; start a delivery run before editing project files.\n`)
    return DENY
  }

  if (run.approval_required && !run.approval) {
    process.stderr.write(
      `Agent Engineering: run ${run.id} requires approval before any file is edited.\n` +
      'The brief is the thing to approve, not this message. Show it, then record the\n' +
      `user's decision:  forge.mjs approve --id ${run.id} --by "<person>" --basis "<decision>"\n` +
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
  const checked = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'forge.mjs'),
    'edit-check', '--root', root, '--id', run.id], { cwd: root, encoding: 'utf8' })
  if (checked.error || checked.status !== 0) {
    let reason = 'implementation authorization could not be verified'
    try { reason = JSON.parse(checked.stdout).error ?? reason } catch { /* refuse unverifiable edits */ }
    process.stderr.write(`Agent Engineering: ${reason}. Return to Forge before editing source.\n`)
    return DENY
  }
  return ALLOW
}

function main() {
  const mode = process.argv[2]
  let input = {}
  try { input = JSON.parse(readStdin() || '{}') } catch { return ALLOW }
  if (mode === 'antigravity-pre-invocation') {
    if (!input.conversationId || !Array.isArray(input.workspacePaths)) {
      process.stdout.write('{}\n'); return ALLOW
    }
    for (const cwd of input.workspacePaths) sessionStart({ cwd, session_id: input.conversationId, host: 'antigravity' })
    process.stdout.write(`${JSON.stringify({ injectSteps: [{ ephemeralMessage:
      `Agent Engineering hook observed this conversation: ${input.conversationId}. For Forge start/focus and contract checks, pass --session ${input.conversationId} to bind the run and report current enforcement. Only Build/Repair may edit source after current plan review; shell writes remain outside this hook.` }] })}\n`)
    return ALLOW
  }
  if (mode === 'antigravity-pre-tool-use') {
    const args = input.toolCall?.args ?? {}
    const target = args.TargetFile
    const roots = (input.workspacePaths ?? []).filter((root) => typeof root === 'string')
    const matches = target ? roots.filter((root) => {
      const rel = relative(resolve(root), resolve(target))
      return rel === '' || (!rel.startsWith('..') && !resolve(target).startsWith('..') && !/^[A-Za-z]:/.test(rel))
    }).sort((a, b) => b.length - a.length) : roots
    const root = matches[0]
    const code = root ? preToolUse({ cwd: root, session_id: input.conversationId,
      tool_name: input.toolCall?.name, tool_input: args }) : (EDIT_TOOLS.test(input.toolCall?.name ?? '') ? DENY : ALLOW)
    process.stdout.write(`${JSON.stringify({ decision: code === DENY ? 'deny' : 'allow',
      ...(code === DENY ? { reason: 'Agent Engineering could not authorize this source edit. Bind the correct run and obtain current plan review in Build/Repair; inspect hook diagnostics for the specific gate.' } : {}) })}\n`)
    return ALLOW // Antigravity uses the JSON decision, not Claude's exit-2 protocol.
  }
  if (mode === 'session-start') return sessionStart(input)
  if (mode === 'pre-tool-use') return preToolUse(input)
  return ALLOW
}

let code = ALLOW
try { code = main() } catch { code = ALLOW }
process.exit(code)
