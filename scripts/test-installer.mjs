#!/usr/bin/env node

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'ae-installer-'))
const npx = process.platform === 'win32' ? process.env.ComSpec : 'npx'
const npxPrefix = process.platform === 'win32' ? ['/d', '/s', '/c', 'npx'] : []
const installer = 'skills@1.7.0'
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
      '-y', installer, 'add', repo,
      '--agent', agent, '--copy', '--yes',
    ], { cwd: project, encoding: 'utf8', timeout: 120000 })
    const base = join(project, skillsDir)
    const lockPath = join(project, 'skills-lock.json')
    const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null
    const complete = result.status === 0 &&
      existsSync(join(base, 'ae-surveyor', 'SKILL.md')) &&
      existsSync(join(base, 'ae-surveyor', 'scripts', 'analyze.mjs')) &&
      existsSync(join(base, 'ae-forge', 'SKILL.md')) &&
      existsSync(join(base, 'ae-forge', 'references', 'roles', 'security.md')) &&
      lock?.skills?.['ae-surveyor']?.computedHash &&
      lock?.skills?.['ae-forge']?.computedHash
    if (complete) process.stdout.write(`  PASS  ${agent} installs both complete skills into ${skillsDir}\n`)
    else {
      failed++
      const detail = result.error?.message || `${result.stdout || ''}${result.stderr || ''}`
      process.stdout.write(`  FAIL  ${agent} install contract\n${detail}\n`)
    }
  }

  const combined = join(temp, 'combined')
  mkdirSync(combined)
  const combinedArgs = [...npxPrefix,
    '-y', installer, 'add', repo,
    '--agent', 'antigravity', '--agent', 'claude-code', '--copy', '--yes',
  ]
  const first = spawnSync(npx, combinedArgs, { cwd: combined, encoding: 'utf8', timeout: 120000 })
  const second = spawnSync(npx, combinedArgs, { cwd: combined, encoding: 'utf8', timeout: 120000 })
  const universal = join(combined, '.agents', 'skills')
  const claude = join(combined, '.claude', 'skills')
  const sameFile = (relativePath) => {
    const universalFile = join(universal, relativePath)
    const claudeFile = join(claude, relativePath)
    return existsSync(universalFile) && existsSync(claudeFile) &&
      readFileSync(universalFile, 'utf8') === readFileSync(claudeFile, 'utf8')
  }
  const combinedLockPath = join(combined, 'skills-lock.json')
  const combinedLock = existsSync(combinedLockPath)
    ? JSON.parse(readFileSync(combinedLockPath, 'utf8'))
    : null
  const combinedComplete = first.status === 0 && second.status === 0 &&
    existsSync(join(universal, 'ae-surveyor', 'SKILL.md')) &&
    existsSync(join(universal, 'ae-forge', 'SKILL.md')) &&
    existsSync(join(claude, 'ae-surveyor', 'SKILL.md')) &&
    existsSync(join(claude, 'ae-forge', 'SKILL.md')) &&
    sameFile(join('ae-surveyor', 'SKILL.md')) &&
    sameFile(join('ae-surveyor', 'scripts', 'analyze.mjs')) &&
    sameFile(join('ae-forge', 'SKILL.md')) &&
    sameFile(join('ae-forge', 'references', 'roles', 'security.md')) &&
    // All eight ship together and the list is asserted rather than counted:
    // a stage skill installed without ae-forge beside it cannot resolve its
    // contract, and one silently dropped from the package would fail only at
    // the moment someone tried to run that stage.
    Object.keys(combinedLock?.skills || {}).sort().join(',') ===
      'ae-audit,ae-build,ae-forge,ae-investigate,ae-plan,ae-plan-review,ae-surveyor,ae-verify'
  if (combinedComplete) process.stdout.write('  PASS  repeated multi-IDE install keeps both destinations in sync\n')
  else {
    failed++
    const detail = first.error?.message || second.error?.message ||
      `${first.stdout || ''}${first.stderr || ''}${second.stdout || ''}${second.stderr || ''}`
    process.stdout.write(`  FAIL  repeated multi-IDE install contract\n${detail}\n`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}

if (failed) process.exit(1)
