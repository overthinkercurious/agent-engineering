// Validate contribution records and local references, not evidence truth.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const resultSections = ['STATUS', 'OUTCOME', 'EVIDENCE', 'FINDINGS', 'UNKNOWNS', 'HANDOFF']
export const content = value => String(value ?? '').replace(/<!--[\s\S]*?-->/g, '').trim()
export const unfinished = value => !content(value) || /^(?:TODO|TBD|_pending\b.*|<[^>]+>)\s*$/mi.test(content(value))

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

// Only explicit file citations are interpreted as paths. Prose and commands
// are not guessed; external sources and honest UNAVAILABLE entries stay text.
export function localReferences(text) {
  const refs = [...String(text ?? '').matchAll(/`([^`\n]+)`|\]\(<?([^)>]+)>?\)/g)]
    .map(match => match[1] ?? match[2])
    .filter(value => !/^(?:https?:|UNAVAILABLE:|N\/A:)/i.test(value)
      && (!/\s/.test(value) || /\.[a-z0-9]+(?:#.*|:\d+(?:-\d+)?)?$/i.test(value))
      && (/^(?:file:\/\/|[A-Za-z]:[\\/]|\.?\.?[\\/])/.test(value) || /^[\w@.-]+[\\/]/.test(value)
        || /^[\w .-]+\.[a-z0-9]+(?:#.*|:\d+(?:-\d+)?)?$/i.test(value)))
  return [...new Set(refs)]
}

export function referencePath(root, reference) {
  const file = reference.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '')
  return /^file:\/\//i.test(file) ? fileURLToPath(file) : resolve(root, file)
}

const cited = value => localReferences(value).length > 0 || /https?:\/\/\S+/i.test(value)
  || /^UNAVAILABLE:\s*\S/i.test(value)

function referenceErrors(root, text) {
  const errors = []
  for (const reference of localReferences(text)) {
    try {
      const path = referencePath(root, reference)
      const rel = relative(realpathSync(root), existsSync(path) ? realpathSync(path) : path)
      if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) errors.push(`evidence reference escapes project: ${reference}`)
      else if (!existsSync(path)) errors.push(`evidence reference is missing: ${reference}`)
    } catch { errors.push(`evidence reference cannot be resolved: ${reference}`) }
  }
  return errors
}

export function validateResult(role, text, severity, options = {}) {
  const errors = []
  const strict = options.contract >= 13
  const sections = Object.fromEntries(resultSections
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
  if (['plan-reviewer', 'plan-challenger'].includes(role)) {
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
  } else if (role === 'verifier') {
    if (!['PASS', 'PASS WITH RESIDUAL RISK', 'FAIL'].includes(verdict)) errors.push('invalid verification verdict')
    if (!bodyAt(sections.OUTCOME ?? '', 'Gates re-run by me in this pass', 3)) errors.push('verification gate evidence is required')
    if (!bodyAt(sections.OUTCOME ?? '', 'Acceptance → evidence', 3)
      && !bodyAt(sections.OUTCOME ?? '', 'Finding → reverified evidence', 3)) errors.push('acceptance or assessment evidence is required')
  }
  if (strict) {
    if (!Object.hasOwn(rank, severity)) errors.push('record an explicit note severity, including none')
    const ids = findings.map(row => row[0])
    if (new Set(ids).size !== ids.length) errors.push('finding IDs must be unique within a contribution')
    for (const [name, body] of Object.entries(sections)) if (unfinished(body)) errors.push(`${name} contains a placeholder`)
    for (const name of resultSections) if (text.split(/\r?\n/).filter(line => line === `## ${name}`).length !== 1) errors.push(`${name} must occur exactly once`)
    if (/^none$/i.test(sections.OUTCOME ?? '')) errors.push('OUTCOME must supply the assigned deliverable')
    if (evidence.some(row => !cited(row[1] ?? ''))) errors.push('EVIDENCE locations require explicit file citations, source URLs or UNAVAILABLE with a reason')
    if (options.root) errors.push(...referenceErrors(options.root, sections.EVIDENCE))
    if (role === 'verifier') {
      const outcome = sections.OUTCOME ?? ''
      const readonly = ['audit', 'plan', 'diagnose', 'review'].includes(options.kind)
      const mapping = bodyAt(outcome, options.kind === 'audit' ? 'Finding → reverified evidence' : 'Acceptance → evidence', 3)
      const mappings = tableRows(mapping)
      if (!mappings.length || mappings.some(row => row.length !== 3 || row.some(value => !value) || !cited(row[1] ?? ''))) errors.push('verification requires a populated kind-specific evidence table with inspected citations')
      const log = bodyAt(outcome, 'Claim re-verification', 3)
      const claims = tableRows(log)
      if (!claims.length || claims.some(row => row.length !== 3 || row.some(value => !value) || !cited(row[1] ?? '')
        || !/^(confirmed|corrected|unverified)\b/i.test(row[2]))) errors.push('Claim re-verification requires claim, reopened evidence and confirmed/corrected/unverified result')
      if (claims.some(row => /^UNAVAILABLE:/i.test(row[1] ?? '') && !/^unverified\b/i.test(row[2] ?? ''))) errors.push('unavailable claim evidence must be marked unverified')
      for (const item of options.upstream ?? []) {
        for (const finding of tableRows(bodyAt(item.text, 'FINDINGS'))) {
          if (/^(critical|high)$/i.test(finding[1]) && !claims.some(row => row[0] === `${item.role}/${finding[0]}`)) {
            errors.push(`material finding requires re-verification: ${item.role}/${finding[0]}`)
          }
        }
      }
      const scope = bodyAt(outcome, 'Scope conformance', 3)
      if (unfinished(scope)) errors.push('Scope conformance must account for inspected areas and exclusions')
      if (options.kind === 'audit') {
        const coverage = tableRows(scope)
        if (!coverage.length || coverage.some(row => row.length !== 3 || row.some(value => !value)
          || !/^(inspected|source-only|inaccessible|excluded)$/i.test(row[1]))) errors.push('audit scope requires area/state, coverage status and evidence/reason')
        if (coverage.some(row => /^(inspected|source-only)$/i.test(row[1]) && !cited(row[2] ?? ''))) errors.push('inspected audit coverage requires a source or artifact citation')
        if (verdict === 'PASS' && coverage.some(row => /^inaccessible$/i.test(row[1]))) errors.push('inaccessible audit coverage prevents unqualified PASS')
      }
      const gates = bodyAt(outcome, 'Gates re-run by me in this pass', 3)
      const gateRows = tableRows(gates)
      if ((!gateRows.length && !/^N\/A:\s*\S/i.test(gates ?? '')) || gateRows.some(row => row.length !== 4 || row.some(value => !value)
        || !/^(?:-?\d+|UNVERIFIED)$/i.test(row[2]) || !/^(pass|fail|unverified)$/i.test(row[3])
        || (/^pass$/i.test(row[3]) && row[2] !== '0'))) errors.push('gate evidence requires consistent command, source, exit and pass/fail/unverified status, or N/A with a reason')
      if (passing && gateRows.some(row => /^fail$/i.test(row[3]) || (/^-?\d+$/.test(row[2]) && Number(row[2]) !== 0))) errors.push('failed required gates prevent a passing verdict')
      const residual = bodyAt(outcome, 'Residual risk', 3)
      if (unfinished(residual) || (verdict === 'PASS WITH RESIDUAL RISK' && /^none$/i.test(residual ?? ''))) errors.push('Residual risk must describe qualified verdict limitations, or none for PASS')
      if (verdict === 'PASS' && (claims.some(row => /^unverified\b/i.test(row[2]))
        || mappings.some(row => /^UNAVAILABLE:/i.test(row[1] ?? ''))
        || gateRows.some(row => /UNVERIFIED/i.test(row.join(' '))) || !/^none$/i.test(residual ?? ''))) errors.push('unverified checks or residual limits prevent unqualified PASS')
      if (!readonly && passing && blockingFinding) errors.push('critical/high candidate findings prevent a passing delivery verdict')
      if (options.rendered) {
        const visual = bodyAt(outcome, 'Visual evidence', 3)
        const rows = tableRows(visual)
        if (!rows.length && !/^UNAVAILABLE:\s*\S/i.test(visual ?? '')) errors.push('rendered evidence requires screen/state, device/app/build, artifact and observation method')
        if (rows.some(row => row.length !== 4 || row.some(value => !value))) errors.push('each visual evidence row needs four populated columns')
        if (rows.some(row => !cited(row[2] ?? ''))) errors.push('visual evidence requires explicit artifact citations or UNAVAILABLE with a reason')
        if (verdict === 'PASS' && (!rows.length || rows.some(row => /\b(?:unknown|unavailable|unverified)\b/i.test(row[1] ?? '')
          || /^UNAVAILABLE:/i.test(row[2] ?? '')))) errors.push('unidentified build or unavailable visual evidence prevents unqualified PASS')
        if (options.root) errors.push(...referenceErrors(options.root, visual))
      }
      if (options.root) errors.push(...referenceErrors(options.root, [mapping, log, scope].join('\n')))
    }
  }
  return { ok: errors.length === 0, verdict, blockingUnknown, blockingFinding, findings: findings.length, errors }
}

// Historic review callers retain their recorded validation bar.
export function validateReviewResult(role, text, severity) {
  return validateResult(role, text, severity)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
  try {
    const role = option('--role')
    const roles = Object.keys(JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../references/team.json'), 'utf8')).roles)
    if (!roles.includes(role) || !args.includes('--result')) throw new Error('use --role <selected role> --result <file> --severity <level> [--kind audit] [--root <project>]')
    const result = validateResult(role, readFileSync(option('--result'), 'utf8'), option('--severity'), {
      contract: 13, kind: option('--kind', 'feature'), root: option('--root', process.cwd()), rendered: args.includes('--rendered'),
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2 }
}
