#!/usr/bin/env node

import { assertValid, findingId, deduplicateFindings } from '../skills/ae-forge/scripts/validate.mjs'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = resolve(SELF, '..', 'skills', 'ae-forge', 'references', 'registry.json')

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nPhase 8 access lens\n\n')

// --- Valid worked example: custom dropdown with no keyboard/role support ---
const base = {
  schema: 2,
  lens: 'access',
  severity: 'high',
  criterion: 'AC-filter-dropdown-operable',
  invariant: 'every interactive control operable by keyboard exposes its role and state to assistive technology',
  evidence_ids: ['observed:keyboard-trace-filter-dropdown'],
  affected_behavior: 'custom filter dropdown cannot be opened, navigated, or selected via keyboard and exposes no listbox role or expanded state',
  smallest_repair: 'add role="listbox"/aria-expanded and keyboard handling (Enter/Space/Arrow/Escape) to the existing div-based trigger',
  verification: 'repeat the keyboard trace and confirm the dropdown opens, options are reachable by arrow keys, and a screen reader announces the expanded/collapsed state',
  status: 'open',
}
const f1 = { ...base, id: findingId(base) }

let f1Valid = true
try { assertValid('finding', f1) } catch (error) { f1Valid = false; process.stdout.write(`    error: ${error.message} ${JSON.stringify(error.issues)}\n`) }
check('valid worked example passes finding schema', f1Valid)

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
check('registry escalates_to matches lens file escalation target (flow)', registry.lenses.access.escalates_to === 'flow')

// --- A genuinely different finding from the same lens ---
const differentBase = {
  schema: 2,
  lens: 'access',
  severity: 'medium',
  criterion: 'AC-error-banner-contrast',
  invariant: 'critical status is signaled by more than color alone and meets contrast requirements',
  evidence_ids: ['observed:contrast-check-error-banner'],
  affected_behavior: 'the checkout error banner relies on a light red background with no icon or text-weight change, falling below required contrast against adjacent text',
  smallest_repair: 'add a non-color error indicator (icon/label) and raise banner text contrast to meet the required ratio',
  verification: 'rerun the contrast check against the required ratio and confirm a non-color signal is present',
  status: 'open',
}
const f2 = { ...differentBase, id: findingId(differentBase) }

let f2Valid = true
try { assertValid('finding', f2) } catch (error) { f2Valid = false }
check('second distinct finding passes finding schema', f2Valid)

const distinctDeduped = deduplicateFindings([f1, f2])
check('distinct findings are not over-merged', distinctDeduped.length === 2)

// --- A duplicate of f1, independently constructed ---
const duplicateBase = {
  schema: 2,
  lens: 'access',
  severity: 'high',
  criterion: 'AC-filter-dropdown-operable',
  invariant: 'every interactive control operable by keyboard exposes its role and state to assistive technology',
  evidence_ids: ['observed:keyboard-trace-filter-dropdown'],
  affected_behavior: 'custom filter dropdown cannot be opened, navigated, or selected via keyboard and exposes no listbox role or expanded state',
  smallest_repair: 'add role="listbox"/aria-expanded and keyboard handling (Enter/Space/Arrow/Escape) to the existing div-based trigger',
  verification: 'repeat the keyboard trace and confirm the dropdown opens, options are reachable by arrow keys, and a screen reader announces the expanded/collapsed state',
  status: 'open',
}
const f1Duplicate = { ...duplicateBase, id: findingId(duplicateBase) }
check('duplicate finding computes the same canonical id', f1Duplicate.id === f1.id)

const duplicateDeduped = deduplicateFindings([f1, f1Duplicate])
check('exact duplicates merge to one finding', duplicateDeduped.length === 1)

// --- Missing-input example ---
const missingInput = {
  status: 'needs_input',
  missing_input: 'keyboard_operable_build_or_trace',
  escalation_target: 'flow',
  reason: 'no runnable build or recorded keyboard interaction to exercise the checkout summary panel',
}
check('missing-input example names the same escalation target as the lens file (flow)', missingInput.escalation_target === registry.lenses.access.escalates_to)

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
