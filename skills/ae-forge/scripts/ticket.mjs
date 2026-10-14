import { relative, dirname } from 'node:path'

const clean = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
const cell = (value) => clean(value).replaceAll('|', '\\|')
const labels = { understand: 'Discovery', plan: 'Planning', approval: 'Approach review', build: 'Implementation', repair: 'Repair', verify: 'Verification', blocked: 'Blocked', done: 'Complete', cancelled: 'Cancelled' }

export function heading(text, name) {
  const lines = String(text ?? '').split(/\r?\n/)
  const index = lines.findIndex(line => /^#{1,4} /.test(line) && line.replace(/^#+\s+/, '').trim().toLowerCase() === name.toLowerCase())
  if (index < 0) return ''
  const level = lines[index].match(/^#+/)[0].length
  const end = lines.findIndex((line, i) => i > index && /^#{1,4} /.test(line) && line.match(/^#+/)[0].length <= level)
  return lines.slice(index + 1, end < 0 ? undefined : end).join('\n').trim()
}

export function nextAction(run) {
  if (run.status === 'done') return 'Review the verified outcome and remaining limitations below.'
  if (run.status !== 'active') return run.summary ?? 'No active work.'
  if (run.phase === 'approval') return 'User: approve the current approach, ask questions, or request a revision. Application edits wait.'
  return run.ticket?.next_action ?? ({ understand: 'Forge: resolve material questions and record the discovery evidence.', plan: 'Forge: finalize the approach, alternatives and small verifiable slices.', build: 'Builder: implement and check the next ready slice.', repair: 'Builder: resolve the current finding within the approved scope, then recheck.', verify: 'Verifier: check the current candidate and its evidence.', blocked: 'Forge: resolve the named blocker before dependent work.' }[run.phase] ?? 'Forge: reconcile the latest result and assign the next step.')
}

export function findingState(run) {
  const unresolved = new Map()
  const acceptedResiduals = []
  for (const item of run.contributions ?? []) {
    if (item.phase !== 'verify' || ['audit', 'plan', 'diagnose', 'review'].includes(run.kind)) continue
    if (['critical', 'high'].includes(item.severity)) unresolved.set(item.role, item)
    else if (item.residual && item.severity) {
      unresolved.delete(item.role)
      acceptedResiduals.push({ role: item.role, severity: item.severity, why: item.residual })
    } else if (item.severity) unresolved.delete(item.role)
  }
  return { unresolved, acceptedResiduals }
}

export function renderTicket(run, { path, brief = '', plan = '', decision = '', evidenceChanged = false } = {}) {
  const link = (target) => relative(dirname(path), target).replaceAll('\\', '/')
  const state = run.status === 'done' ? 'Done' : run.status === 'cancelled' ? 'Cancelled'
    : run.phase === 'approval' || (run.phase === 'blocked' && run.ticket?.waiting_for === 'user') ? 'Waiting for you'
      : run.phase === 'blocked' ? 'Blocked' : run.phase === 'verify' ? 'In review' : 'In progress'
  const owner = run.status !== 'active' ? 'None' : ['approval', 'blocked'].includes(run.phase) ? 'Forge' : run.active_role?.role ?? 'Forge'
  const tasks = run.ticket?.tasks ?? []
  const latest = new Map()
  for (const item of run.contributions ?? []) latest.set(item.role, item)
  const progress = run.status === 'done' ? 'Requested outcome verified.'
    : clean(run.ticket?.progress) || (tasks.length ? `${tasks.filter(task => task.status === 'done').length} of ${tasks.length} checklist items complete.` : 'Detailed work checklist not recorded yet.')
  const out = [`# ${clean(run.title)}`, '', `**Status:** ${state} · **Stage:** ${labels[run.phase] ?? run.phase}`, `**Current owner (recorded):** ${owner} · **Accountable:** Forge`, `**Last update:** ${run.updated_at ?? 'unrecorded'}`, '', `**Now:** ${clean(run.active_role?.summary ?? run.summary)}`, '',
    `**Progress:** ${progress}`, '', `**Next action:** ${clean(nextAction(run))}`, '']
  const blockers = [...(run.ticket?.blockers ?? [])]
  if (evidenceChanged) blockers.push('Recorded evidence changed on disk. Reopen and reconcile it before relying on this ticket.')
  for (const item of findingState(run).unresolved.values()) blockers.push(`${item.role}: ${item.summary} (${item.severity}); see its result for every finding.`)
  out.push('## Blockers and decisions needed', '', ...(blockers.length ? blockers.map(item => `- ${clean(item)}`) : ['None recorded.']), '')
  const limits = []
  if (run.routing?.risk_assessed === false) limits.push('Risk was NOT ASSESSED; coverage may be incomplete.')
  if (run.context?.analysis && run.context.analysis !== 'current') limits.push(`Project analysis ${run.context.analysis}; automatic domain detection is unverified${run.context.reason ? ': ' + clean(run.context.reason) : '.'}`)
  if (!run.lenses) limits.push('Domain lens selection has not been recorded.')
  else {
    if (run.lenses.assessed === false) limits.push('Domain input was not assessed; domain depth is unverified.')
    if (run.lenses.schema_mismatch) limits.push('Analysis schema does not match the lens selector; domain depth is unverified.')
    if (run.lenses.unavailable?.length) limits.push('Lens unavailable: ' + run.lenses.unavailable.map(clean).join(', '))
    if (run.lenses.stale?.length) limits.push('Lens stale; verify current facts before relying on it: ' + run.lenses.stale.map(clean).join(', '))
  }
  if (limits.length) out.push('## Evidence limitations', '', ...limits.map(item => '- ' + item), '')
  if (run.autonomy_basis) out.push(`**Execution authorization:** ${clean(run.autonomy_basis)}`, '')
  const approach = heading(plan, 'Chosen approach') || heading(plan, 'Recommended approach')
  const alternatives = heading(plan, 'Alternatives considered') || heading(plan, 'Decisions')
  if (approach || alternatives || decision || run.approval) {
    out.push('## Approach', '', ...(approach ? [approach, ''] : []), ...(alternatives ? ['### Alternatives and tradeoffs', '', alternatives, ''] : []), ...(decision ? ['### Current decisions', '', decision, ''] : []))
    if (!approach && plan) out.push('Concise approach summary not recorded; inspect the accepted plan linked below.', '')
    if (run.approval) out.push(`**User decision:** ${clean(run.approval.by)} — ${clean(run.approval.basis)}`, '')
  }
  out.push('## Work checklist', '')
  if (tasks.length) {
    for (const task of tasks) out.push(`- [${task.status === 'done' ? 'x' : ' '}] ${clean(task.title)} — ${task.status}${task.owner ? ` · ${clean(task.owner)}` : ''}`)
  } else out.push('Forge records small, verifiable tasks during planning or audit scoping.')
  out.push('')
  const acceptance = heading(brief, 'Acceptance criteria')
  if (acceptance && !/^(TODO|none)$/i.test(acceptance)) out.push('## Done when', '', acceptance, '')
  if (run.status === 'done') out.push('## Outcome and verification', '', run.summary, '', `**Verdict:** ${run.result}`, `**Verification:** ${run.verification}`, `**Review context:** ${run.review_context ?? 'unrecorded'}`, '', ...(run.accepted_gaps ?? []).map(gap => `- Limitation: ${cell(gap.why)}`), ...(run.accepted_residuals ?? []).map(item => `- Residual risk: ${cell(item.why)}`), '')
  out.push('## Latest activity', '')
  for (const item of (run.contributions ?? []).slice(-5).reverse()) out.push(`- ${item.at} · **${item.role}**: ${clean(item.summary)} ([evidence](${link(item.absolute_result)}))`)
  if (!(run.contributions ?? []).length) out.push('No contribution recorded yet.')
  if (latest.size) {
    out.push('', '## Supporting evidence', '', '| Contribution | Current result |', '|---|---|')
    for (const [role, item] of latest) out.push(`| ${cell(role)} | [${cell(item.summary)}](${link(item.absolute_result)}) |`)
  }
  out.push('', `_Local ${run.kind} ticket · ${run.id} · contract v${run.contract} · risk: ${run.routing?.risk_assessed === false ? 'NOT ASSESSED' : run.risks?.join(', ') || 'none declared'}. This is recorded state, not a live worker heartbeat. Detailed history remains in the recovery record._`, '')
  return out.join('\n')
}
