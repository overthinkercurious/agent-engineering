#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertValid, canonicalJson, ContractValidationError, formatIssues } from './validate.mjs'

const SELF = dirname(fileURLToPath(import.meta.url))
const POLICY_FILES = Object.freeze({
  'authority.yml': { key: 'authority', schema: 'authority-policy' },
  'routing.yml': { key: 'routing', schema: 'routing-policy' },
  'quality-gates.yml': { key: 'quality', schema: 'quality-policy' },
  'release.yml': { key: 'release', schema: 'release-policy' },
})
const MATERIAL_PATHS = [
  'authority.judgment.additional_authority',
  'routing.judgment.always_route',
  'routing.judgment.specialist_escalations',
  'quality.judgment.required_user_journeys',
  'quality.judgment.non_functional_budgets',
  'release.judgment.preview_command',
  'release.judgment.rollback_or_recovery',
]

export class PolicySyntaxError extends Error {
  constructor(source, line, column, message) {
    super(`${source}:${line}:${column}: ${message}`)
    this.name = 'PolicySyntaxError'
    this.source = source
    this.line = line
    this.column = column
  }
}

function stripComment(raw) {
  let single = false
  let double = false
  let escaped = false
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index]
    if (double) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') double = false
      continue
    }
    if (single) {
      if (char === "'" && raw[index + 1] === "'") index++
      else if (char === "'") single = false
      continue
    }
    if (char === '"') double = true
    else if (char === "'") single = true
    else if (char === '#' && (index === 0 || /\s/.test(raw[index - 1]))) return raw.slice(0, index)
  }
  return raw
}

function scalar(text, source, line, column) {
  if (text === '[]') return []
  if (text === '{}') return {}
  if ((text.startsWith('[') && text !== '[]') || (text.startsWith('{') && text !== '{}')) {
    throw new PolicySyntaxError(source, line, column, 'non-empty flow collections are unsupported')
  }
  if (text.startsWith('"')) {
    try {
      const value = JSON.parse(text)
      if (typeof value !== 'string') throw new Error('quoted scalar must be a string')
      return value
    } catch (error) { throw new PolicySyntaxError(source, line, column, `invalid double-quoted string: ${error.message}`) }
  }
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) throw new PolicySyntaxError(source, line, column, 'unterminated single-quoted string')
    return text.slice(1, -1).replace(/''/g, "'")
  }
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null') return null
  if (/^-?(?:0|[1-9]\d*)$/.test(text)) return Number(text)
  if (/^-?(?:\d+\.\d*|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new PolicySyntaxError(source, line, column, 'floats are unsupported')
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(text)) throw new PolicySyntaxError(source, line, column, 'timestamps must be quoted')
  if (/^[\-?:,\[\]{}#&*!|>@`%]/.test(text) || /:\s/.test(text) || /\s[#&*!]\S/.test(text)) {
    throw new PolicySyntaxError(source, line, column, 'plain scalar uses unsupported YAML indicator syntax; quote it')
  }
  if (!/^[A-Za-z0-9_()./@+\-]+(?: [A-Za-z0-9_()./@+\-]+)*$/.test(text)) {
    throw new PolicySyntaxError(source, line, column, 'plain scalar contains unsupported characters; quote it')
  }
  return text
}

class Parser {
  constructor(text, source) {
    this.source = source
    this.lines = []
    const physical = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
    for (let index = 0; index < physical.length; index++) {
      const raw = physical[index]
      if (raw.includes('\t')) throw new PolicySyntaxError(source, index + 1, raw.indexOf('\t') + 1, 'tabs are unsupported')
      const withoutComment = stripComment(raw).trimEnd()
      if (!withoutComment.trim()) continue
      const indent = withoutComment.length - withoutComment.trimStart().length
      if (indent % 2 !== 0) throw new PolicySyntaxError(source, index + 1, 1, 'indentation must use multiples of two spaces')
      const textValue = withoutComment.slice(indent)
      if (textValue === '---' || textValue === '...' || textValue.startsWith('%')) {
        throw new PolicySyntaxError(source, index + 1, indent + 1, 'directives and multi-document YAML are unsupported')
      }
      this.lines.push({ indent, text: textValue, line: index + 1 })
    }
    this.index = 0
  }

  error(item, message, column = 1) { throw new PolicySyntaxError(this.source, item.line, item.indent + column, message) }

  parse() {
    if (!this.lines.length) throw new PolicySyntaxError(this.source, 1, 1, 'policy is empty')
    if (this.lines[0].indent !== 0) this.error(this.lines[0], 'root mapping must start at column one')
    const value = this.block(0)
    if (this.index !== this.lines.length) this.error(this.lines[this.index], 'unexpected trailing content')
    if (!value || typeof value !== 'object' || Array.isArray(value)) this.error(this.lines[0], 'policy root must be a mapping')
    return value
  }

  block(indent) {
    const item = this.lines[this.index]
    if (!item || item.indent !== indent) this.error(item || this.lines[this.lines.length - 1], `expected indentation ${indent}`)
    return item.text.startsWith('-') ? this.sequence(indent) : this.mapping(indent)
  }

  splitEntry(item, text = item.text) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/.exec(text)
    if (!match) this.error(item, 'expected a simple mapping key followed by a colon')
    return { key: match[1], rest: match[2] ?? '' }
  }

  assign(target, item, text, childIndent) {
    const { key, rest } = this.splitEntry(item, text)
    if (Object.prototype.hasOwnProperty.call(target, key)) this.error(item, `duplicate key: ${key}`)
    this.index++
    if (rest) target[key] = scalar(rest, this.source, item.line, item.indent + text.indexOf(rest) + 1)
    else if (this.index < this.lines.length && this.lines[this.index].indent > item.indent) {
      if (this.lines[this.index].indent !== childIndent) this.error(this.lines[this.index], `expected indentation ${childIndent}`)
      target[key] = this.block(childIndent)
    } else target[key] = null
  }

  mapping(indent) {
    const result = {}
    while (this.index < this.lines.length) {
      const item = this.lines[this.index]
      if (item.indent < indent) break
      if (item.indent > indent) this.error(item, `unexpected indentation; expected ${indent}`)
      if (item.text.startsWith('-')) this.error(item, 'cannot mix sequence and mapping entries at one indentation')
      this.assign(result, item, item.text, indent + 2)
    }
    return result
  }

  sequence(indent) {
    const result = []
    while (this.index < this.lines.length) {
      const item = this.lines[this.index]
      if (item.indent < indent) break
      if (item.indent > indent) this.error(item, `unexpected indentation; expected ${indent}`)
      if (item.text !== '-' && !item.text.startsWith('- ')) this.error(item, 'cannot mix mapping and sequence entries at one indentation')
      const body = item.text === '-' ? '' : item.text.slice(2)
      if (!body) {
        this.index++
        if (this.index >= this.lines.length || this.lines[this.index].indent !== indent + 2) this.error(item, 'empty sequence item requires a nested value')
        result.push(this.block(indent + 2))
      } else if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(body)) {
        const object = {}
        this.assign(object, item, body, indent + 4)
        while (this.index < this.lines.length && this.lines[this.index].indent === indent + 2 && !this.lines[this.index].text.startsWith('-')) {
          const sibling = this.lines[this.index]
          this.assign(object, sibling, sibling.text, indent + 4)
        }
        result.push(object)
      } else {
        this.index++
        result.push(scalar(body, this.source, item.line, item.indent + 3))
        if (this.index < this.lines.length && this.lines[this.index].indent > indent) this.error(this.lines[this.index], 'scalar sequence item cannot have nested content')
      }
    }
    return result
  }
}

