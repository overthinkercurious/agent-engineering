#!/usr/bin/env node
// test-docs-consistency.mjs - keep the shipped documentation honest about the
// shipped runtime.
//
// Phase 10 found the README describing roughly half the runner's real command
// surface and no host-adapter layer at all, so a reader could not have operated
// the kit from it. These checks exist so that specific drift cannot return
// quietly, and so the standing "no unmeasured claims" decision is enforced by
// something other than memory.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')
const PRD = readFileSync(join(ROOT, 'docs', 'DEVELOPMENT-KIT-PRD.md'), 'utf8')
const FORGE = readFileSync(join(ROOT, 'skills', 'ae-forge', 'scripts', 'forge.mjs'), 'utf8')
const REGISTRY = JSON.parse(readFileSync(join(ROOT, 'skills', 'ae-forge', 'references', 'registry.json'), 'utf8'))

let passed = 0
let failed = 0
const check = (name, condition, detail = '') => {
  if (condition) { process.stdout.write(`  PASS  ${name}\n`); passed += 1; return }
  process.stdout.write(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}\n`); failed += 1
}

process.stdout.write('\nDocumentation and runtime consistency\n\n')

// 1. Every command the runner actually dispatches is documented. `help` is
//    excluded: it documents itself and carries no behavior worth describing.
const shipped = [...FORGE.matchAll(/command === '([a-z]+)'/g)].map((m) => m[1])
  .filter((name) => name !== 'help')
const undocumented = [...new Set(shipped)].filter((name) => !new RegExp(`\`${name}\``).test(README))
check('README documents every shipped runner command', undocumented.length === 0,
  undocumented.length ? `missing from README: ${undocumented.join(', ')}` : '')

// 2. The README cannot advertise a command the runner does not have. Only the
//    Runner section is scanned: other sections use the same table shape for
//    things that are not commands (model profiles, budget tiers).
const runnerSection = README.split(/^## /m).find((section) => section.startsWith('Runner\n')) || ''
const documentedCommands = [...runnerSection.matchAll(/^\| `([a-z]+)`/gm)].map((m) => m[1])
const phantom = [...new Set(documentedCommands)].filter((name) => !shipped.includes(name))
check('README documents no command the runner lacks', phantom.length === 0,
  phantom.length ? `documented but not shipped: ${phantom.join(', ')}` : '')

// 3. Every routed specialist is named in the README roster.
const missingSpecialists = Object.keys(REGISTRY.specialists)
  .filter((id) => !new RegExp(id, 'i').test(README))
check('README names every registered specialist', missingSpecialists.length === 0,
  missingSpecialists.length ? `missing: ${missingSpecialists.join(', ')}` : '')

// 4. No unmeasured comparative claim, anywhere in the shipped docs. The
//    evaluation that would substantiate one is deferred; see
//    docs/decisions/phase-0b-deferral.md. Matches comparative constructions
//    rather than the bare word "cost", which appears legitimately throughout.
const CLAIM_PATTERNS = [
  /\b(cheaper|faster|better|safer|smarter)\s+than\b/i,
  /\bas\s+(good|fast|cheap|reliable|capable)\s+as\b/i,
  /\boutperform(s|ed|ing)?\b/i,
  /\b(lower|less|reduced)\s+(cost|spend|tokens?)\s+than\b/i,
  /\bnear-?frontier\b/i,
  /\b\d+\s*%\s*(less|fewer|lower|faster|cheaper|more)\b/i,
]
for (const [label, text] of [['README.md', README], ['DEVELOPMENT-KIT-PRD.md', PRD]]) {
  const hits = []
  for (const pattern of CLAIM_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'gi'))) {
      const line = text.slice(0, match.index).split('\n').length
      hits.push(`line ${line}: "${match[0]}"`)
    }
  }
  check(`${label} makes no unmeasured comparative claim`, hits.length === 0, hits.join('; '))
}

// 5. The PRD must not reassert fixed per-role model classes. Phase 5 made the
//    resolved model profile authoritative; a second, contradictory routing
//    authority in prose is exactly what Phase 10 was told to remove.
const prdFixedModelRouting = /use\s+(the\s+)?strongest\s+models?\s+for\b/i.test(PRD)
check('PRD does not prescribe fixed per-role model classes', !prdFixedModelRouting,
  prdFixedModelRouting ? 'PRD section 17 reasserts fixed model-class routing' : '')

// 6. The Git-only scope and the unevaluated status are both stated, not implied.
check('README states the Git-only requirement', /git[- ]only|non-git[^.]*rejected/i.test(README))
check('README states that performance and cost are unevaluated', /unevaluated/i.test(README))

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
