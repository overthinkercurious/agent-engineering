#!/usr/bin/env node

// Deterministic lens-attachment matcher. Mechanizes team.md's "Lens
// selection" algorithm so it is testable and repeatable instead of a prose
// instruction each Forge run interprets freshly.
//
// Usage as a library: import { selectLenses } from './lens-select.mjs'
// Usage as a CLI: node lens-select.mjs --team architect,builder,verifier --signals android,kotlin [--stack android]

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

export function loadTeamContract(teamPath) {
  return JSON.parse(readFileSync(teamPath, 'utf8'))
}

/**
 * @param {object} team - parsed team.json
 * @param {string[]} roles - the selected team roles (from forge.mjs chooseTeam)
 * @param {string[]} signals - the request's own signals
 * @param {string[]} stackSignals - signals detected by ae-surveyor's stack.md, if a survey exists
 * @returns {{ attached: Record<string,string[]>, unavailable: string[] }}
 *   attached maps role -> ordered lens names (max 2, strongest match first).
 *   unavailable lists request/stack signals that name a backlog (not-yet-written) lens.
 */
export function selectLenses(team, roles, signals, stackSignals = []) {
  const allSignals = new Set([...signals, ...stackSignals].map((s) => s.toLowerCase()))
  const lenses = team.lenses || {}
  const attached = {}

  for (const role of roles) {
    const scored = Object.entries(lenses)
      .filter(([, lens]) => (lens.attaches_to || []).includes(role))
      .map(([name, lens]) => ({
        name,
        score: (lens.signals || []).filter((s) => allSignals.has(s.toLowerCase())).length,
      }))
      .filter((m) => m.score > 0)
      // Strongest signal match first; ties break on declared team.json order
      // (Object.entries preserves insertion order), never on name alone, so
      // adding a new lens can't silently reorder an existing tie.
      .sort((a, b) => b.score - a.score)

    if (scored.length) attached[role] = scored.slice(0, 2).map((m) => m.name)
  }

  const backlog = new Set((team.lenses_backlog || []).map((s) => s.toLowerCase()))
  const unavailable = [...allSignals].filter((s) => backlog.has(s))

  return { attached, unavailable }
}

function runCli() {
  const args = process.argv.slice(2)
  const option = (name, fallback = '') => {
    const i = args.indexOf(name)
    return i === -1 ? fallback : args[i + 1]
  }
  const split = (v) => v.split(',').map((x) => x.trim()).filter(Boolean)
  const teamPath = resolve(option('--team-json', resolve(SCRIPT_DIR, '..', 'references', 'team.json')))
  const team = loadTeamContract(teamPath)
  const roles = split(option('--team'))
  const signals = split(option('--signals'))
  const stackSignals = split(option('--stack'))
  const result = selectLenses(team, roles, signals, stackSignals)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

// Compare resolved file URLs, not a hand-built `file://` + argv[1]. argv[1] is
// the path AS TYPED (often relative), and on Windows a real module URL is
// file:///D:/... - so the naive form never matched and this CLI silently
// printed nothing, while team.md instructed the model to run it.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli()