export function parsePolicyYaml(text, source = '<policy>') { return new Parser(text, source).parse() }

function digest(text) { return createHash('sha256').update(text).digest('hex') }
function unresolved(value) { return typeof value === 'string' && /\bTODO\s*\(judgment\)/i.test(value) }

function getPath(object, path) {
  let current = object
  for (const part of path.split('.')) current = current?.[part]
  return current
}

function addProvenance(entries, value, prefix, source, sourceDigest) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => addProvenance(entries, item, `${prefix}/${index}`, source, sourceDigest))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) addProvenance(entries, child, `${prefix}/${key}`, source, sourceDigest)
  } else entries.push({ path: prefix, source, source_digest: sourceDigest, default_reason: null })
}

const BUDGET_RANK = { small: 0, medium: 1, large: 2 }
const EXECUTION_RANK = { light: 0, standard: 1, deep: 2 }
const DEFAULT_HOST = {
  schema: 1,
  allowed_tools: ['apply_patch', 'command', 'read'],
  allowed_write_roots: ['.'],
  network: false,
  max_budget_tier: 'large',
  model_profiles: ['smaller-model-only', 'mixed'],
  release_outputs: ['pr_ready_branch'],
}

function unique(values) { return [...new Set((values || []).filter(Boolean))].sort() }

function boundedWriteRoots(projectRoots, hostRoots) {
  const normalize = (value) => String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '') || '.'
  const hosts = hostRoots.map(normalize)
  return unique(projectRoots.map(normalize).filter((project) => hosts.some((host) => host === '.' || project === host || project.startsWith(`${host}/`))))
}

function readContextDigest(root, relativePath) {
  const path = resolve(root, relativePath)
  if (!existsSync(path)) throw new ContractValidationError(`missing selected project context: ${path}`)
  return digest(readFileSync(path, 'utf8'))
}

