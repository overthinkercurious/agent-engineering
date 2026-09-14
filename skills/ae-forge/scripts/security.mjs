#!/usr/bin/env node

const PATTERNS = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['aws_access_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['github_token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ['provider_api_key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['bearer_token', /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi],
  ['credential_assignment', /\b(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi],
]

export function secretFindings(value) {
  const findings = []
  const visit = (item, path) => {
    if (typeof item === 'string') {
      for (const [type, pattern] of PATTERNS) { pattern.lastIndex = 0; if (pattern.test(item)) findings.push({ path, type }) }
    } else if (Array.isArray(item)) item.forEach((child, index) => visit(child, `${path}/${index}`))
    else if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) visit(child, `${path}/${key}`)
  }
  visit(value, '#')
  return findings
}

export function redactText(text) {
  let output = String(text)
  for (const [type, pattern] of PATTERNS) { pattern.lastIndex = 0; output = output.replace(pattern, `[REDACTED:${type}]`) }
  return output
}
