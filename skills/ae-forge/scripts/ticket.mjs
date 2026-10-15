import { relative, dirname } from 'node:path'
import { bodyAt, tableRows, content, unfinished, localReferences, referencePath } from './review-result.mjs'

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

export function renderTicket(run, { root, path, brief = '', plan = '', decision = '', evidenceChanged = false } = {}) {
  const link = (target) => relative(dirname(path), target).replaceAll('\\', '/')
  const strict = run.contract >= 13
  const readonly = ['audit', 'plan', 'diagnose', 'review'].includes(run.kind)
  const rebase = value => {
    let text = String(value ?? '')
    if (root) for (const ref of localReferences(text)) {
      const target = link(referencePath(root, ref))
      text = text.replaceAll('`' + ref + '`', `[${ref}](<${target}>)`).replaceAll(`](${ref})`, `](<${target}>)`)
    }
    return text
  }
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
  const outcome = () => ['## Outcome and verification', '', run.summary, '',
    `**${strict && run.kind === 'audit' ? 'Assessment quality' : 'Verdict'}:** ${run.result}`, `**Verification:** ${run.verification}`,
    `**Review context:** ${run.review_context ?? 'unrecorded'}`, '',
    ...(run.accepted_gaps ?? []).map(gap => `- Limitation: ${cell(gap.why)}`),
    ...(run.accepted_residuals ?? []).map(item => `- Residual risk: ${cell(item.why)}`), '']
  if (strict) {
    if (run.status === 'done') out.push(...outcome())
    const request = content(heading(brief, 'Request'))
    if (!unfinished(request)) out.push('## Requested outcome', '', rebase(request), '')
    const scope = content(heading(brief, 'Scope and non-goals'))
    out.push('## Scope and coverage', '', unfinished(scope) ? 'Scope and exclusions not recorded yet.' : rebase(scope), '')
    const verification = latest.get('verifier')?.result_text ?? ''
    const coverage = bodyAt(bodyAt(verification, 'OUTCOME') ?? '', 'Scope conformance', 3)
    if (coverage) out.push(rebase(coverage), '')
    const records = [...latest.values()].filter(item => readonly || (item.phase === 'verify' && item.revision === run.revision))
    const missing = records.filter(item => {
      const body = bodyAt(item.result_text ?? '', 'FINDINGS')
      const rows = tableRows(body)
      return !body || (!/^none$/i.test(body) && (!rows.length || rows.some(row => row.length !== 7)))
    })
    const findings = records.flatMap(item => tableRows(bodyAt(item.result_text ?? '', 'FINDINGS'))
      .filter(row => row.length === 7).map(row => ({ item, row })))
    const rank = { critical: 4, high: 3, medium: 2, low: 1 }
    findings.sort((a, b) => (rank[b.row[1].toLowerCase()] ?? 0) - (rank[a.row[1].toLowerCase()] ?? 0))
    const shown = findings.filter(({ row }, index) => /^(critical|high)$/i.test(row[1]) || index < 5)
    out.push(run.kind === 'audit' ? '## Application hazards' : '## Current findings', '')
    if (shown.length) {
      out.push('| Finding | Severity | Issue and consequence | Location | Original result |', '|---|---|---|---|---|')
      for (const { item, row } of shown) out.push(`| ${cell(item.role + '/' + row[0])} | ${cell(row[1])} | ${cell(row[3] + ' — ' + row[4])} | ${rebase(cell(row[2]))} | [evidence](<${link(item.absolute_result)}>) |`)
      if (shown.length < findings.length) out.push('', 'Additional findings remain in the linked original results.')
    } else out.push(records.length && !missing.length ? 'No established findings in the current accepted results.' : 'Findings not recorded yet; absence is not a clean assessment.')
    if (missing.length) out.push('', `Finding records unavailable for: ${missing.map(item => clean(item.role)).join(', ')}.`)
    const health = bodyAt(bodyAt(latest.get('auditor')?.result_text ?? '', 'OUTCOME') ?? '', 'Health summary', 3)
    if (run.kind === 'audit' && health) out.push('', '### Assessment summary', '', rebase(health))
    if (run.kind === 'audit') out.push('', 'Application hazards are separate from assessment blockers; assessment PASS does not mean the application is defect-free.')
    const visual = bodyAt(bodyAt(verification, 'OUTCOME') ?? '', 'Visual evidence', 3)
    if (visual) out.push('', '### Rendered evidence', '', rebase(visual))
    out.push('')
  }
  const blockers = [...(run.ticket?.blockers ?? [])]
  if (evidenceChanged) blockers.push('Recorded evidence changed on disk. Reopen and reconcile it before relying on this ticket.')
  for (const item of findingState(run).unresolved.values()) blockers.push(`${item.role}: ${item.summary} (${item.severity}); see its result for every finding.`)
  if (strict) for (const item of latest.values()) {
    for (const row of tableRows(bodyAt(item.result_text ?? '', 'UNKNOWNS'))) if (/^yes$/i.test(row[1])) blockers.push(`${item.role}: ${row[0]} — ${row[2]}`)
  }
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
  if (strict) {
    for (const item of latest.values()) for (const row of tableRows(bodyAt(item.result_text ?? '', 'UNKNOWNS'))) {
      if (/^no$/i.test(row[1])) limits.push(`${item.role}: ${row[0]} — ${row[2]}`)
    }
    const verification = latest.get('verifier')?.result_text ?? ''
    const residual = bodyAt(bodyAt(verification, 'OUTCOME') ?? '', 'Residual risk', 3)
    if (residual && !/^none$/i.test(residual)) limits.push(residual)
    if (unfinished(heading(brief, readonly ? 'Assessment checks' : 'Acceptance criteria'))) limits.push('Observable completion checks not recorded yet.')
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
    for (const task of tasks) out.push(`- [${task.status === 'done' ? 'x' : ' '}] ${clean(task.title)} — ${task.status}${task.owner ? ` · ${clean(task.owner)}` : ''}${task.evidence && latest.size ? ` · [evidence](<${link(run.contributions.find(item => item.result === task.evidence)?.absolute_result ?? task.evidence)}>)` : ''}`)
  } else out.push('Forge records small, verifiable tasks during planning or audit scoping.')
  out.push('')
  const acceptance = content(heading(brief, strict && readonly ? 'Assessment checks' : 'Acceptance criteria'))
  if (!unfinished(acceptance) && !/^none$/i.test(acceptance)) out.push('## Done when', '', acceptance, '')
  if (run.status === 'done' && !strict) out.push(...outcome())
  if (strict) {
    const evidence = [...latest.values()].flatMap(item => tableRows(bodyAt(item.result_text ?? '', 'EVIDENCE')).map(row => ({ item, row }))).slice(0, 8)
    if (evidence.length) {
      out.push('## Selected evidence', '', '| Contribution | Checked | Source or artifact | Method |', '|---|---|---|---|')
      for (const { item, row } of evidence) out.push(`| ${cell(item.role)} | ${cell(row[0])} | ${rebase(cell(row[1]))} | ${cell(row[2])} |`)
      out.push('', 'The original accepted results retain the complete evidence set.', '')
    }
  }
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
