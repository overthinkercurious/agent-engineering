#!/usr/bin/env node

import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'ae-installer-'))
const npx = process.platform === 'win32' ? process.env.ComSpec : 'npx'
const npxPrefix = process.platform === 'win32' ? ['/d', '/s', '/c', 'npx'] : []
const agents = {
  antigravity: '.agents/skills',
  'antigravity-cli': '.agents/skills',
  'gemini-cli': '.agents/skills',
  codex: '.agents/skills',
  cursor: '.agents/skills',
  opencode: '.agents/skills',
  'github-copilot': '.agents/skills',
  'claude-code': '.claude/skills',
}
let failed = 0

try {
  for (const [agent, skillsDir] of Object.entries(agents)) {
    const project = join(temp, agent)
    mkdirSync(project)
    const result = spawnSync(npx, [...npxPrefix,
      '-y', 'skills@1.5.26', 'add', repo,
      '--agent', agent, '--copy', '--yes',
    ], { cwd: project, encoding: 'utf8', timeout: 120000 })
    const base = join(project, skillsDir)
    const complete = result.status === 0 &&
      existsSync(join(base, 'ae-init', 'SKILL.md')) &&
      existsSync(join(base, 'ae-init', 'scripts', 'analyze.mjs')) &&
      existsSync(join(base, 'ae-forge', 'SKILL.md')) &&
      existsSync(join(base, 'ae-forge', 'references', 'roles', 'security.md'))
    if (complete) process.stdout.write(`  PASS  ${agent} installs both complete skills into ${skillsDir}\n`)
    else {
      failed++
      const detail = result.error?.message || `${result.stdout || ''}${result.stderr || ''}`
      process.stdout.write(`  FAIL  ${agent} install contract\n${detail}\n`)
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}

if (failed) process.exit(1)
