#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = dirname(fileURLToPath(import.meta.url))
export const SCHEMA_DIR = resolve(SELF, '..', 'references', 'schemas')

const KEYWORDS = new Set([
  '$schema', '$id', '$ref', '$defs', 'title', 'description', 'default',
  'allOf', 'anyOf', 'oneOf', 'not', 'type', 'required', 'properties',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems',
  'const', 'enum', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
  'multipleOf', 'format',
])
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default'])
const TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string'])
const schemaCache = new Map()

export class ContractValidationError extends Error {
  constructor(message, issues = []) {
    super(message)
    this.name = 'ContractValidationError'
    this.issues = issues
  }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { throw new ContractValidationError(`invalid JSON at ${path}: ${error.message}`) }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function canonicalJson(value) { return canonical(value) }

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (Number.isInteger(value)) return 'integer'
  if (typeof value === 'number') return 'number'
  return typeof value
}

function typeMatches(value, expected) {
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (expected === 'integer') return Number.isInteger(value)
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return valueType(value) === expected
}

function pointerPart(value) { return value.replace(/~1/g, '/').replace(/~0/g, '~') }

function atPointer(document, fragment, label) {
  if (!fragment || fragment === '#') return document
  if (!fragment.startsWith('#/')) throw new ContractValidationError(`unsupported JSON pointer in ${label}: ${fragment}`)
  let current = document
  for (const part of fragment.slice(2).split('/').map(pointerPart)) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      throw new ContractValidationError(`unresolved JSON pointer in ${label}: ${fragment}`)
    }
    current = current[part]
  }
  return current
}

function inside(base, target) {
  const rel = relative(resolve(base), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function loadSchemaPath(path, schemaDir = SCHEMA_DIR) {
  const absolute = resolve(path)
  if (!inside(schemaDir, absolute)) throw new ContractValidationError(`schema path escapes schema directory: ${path}`)
  if (!schemaCache.has(absolute)) schemaCache.set(absolute, readJson(absolute))
  return schemaCache.get(absolute)
}

export function schemaPath(name, schemaDir = SCHEMA_DIR) {
  const file = name.endsWith('.schema.json') ? name : `${name}.schema.json`
  const path = resolve(schemaDir, file)
  if (!inside(schemaDir, path)) throw new ContractValidationError(`schema name escapes schema directory: ${name}`)
  return path
}

function resolveReference(ref, currentFile, schemaDir) {
  if (typeof ref !== 'string' || !ref) throw new ContractValidationError('$ref must be a non-empty string')
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) throw new ContractValidationError(`remote $ref is unsupported: ${ref}`)
  const hash = ref.indexOf('#')
  const filePart = hash === -1 ? ref : ref.slice(0, hash)
  const fragment = hash === -1 ? '' : ref.slice(hash)
  const targetFile = filePart ? resolve(dirname(currentFile), filePart) : currentFile
  if (!inside(schemaDir, targetFile)) throw new ContractValidationError(`$ref escapes schema directory: ${ref}`)
  const document = loadSchemaPath(targetFile, schemaDir)
  return { schema: atPointer(document, fragment, ref), file: targetFile, key: `${targetFile}${fragment}` }
}

function vocabularyIssues(schema, currentFile, schemaDir, location = '#', refTrail = []) {
  const issues = []
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [{ path: location, message: 'schema must be an object' }]
  }
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key)) issues.push({ path: location, message: `unsupported schema keyword: ${key}` })
  }
  if ('$ref' in schema) {
    for (const key of Object.keys(schema)) {
      if (key !== '$ref' && !ANNOTATIONS.has(key)) issues.push({ path: location, message: '$ref cannot have validation siblings' })
    }
    try {
      const target = resolveReference(schema.$ref, currentFile, schemaDir)
      if (refTrail.includes(target.key)) issues.push({ path: location, message: `reference cycle: ${schema.$ref}` })
      else issues.push(...vocabularyIssues(target.schema, target.file, schemaDir, `${location}/$ref`, [...refTrail, target.key]))
    } catch (error) { issues.push({ path: location, message: error.message }) }
  }
  if ('type' in schema) {
    const values = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!values.length || values.some((value) => !TYPES.has(value)) || new Set(values).size !== values.length) {
      issues.push({ path: `${location}/type`, message: 'type must contain unique supported type names' })
    }
  }
  if ('format' in schema && schema.format !== 'date-time') issues.push({ path: `${location}/format`, message: `unsupported format: ${schema.format}` })
  if ('pattern' in schema) {
    try { new RegExp(schema.pattern) } catch { issues.push({ path: `${location}/pattern`, message: 'pattern is not a valid regular expression' }) }
  }
  if ('required' in schema && (!Array.isArray(schema.required) || schema.required.some((value) => typeof value !== 'string'))) {
    issues.push({ path: `${location}/required`, message: 'required must be an array of strings' })
  }
  if ('properties' in schema) {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
      issues.push({ path: `${location}/properties`, message: 'properties must be an object' })
    } else {
      for (const [key, child] of Object.entries(schema.properties)) {
        issues.push(...vocabularyIssues(child, currentFile, schemaDir, `${location}/properties/${key}`, refTrail))
      }
    }
  }
  if ('$defs' in schema) {
    if (!schema.$defs || typeof schema.$defs !== 'object' || Array.isArray(schema.$defs)) {
      issues.push({ path: `${location}/$defs`, message: '$defs must be an object' })
    } else {
      for (const [key, child] of Object.entries(schema.$defs)) {
        issues.push(...vocabularyIssues(child, currentFile, schemaDir, `${location}/$defs/${key}`, refTrail))
      }
    }
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!(key in schema)) continue
    if (!Array.isArray(schema[key]) || !schema[key].length) issues.push({ path: `${location}/${key}`, message: `${key} must be a non-empty array` })
    else schema[key].forEach((child, index) => issues.push(...vocabularyIssues(child, currentFile, schemaDir, `${location}/${key}/${index}`, refTrail)))
  }
  if ('not' in schema) issues.push(...vocabularyIssues(schema.not, currentFile, schemaDir, `${location}/not`, refTrail))
  if ('items' in schema) issues.push(...vocabularyIssues(schema.items, currentFile, schemaDir, `${location}/items`, refTrail))
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    issues.push(...vocabularyIssues(schema.additionalProperties, currentFile, schemaDir, `${location}/additionalProperties`, refTrail))
  } else if ('additionalProperties' in schema && typeof schema.additionalProperties !== 'boolean') {
    issues.push({ path: `${location}/additionalProperties`, message: 'additionalProperties must be a boolean or schema' })
  }
  return issues
}