export function loadHostConstraints(input) {
  if (!input) return assertValid('host-constraints', { ...DEFAULT_HOST })
  if (typeof input === 'object') return assertValid('host-constraints', input)
  try { return assertValid('host-constraints', JSON.parse(readFileSync(resolve(input), 'utf8'))) }
  catch (error) {
    if (error instanceof ContractValidationError) throw error
    throw new ContractValidationError(`invalid host constraints: ${error.message}`)
  }
}

export function effectivePolicyDigest(policy) {
  const stable = {
    contract_version: policy.contract_version,
    source_digests: policy.source_digests,
    context_digests: policy.context_digests,
    resolved: policy.resolved,
  }
  return digest(canonicalJson(stable))
}

export function compilePolicy(root, options = {}) {
  const policyDir = resolve(root, '.dev', 'policy')
  const policies = {}
  const sourceDigests = {}
  const provenance = []
  const revisions = new Set()
  for (const [file, contract] of Object.entries(POLICY_FILES)) {
    const path = join(policyDir, file)
    if (!existsSync(path)) throw new ContractValidationError(`missing project policy: ${path}`)
    const text = readFileSync(path, 'utf8')
    const value = parsePolicyYaml(text, path)
    try { assertValid(contract.schema, value) }
    catch (error) {
      if (error instanceof ContractValidationError) throw new ContractValidationError(`${file} is invalid: ${formatIssues(error.issues)}`, error.issues)
      throw error
    }
    const sourceDigest = digest(text)
    policies[contract.key] = value
    sourceDigests[file] = sourceDigest
    revisions.add(value.source_revision)
    addProvenance(provenance, value, `/policies/${contract.key}`, file, sourceDigest)
  }
  if (revisions.size !== 1) throw new ContractValidationError(`policy source revisions disagree: ${[...revisions].join(', ')}`)

  const unresolvedMaterial = MATERIAL_PATHS.filter((path) => unresolved(getPath(policies, path)))
  const contextDigests = {
    knowledge_index: readContextDigest(root, '.dev/knowledge/00-index.md'),
    rules_index: readContextDigest(root, '.dev/rules/00-index.md'),
  }
  provenance.push({ path: '/context_digests/knowledge_index', source: '.dev/knowledge/00-index.md', source_digest: contextDigests.knowledge_index, default_reason: null })
  provenance.push({ path: '/context_digests/rules_index', source: '.dev/rules/00-index.md', source_digest: contextDigests.rules_index, default_reason: null })

  const host = loadHostConstraints(options.hostConstraints)
  const projectAuthority = policies.authority.runtime || {
    allowed_tools: host.allowed_tools,
    allowed_write_roots: host.allowed_write_roots,
    network: false,
    max_budget_tier: 'small',
    requires_user_approval_for: [],
  }
  const projectRouting = policies.routing.runtime || {
    execution_tier: 'standard',
    budget_tier: 'small',
    model_profile: 'smaller-model-only',
    required_specialists: ['probe', 'judge'],
    required_lenses: [],
  }
  if (BUDGET_RANK[projectRouting.budget_tier] > BUDGET_RANK[projectAuthority.max_budget_tier]) {
    throw new ContractValidationError(`routing budget ${projectRouting.budget_tier} exceeds project authority maximum ${projectAuthority.max_budget_tier}`)
  }
  if (BUDGET_RANK[projectRouting.budget_tier] > BUDGET_RANK[host.max_budget_tier]) {
    throw new ContractValidationError(`project budget ${projectRouting.budget_tier} exceeds host maximum ${host.max_budget_tier}`)
  }
  if (!host.model_profiles.includes(projectRouting.model_profile)) {
    throw new ContractValidationError(`model profile ${projectRouting.model_profile} is unavailable on the host`)
  }
  if (!host.release_outputs.includes(policies.release.target)) {
    throw new ContractValidationError(`release output ${policies.release.target} is unavailable on the host`)
  }

  const override = {
    ...(options.runOverrides || {}),
    ...(options.budgetTier ? { budget_tier: options.budgetTier } : {}),
    ...(options.executionTier ? { execution_tier: options.executionTier } : {}),
    ...(options.modelProfile ? { model_profile: options.modelProfile } : {}),
  }
  if (override.budget_tier && BUDGET_RANK[override.budget_tier] > BUDGET_RANK[projectRouting.budget_tier]) {
    throw new ContractValidationError(`run budget override ${override.budget_tier} cannot exceed project tier ${projectRouting.budget_tier}`)
  }
  if (override.execution_tier && EXECUTION_RANK[override.execution_tier] < EXECUTION_RANK[projectRouting.execution_tier]) {
    throw new ContractValidationError(`run execution override ${override.execution_tier} cannot weaken project tier ${projectRouting.execution_tier}`)
  }
  if (override.model_profile === 'mixed' && projectRouting.model_profile === 'smaller-model-only') {
    throw new ContractValidationError('run model override cannot add frontier escalation to a smaller-model-only project profile')
  }
  if (override.model_profile && !host.model_profiles.includes(override.model_profile)) {
    throw new ContractValidationError(`run model override ${override.model_profile} is unavailable on the host`)
  }
  if (override.release_output && override.release_output !== policies.release.target) {
    throw new ContractValidationError(`run release override ${override.release_output} cannot expand project output ${policies.release.target}`)
  }

  const allowedTools = unique(projectAuthority.allowed_tools.filter((tool) => host.allowed_tools.includes(tool)))
  const allowedWriteRoots = boundedWriteRoots(projectAuthority.allowed_write_roots, host.allowed_write_roots)
  const budgetTier = override.budget_tier || projectRouting.budget_tier
  const executionTier = override.execution_tier || projectRouting.execution_tier
  const modelProfile = override.model_profile || projectRouting.model_profile
  const requiredSpecialists = unique([...projectRouting.required_specialists, ...(override.additional_specialists || [])])
  const requiredLenses = unique([...projectRouting.required_lenses, ...(override.additional_lenses || [])])
  const requiredCommands = unique([...policies.quality.required_commands.map((entry) => entry.command), ...(override.additional_required_commands || [])])
  const defaults = {
    execution_tier: executionTier,
    model_profile: modelProfile,
    budget_tier: budgetTier,
    release_output: 'pr_ready_branch',
  }
  for (const key of Object.keys(defaults)) {
    provenance.push({ path: `/defaults/${key}`, source: 'implementation-contract-v1', source_digest: null, default_reason: 'Phase 0a conservative default' })
  }
  const reasons = unique([
    `authority tools are the intersection of project and host allowlists (${allowedTools.join(', ') || 'none'})`,
    `write roots are bounded by the host (${allowedWriteRoots.join(', ') || 'none'})`,
    `network is ${projectAuthority.network && host.network ? 'allowed by both project and host' : 'disabled by project or host'}`,
    `routing selected ${executionTier}/${budgetTier}/${modelProfile}`,
    `release output is bounded to ${policies.release.target}`,
  ])
  const resolved = {
    authority: {
      allowed_tools: allowedTools,
      allowed_write_roots: allowedWriteRoots,
      network: Boolean(projectAuthority.network && host.network),
      requires_user_approval_for: unique([...policies.authority.agent_must_escalate, ...projectAuthority.requires_user_approval_for]),
    },
    routing: {
      execution_tier: executionTier,
      budget_tier: budgetTier,
      model_profile: modelProfile,
      required_specialists: requiredSpecialists,
      required_lenses: requiredLenses,
    },
    quality: {
      required_commands: requiredCommands,
      required_evidence: unique(policies.quality.required_evidence || []),
      evidence_rules: policies.quality.evidence_rules,
    },
    release: {
      output: policies.release.target,
      production_deployment_authorized: false,
      requires: unique(policies.release.requires),
    },
  }
  addProvenance(provenance, resolved, '/resolved', 'effective-resolution', null)
  for (const entry of provenance) {
    if (entry.source === 'effective-resolution') entry.default_reason = 'host/user bounds, project policy, permitted run overrides, then kit defaults'
  }
  const effective = {
    schema: 1,
    contract_version: 1,
    compiled_at: new Date().toISOString(),
    ready: unresolvedMaterial.length === 0,
    unresolved_material: unresolvedMaterial,
    source_digests: sourceDigests,
    context_digests: contextDigests,
    policies,
    defaults,
    resolved,
    reasons,
    provenance,
  }
  return assertValid('effective-policy', effective)
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] || 'compile'
    if (command !== 'compile') throw new ContractValidationError(`unknown policy command: ${command}`)
    const root = resolve(arg('--root', process.cwd()))
    const effective = compilePolicy(root, {
      budgetTier: arg('--budget-tier'),
      executionTier: arg('--execution-tier'),
      modelProfile: arg('--model-profile'),
      hostConstraints: arg('--host-constraints'),
      runOverrides: {
        additional_specialists: arg('--additional-specialists').split(',').map((value) => value.trim()).filter(Boolean),
        additional_lenses: arg('--additional-lenses').split(',').map((value) => value.trim()).filter(Boolean),
        additional_required_commands: arg('--additional-required-command') ? [arg('--additional-required-command')] : [],
        release_output: arg('--release-output'),
      },
    })
    const output = `${JSON.stringify(effective, null, 2)}\n`
    const out = arg('--out')
    if (out) writeFileSync(resolve(out), output, 'utf8')
    else process.stdout.write(output)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, issues: error.issues || [] }, null, 2)}\n`)
    process.exit(2)
  }
}
