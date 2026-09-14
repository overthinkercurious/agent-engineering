#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { ContractValidationError } from './validate.mjs'

function git(args, cwd, encoding = 'utf8') {
  try {
    return execFileSync('git', args, { cwd, encoding, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim()
    throw new ContractValidationError(`Git-backed projects with a valid HEAD are required${detail ? `: ${detail}` : ''}`)
  }
}

export function requireGitProject(inputRoot) {
  const requested = realpathSync(resolve(inputRoot))
  const root = realpathSync(resolve(String(git(['rev-parse', '--show-toplevel'], requested)).trim()))
  const rel = relative(root, requested)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new ContractValidationError('requested root is outside the detected Git project')
  const commit = String(git(['rev-parse', '--verify', 'HEAD^{commit}'], root)).trim()
  if (!/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(commit)) throw new ContractValidationError('Git project has no valid HEAD commit')
  return { root, commit }
}

export function isAncestor(root, base, candidate = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', base, candidate], { cwd: root, stdio: 'ignore' })
    return true
  } catch { return false }
}

export function candidateIdentity(root) {
  const { commit } = requireGitProject(root)
  const hash = createHash('sha256')
  hash.update(`HEAD\0${commit}\0`)
  const diff = git(['diff', '--binary', 'HEAD', '--', '.', ':(exclude).dev/work'], root, null)
  hash.update(Buffer.isBuffer(diff) ? diff : Buffer.from(diff))
  const raw = git(['ls-files', '--others', '--exclude-standard', '-z'], root, null)
  const names = (Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)).split('\0')
    .filter((name) => name && name !== '.dev/work' && !name.startsWith('.dev/work/')).sort()
  for (const name of names) {
    const path = resolve(root, name)
    const rel = relative(root, path)
    if (rel.startsWith('..') || isAbsolute(rel) || !existsSync(path)) throw new ContractValidationError(`unsafe untracked path returned by Git: ${name}`)
    const stat = lstatSync(path)
    hash.update(`untracked\0${name}\0${stat.mode}\0`)
    if (stat.isFile()) hash.update(readFileSync(path))
    else if (stat.isSymbolicLink()) hash.update(realpathSync(path))
    hash.update('\0')
  }
  return { commit, worktree_sha256: hash.digest('hex') }
}