export function validateSchemaFile(path, options = {}) {
  const schemaDir = resolve(options.schemaDir || SCHEMA_DIR)
  const absolute = resolve(path)
  const schema = loadSchemaPath(absolute, schemaDir)
  return vocabularyIssues(schema, absolute, schemaDir, '#', [`${absolute}#`])
}

function validateNode(value, schema, context, path, refTrail = []) {
  const issues = []
  if ('$ref' in schema) {
    try {
      const target = resolveReference(schema.$ref, context.currentFile, context.schemaDir)
      if (refTrail.includes(target.key)) return [{ path, message: `reference cycle: ${schema.$ref}` }]
      return validateNode(value, target.schema, { ...context, currentFile: target.file }, path, [...refTrail, target.key])
    } catch (error) { return [{ path, message: error.message }] }
  }

  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!(key in schema)) continue
    const attempts = schema[key].map((child) => validateNode(value, child, context, path, refTrail))
    const passing = attempts.filter((attempt) => attempt.length === 0).length
    if (key === 'allOf') attempts.forEach((attempt) => issues.push(...attempt))
    if (key === 'anyOf' && passing === 0) issues.push({ path, message: 'must match at least one anyOf branch' })
    if (key === 'oneOf' && passing !== 1) issues.push({ path, message: `must match exactly one oneOf branch; matched ${passing}` })
  }
  if ('not' in schema && validateNode(value, schema.not, context, path, refTrail).length === 0) issues.push({ path, message: 'must not match forbidden schema' })

  if ('type' in schema) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => typeMatches(value, type))) {
      issues.push({ path, message: `expected ${types.join('|')}, received ${valueType(value)}` })
      return issues
    }
  }
  if ('const' in schema && canonical(value) !== canonical(schema.const)) issues.push({ path, message: `must equal ${canonical(schema.const)}` })
  if ('enum' in schema && !schema.enum.some((candidate) => canonical(value) === canonical(candidate))) issues.push({ path, message: 'must be one of the declared enum values' })

  if (typeof value === 'string') {
    if ('minLength' in schema && [...value].length < schema.minLength) issues.push({ path, message: `must have at least ${schema.minLength} characters` })
    if ('maxLength' in schema && [...value].length > schema.maxLength) issues.push({ path, message: `must have at most ${schema.maxLength} characters` })
    if ('pattern' in schema && !new RegExp(schema.pattern).test(value)) issues.push({ path, message: `must match ${schema.pattern}` })
    if (schema.format === 'date-time' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) issues.push({ path, message: 'must be an RFC 3339 UTC date-time' })
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if ('minimum' in schema && value < schema.minimum) issues.push({ path, message: `must be >= ${schema.minimum}` })
    if ('maximum' in schema && value > schema.maximum) issues.push({ path, message: `must be <= ${schema.maximum}` })
    if ('multipleOf' in schema && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) issues.push({ path, message: `must be a multiple of ${schema.multipleOf}` })
  }
  if (Array.isArray(value)) {
    if ('minItems' in schema && value.length < schema.minItems) issues.push({ path, message: `must contain at least ${schema.minItems} items` })
    if ('maxItems' in schema && value.length > schema.maxItems) issues.push({ path, message: `must contain at most ${schema.maxItems} items` })
    if (schema.uniqueItems) {
      const seen = new Set()
      value.forEach((item, index) => {
        const key = canonical(item)
        if (seen.has(key)) issues.push({ path: `${path}/${index}`, message: 'must be unique' })
        seen.add(key)
      })
    }
    if (schema.items) value.forEach((item, index) => issues.push(...validateNode(item, schema.items, context, `${path}/${index}`, refTrail)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) issues.push({ path, message: `missing required property: ${key}` })
    const declared = schema.properties || {}
    for (const [key, child] of Object.entries(declared)) {
      if (key in value) issues.push(...validateNode(value[key], child, context, `${path}/${key}`, refTrail))
    }
    for (const key of Object.keys(value)) {
      if (key in declared) continue
      if (schema.additionalProperties === false) issues.push({ path: `${path}/${key}`, message: 'additional property is not allowed' })
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        issues.push(...validateNode(value[key], schema.additionalProperties, context, `${path}/${key}`, refTrail))
      }
    }
  }
  return issues
}

