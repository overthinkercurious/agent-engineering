// All Forge output is local working state. Keep it out of Git in every target
// project, including projects that have never run a separate setup skill.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const START = '# agent-engineering:generated:start'
const END = '# agent-engineering:generated:end'
const BLOCK = `${START}\n/.dev/\n${END}\n`
const OWNED = ['.dev/runs', '.dev/work', '.dev/completed', '.dev/context', '.dev/knowledge', '.dev/rules']

function within(root, path) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function ensureArtifactIgnore(projectRoot, { untrack = false } = {}) {
  const root = realpathSync(resolve(projectRoot))
  const path = join(root, '.gitignore')
  if (existsSync(path)) {
    const info = lstatSync(path)
    if (!info.isFile() || !within(root, realpathSync(path))) {
      throw new Error('.gitignore is not a regular file within the project')
    }
  }
  const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const start = current.indexOf(START)
  const end = current.indexOf(END)
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    throw new Error('.gitignore has an incomplete Agent Engineering block')
  }
  const withoutBlock = start === -1 ? current : current.slice(0, start) + current.slice(end + END.length).replace(/^\r?\n/, '')
  const next = `${withoutBlock.trimEnd()}${withoutBlock.trim() ? '\n\n' : ''}${BLOCK}`
  if (next !== current) writeFileSync(path, next, 'utf8')

  let untracked = 0
  let trackedRemaining = []
  let paths
  try {
    paths = execFileSync('git', ['ls-files', '-z', '--', ...OWNED], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean)
  } catch { return { updated: next !== current, untracked, trackedRemaining } }
  if (untrack && paths.length) {
    try {
      execFileSync('git', ['rm', '--cached', '-r', '--ignore-unmatch', '--', ...OWNED],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      untracked = paths.length
    } catch {
      throw new Error('tracked .dev artifacts could not be removed from the Git index safely; resolve staged changes and retry')
    }
  } else trackedRemaining = paths
  return { updated: next !== current, untracked, trackedRemaining }
}
