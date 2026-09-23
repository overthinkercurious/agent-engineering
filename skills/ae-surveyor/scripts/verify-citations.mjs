#!/usr/bin/env node
// verify-citations.mjs - resolve every path:line citation in the knowledge base.
//
// Stage 5 promises this check in words: "every path:line citation in the five
// knowledge files actually resolves (mechanical: file exists, line is in
// range)". Nothing implemented it, so a surveyed knowledge base could cite
// lines that do not exist and nothing would notice - which quietly poisons
// every role that reads it, because a citation is the whole basis on which a
// claim is tagged OBSERVED.
//
// This is deliberately mechanical. It proves a citation RESOLVES; it cannot
// prove the cited line says what the claim says it says. That remains the
// independent pass's job, and the output says so.
//
// Usage: node verify-citations.mjs [--root DIR] [--dir DIR] [--quiet]
// Exit:  0 all citations resolve (or none were made), 1 some do not, 2 setup error

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ROOT = resolve(arg('--root', process.cwd()))
const DIR = resolve(arg('--dir', join(ROOT, '.dev', 'knowledge')))
const QUIET = argv.includes('--quiet')

const rel = relative(ROOT, DIR)
if (rel.startsWith('..') || isAbsolute(rel)) {
  process.stderr.write(`--dir escapes the project root: ${DIR}\n`); process.exit(2)
}
if (!existsSync(DIR)) {
  process.stderr.write(`no knowledge base at ${DIR}\nRun ae-surveyor stages 1-3 first.\n`); process.exit(2)
}

// A citation is a path with an extension followed by a line or line range.
// Requiring the extension is what keeps "npm run test:coverage" and
// "http://host:8080" out of the results - a false positive here would train
// people to ignore real ones.
// The leading dot is optional so a citation into .github/, .claude-plugin/
// or .dev/ resolves as written. Without it the match started one character
// late and every such citation was reported as a missing file - a false
// failure, which trains people to ignore the real ones.
const CITATION = /(?<![A-Za-z0-9_])(\.?[A-Za-z0-9_][A-Za-z0-9_./\\-]*\.[A-Za-z0-9]{1,12}):(\d+)(?:-(\d+))?\b/g
const SKIP_PREFIX = /^(https?|ftp|mailto):/i

const lineCount = new Map()
function linesIn(path) {
  if (lineCount.has(path)) return lineCount.get(path)
  let n = null
  try {
    if (statSync(path).isFile()) n = readFileSync(path, 'utf8').split('\n').length
  } catch { n = null }
  lineCount.set(path, n)
  return n
}

const results = []
for (const name of readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) {
  const file = join(DIR, name)
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    // A fenced snapshot comment cites the analysis, not the repository.
    if (line.includes('agent-engineering:snapshot') || SKIP_PREFIX.test(line.trim())) return
    for (const match of line.matchAll(CITATION)) {
      const [, cited, startRaw, endRaw] = match
      if (SKIP_PREFIX.test(cited)) continue
      const target = join(ROOT, cited.replaceAll('\\', '/'))
      const inRoot = !relative(ROOT, target).startsWith('..')
      const total = inRoot ? linesIn(target) : null
      const start = Number(startRaw)
      const end = endRaw ? Number(endRaw) : start
      let status = 'OK'
      let detail = `${total} line(s)`
      if (!inRoot) { status = 'OUTSIDE'; detail = 'path resolves outside the project root' }
      else if (total === null) { status = 'NO FILE'; detail = 'file does not exist' }
      else if (start < 1 || end < start) { status = 'BAD RANGE'; detail = 'line range is not ascending' }
      else if (end > total) { status = 'OUT OF RANGE'; detail = `file has ${total} line(s)` }
      results.push({ doc: name, at: index + 1, citation: match[0], status, detail })
    }
  })
}

const broken = results.filter((r) => r.status !== 'OK')
if (!QUIET) {
  process.stdout.write(`\ncitation check - ${relative(ROOT, DIR).replaceAll('\\', '/')}\n\n`)
  if (!results.length) {
    process.stdout.write('  no path:line citations found.\n')
    process.stdout.write('  A knowledge base with no citations has nothing tagged OBSERVED,\n')
    process.stdout.write('  which is itself worth checking before trusting it.\n\n')
  } else {
    for (const item of broken) {
      process.stdout.write(`  ${item.status.padEnd(12)} ${item.citation}\n`)
      process.stdout.write(`  ${''.padEnd(12)} ${item.doc}:${item.at} - ${item.detail}\n`)
    }
    const ok = results.length - broken.length
    process.stdout.write(`${broken.length ? '\n' : ''}  ${ok}/${results.length} citation(s) resolve.\n`)
    if (broken.length) {
      process.stdout.write('\n  A claim whose citation does not resolve is not OBSERVED. Repair the\n')
      process.stdout.write('  citation or downgrade the claim to UNKNOWN; do not leave it tagged.\n')
    } else {
      process.stdout.write('\n  Resolving proves the line exists, not that it says what the claim says.\n')
      process.stdout.write('  That remains the independent pass\'s job.\n')
    }
    process.stdout.write('\n')
  }
}

process.exit(broken.length ? 1 : 0)