function metricIssues(metric, path) {
  if (!metric || typeof metric !== 'object') return []
  if (metric.provenance === 'unavailable' && metric.value !== null) return [{ path, message: 'unavailable usage must have a null value' }]
  if (metric.provenance !== 'unavailable' && metric.value === null) return [{ path, message: 'measured or estimated usage must have a numeric value' }]
  return []
}

export function findingId(finding) {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const identity = {
    criterion: normalize(finding.criterion),
    invariant: normalize(finding.invariant),
    affected_behavior: normalize(finding.affected_behavior),
    evidence_ids: [...(finding.evidence_ids || [])].map(normalize).sort(),
  }
  return `finding:${createHash('sha256').update(canonical(identity)).digest('hex').slice(0, 16)}`
}

export function deduplicateFindings(findings) {
  const byId = new Map()
  for (const finding of findings) {
    if (byId.has(finding.id) && canonical(byId.get(finding.id)) !== canonical(finding)) {
      throw new ContractValidationError(`conflicting findings share id ${finding.id}`)
    }
    if (!byId.has(finding.id)) byId.set(finding.id, finding)
  }
  return [...byId.values()]
}

function semanticIssues(name, value) {
  const issues = []
  if (name === 'usage') {
    for (const field of ['input_tokens', 'output_tokens', 'reasoning_tokens', 'cached_tokens', 'charge_usd']) {
      issues.push(...metricIssues(value[field], `#/${field}`))
    }
  }
  if (name === 'finding' && value?.id && value.id !== findingId(value)) issues.push({ path: '#/id', message: `must equal canonical id ${findingId(value)}` })
  if (name === 'specialist-result') {
    const requests = value?.needs_specialist || []
    if (value?.status === 'needs_specialist' && requests.length === 0) issues.push({ path: '#/needs_specialist', message: 'status needs_specialist requires at least one request' })
    if (value?.status !== 'needs_specialist' && requests.length > 0) issues.push({ path: '#/needs_specialist', message: 'specialist requests require status needs_specialist' })
    for (const [index, evidence] of (value?.evidence || []).entries()) {
      if (evidence.class === 'MEASURED' && !evidence.id.startsWith('receipt:')) issues.push({ path: `#/evidence/${index}/id`, message: 'MEASURED evidence must cite a runner receipt id' })
    }
  }
  if (name === 'run-state') {
    const requiresReason = ['awaiting_specialist', 'blocked', 'halted', 'cancelled'].includes(value?.status)
    if (requiresReason !== Boolean(value?.pause)) issues.push({ path: '#/pause', message: requiresReason ? 'paused or cancelled state requires reason details' : 'active or complete state cannot retain pause details' })
  }
  return issues
}

export function validateValue(name, value, options = {}) {
  const schemaDir = resolve(options.schemaDir || SCHEMA_DIR)
  const path = schemaPath(name, schemaDir)
  const vocabulary = validateSchemaFile(path, { schemaDir })
  if (vocabulary.length) return vocabulary.map((issue) => ({ ...issue, message: `schema error: ${issue.message}` }))
  const schema = loadSchemaPath(path, schemaDir)
  return [...validateNode(value, schema, { currentFile: path, schemaDir }, '#'), ...semanticIssues(name.replace(/\.schema\.json$/, ''), value)]
}

export function assertValid(name, value, options = {}) {
  const issues = validateValue(name, value, options)
  if (issues.length) throw new ContractValidationError(`${name} validation failed`, issues)
  return value
}

export function formatIssues(issues) { return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ') }

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const name = arg('--schema')
    const file = arg('--file')
    const checkSchema = arg('--check-schema')
    if (checkSchema) {
      const issues = validateSchemaFile(resolve(checkSchema))
      process.stdout.write(`${JSON.stringify({ ok: issues.length === 0, issues }, null, 2)}\n`)
      if (issues.length) process.exit(1)
    } else if (name && file) {
      const value = readJson(resolve(file))
      const issues = validateValue(name, value)
      process.stdout.write(`${JSON.stringify({ ok: issues.length === 0, schema: name, file: resolve(file), issues }, null, 2)}\n`)
      if (issues.length) process.exit(1)
    } else {
      process.stderr.write('usage: validate.mjs --schema NAME --file FILE | --check-schema FILE\n')
      process.exit(2)
    }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, issues: error.issues || [] }, null, 2)}\n`)
    process.exit(2)
  }
}
