// Validate review records, not the truth of the evidence they contain.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function bodyAt(text, heading, level = 2) {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((line) => line === `${'#'.repeat(level)} ${heading}`)
  if (at < 0) return null
  const end = lines.findIndex((line, index) => index > at && new RegExp(`^#{1,${level}} `).test(line))
  return lines.slice(at + 1, end < 0 ? undefined : end).join('\n').trim()
}

export function tableRows(body) {
  return (body ?? '').split(/\r?\n/).filter((line) => /^\s*\|/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim()))
    .filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)))
    .slice(1)
}

export function validateReviewResult(role, text, severity) {
  const errors = []
  const sections = Object.fromEntries(['STATUS', 'OUTCOME', 'EVIDENCE', 'FINDINGS', 'UNKNOWNS', 'HANDOFF']
    .map((key) => [key, bodyAt(text, key)]))
  for (const [name, body] of Object.entries(sections)) {
    if (!body || /\bTODO\b|^_pending\b|^<[^>]+>$/m.test(body)) errors.push(`${name} must be filled`)
  }
  const status = sections.STATUS
  if (!['COMPLETE', 'NEEDS INPUT', 'BLOCKED', 'INCONCLUSIVE'].includes(status)) errors.push('invalid STATUS')
  const verdict = bodyAt(sections.OUTCOME ?? '', 'Verdict', 3)?.split(/\r?\n/)[0].trim() ?? null
  const passing = ['APPROVED', 'APPROVED WITH NOTES', 'PASS', 'PASS WITH RESIDUAL RISK'].includes(verdict)
  if (passing && status !== 'COMPLETE') errors.push('approval or pass requires COMPLETE status')
  if (/^none$/i.test(sections.HANDOFF ?? '')) errors.push('review requires an explicit handoff')
  const evidence = tableRows(sections.EVIDENCE)
  if (!evidence.length || evidence.some((row) => row.length !== 3 || row.some((cell) => !cell || /^none$/i.test(cell)))) {
    errors.push('EVIDENCE requires checked evidence in three columns')
  }
  const findings = tableRows(sections.FINDINGS)
  if (sections.FINDINGS && !/^none$/i.test(sections.FINDINGS) && !findings.length) errors.push('FINDINGS must be a table or none')
  for (const row of findings) {
    if (row.length !== 7 || row.some((cell) => !cell) || !['critical', 'high', 'medium', 'low'].includes(row[1]?.toLowerCase())) {
      errors.push('each finding requires seven columns and a valid severity; use unknown for unresolved repair or proof')
    }
    if (row.slice(2, 5).some((cell) => /^(unknown|none)$/i.test(cell))) errors.push('finding location, issue, and consequence must be established')
  }
  const unknowns = tableRows(sections.UNKNOWNS)
  if (sections.UNKNOWNS && !/^none$/i.test(sections.UNKNOWNS) && !unknowns.length) errors.push('UNKNOWNS must be a table or none')
  if (unknowns.some((row) => row.length !== 3 || row.some((cell) => !cell) || !/^(yes|no)$/i.test(row[1] ?? ''))) {
    errors.push('each unknown requires Unknown, Blocks? yes/no, and What would resolve it')
  }
  const blockingUnknown = unknowns.some((row) => /^yes$/i.test(row[1] ?? ''))
  const blockingFinding = findings.some((row) => /^(critical|high)$/i.test(row[1] ?? ''))
  const rank = { none: 0, low: 1, medium: 2, high: 3, critical: 4 }
  if (findings.some((row) => (rank[row[1]?.toLowerCase()] ?? 0) > (rank[severity] ?? -1))) {
    errors.push('note severity must cover the highest established finding')
  }
  if (passing && blockingUnknown) errors.push('blocking unknowns prevent approval or pass')
  if (role !== 'verifier') {
    if (!['APPROVED', 'APPROVED WITH NOTES', 'REVISE'].includes(verdict)) errors.push('invalid plan review verdict')
    if (passing && blockingFinding) errors.push('blocking findings prevent approval')
    if (verdict === 'REVISE' && !blockingFinding && !blockingUnknown) errors.push('REVISE requires an established blocker or blocking unknown')
    if ((blockingFinding || blockingUnknown) && !['critical', 'high'].includes(severity)) errors.push('blocking review requires critical or high note severity')
    if (role === 'plan-reviewer') {
      const criteria = tableRows(bodyAt(sections.OUTCOME ?? '', 'Criteria', 3))
      for (let number = 1; number <= 6; number++) {
        const matches = criteria.filter((row) => row[0] === String(number))
        if (matches.length !== 1 || matches[0].length !== 3 || !/^(PASS|FAIL|N\/A\s*[:(])/i.test(matches[0][2] ?? '')) {
          errors.push(`criterion ${number} requires PASS, FAIL, or N/A with a reason`)
        }
      }
      if (passing && criteria.some((row) => /^FAIL\b/i.test(row[2] ?? ''))) errors.push('failed criteria prevent approval')
      const log = bodyAt(sections.OUTCOME ?? '', 'Re-verification log', 3)
      if (!tableRows(log).length && !/^N\/A\s*[:(].+/i.test(log ?? '')) errors.push('Re-verification log requires checked citations or N/A with a reason')
    } else {
      const log = bodyAt(sections.OUTCOME ?? '', 'Decision challenge log', 3)
      if (!tableRows(log).length && !/^N\/A\s*[:(].+/i.test(log ?? '')) errors.push('Decision challenge log requires tested decisions or N/A with a reason')
    }
  } else {
    if (!['PASS', 'PASS WITH RESIDUAL RISK', 'FAIL'].includes(verdict)) errors.push('invalid verification verdict')
    if (!bodyAt(sections.OUTCOME ?? '', 'Gates re-run by me in this pass', 3)) errors.push('verification gate evidence is required')
    if (!bodyAt(sections.OUTCOME ?? '', 'Acceptance → evidence', 3)
      && !bodyAt(sections.OUTCOME ?? '', 'Finding → reverified evidence', 3)) errors.push('acceptance or assessment evidence is required')
  }
  return { ok: errors.length === 0, verdict, blockingUnknown, blockingFinding, findings: findings.length, errors }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const option = (name) => args[args.indexOf(name) + 1]
  try {
    const role = option('--role')
    if (!['plan-reviewer', 'plan-challenger', 'verifier'].includes(role) || !args.includes('--result')) throw new Error('use --role plan-reviewer|plan-challenger|verifier --result <file> --severity <level>')
    const result = validateReviewResult(role, readFileSync(option('--result'), 'utf8'), option('--severity'))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2 }
}
