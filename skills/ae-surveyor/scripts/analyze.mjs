#!/usr/bin/env node
/**
 * analyze.mjs - mechanical analysis of a project. Zero tokens, zero deps.
 *
 * Node rather than Python because installing this suite goes through `npx`,
 * which proves Node exists on the machine. Python does not, particularly on
 * Windows.
 *
 * Every file in the project is processed here. That is what makes the coverage
 * claim at the end honest: this pass is 100%, and it reports exactly which
 * files the model still needs to read and why, rather than sampling quietly.
 *
 * Usage:
 *   node analyze.mjs [--root DIR] [--budget-tokens N] [--depth ranked|full]
 *                    [--out FILE] [--estimate]
 */

import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, extname, basename, dirname, isAbsolute, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { sense, manifestKind, redact } from './sense.mjs'

// ---------------------------------------------------------------- args ------

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}
const has = (name) => argv.includes(name)

const ROOT = resolveRoot(arg('--root', process.cwd()))
const BUDGET = parseInt(arg('--budget-tokens', '120000'), 10)
const DEPTH = arg('--depth', 'ranked')
const OUT = canonicalPath(arg('--out', join(ROOT, '.dev', 'context', 'analysis.json')))
const ESTIMATE_ONLY = has('--estimate')
if (!Number.isSafeInteger(BUDGET) || BUDGET < 1 || !['ranked', 'full'].includes(DEPTH)) {
  process.stderr.write('Use a positive integer --budget-tokens and --depth ranked|full.\n')
  process.exit(2)
}

// Windows may expose the same directory through both an 8.3 alias
// (RUNNER~1) and its long name. Canonicalize the nearest existing ancestor so
// containment checks compare one spelling even when the output does not exist.
function canonicalPath(value) {
  const absolute = resolve(value)
  let existing = absolute
  const missing = []
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) return absolute
    missing.unshift(basename(existing))
    existing = parent
  }
  try { return resolve(realpathSync(existing), ...missing) }
  catch { return absolute }
}

function resolveRoot(p) {
  try {
    const top = execFileSync('git', ['-C', p, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return canonicalPath(top)
  } catch { return canonicalPath(p) }
}

const outRelative = relative(ROOT, OUT)
if (outRelative.startsWith('..') || isAbsolute(outRelative)) {
  process.stderr.write(`--out escapes the project root: ${OUT}\n`)
  process.exit(2)
}

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch { return '' }
}

// ------------------------------------------------------------ language ------

const LANG = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin', '.swift': 'swift', '.php': 'php', '.cs': 'csharp',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp',
  '.svelte': 'svelte', '.vue': 'vue', '.dart': 'dart', '.ex': 'elixir', '.exs': 'elixir',
  '.scala': 'scala', '.sh': 'shell', '.bash': 'shell', '.sql': 'sql',
  '.css': 'css', '.scss': 'css', '.less': 'css',
  '.html': 'html', '.md': 'markdown', '.mdx': 'markdown',
  '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml', '.xml': 'xml',
}
const CODE = new Set(['typescript', 'javascript', 'python', 'ruby', 'go', 'rust', 'java',
  'kotlin', 'swift', 'php', 'csharp', 'c', 'cpp', 'svelte', 'vue', 'dart', 'elixir', 'scala', 'sql'])

// Import extraction per language. Group 1 is always the module specifier.
const IMPORTS = {
  typescript: [/^\s*import\s[^'"]*from\s*['"]([^'"]+)['"]/gm, /^\s*export\s[^'"]*from\s*['"]([^'"]+)['"]/gm,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm],
  python: [/^\s*from\s+([.\w]+)\s+import\s/gm, /^\s*import\s+([.\w]+)/gm],
  go: [/^\s*(?:[\w.]+\s+)?"([^"]+)"\s*$/gm],
  rust: [/^\s*use\s+([\w:]+)/gm],
  java: [/^\s*import\s+(?:static\s+)?([\w.]+);/gm],
  kotlin: [/^\s*import\s+([\w.]+)/gm],
  ruby: [/\brequire(?:_relative)?\s+['"]([^'"]+)['"]/g],
  php: [/^\s*use\s+([\w\\]+)\s*;/gm],
  csharp: [/^\s*using\s+([\w.]+)\s*;/gm],
  elixir: [/^\s*(?:import|alias|use)\s+([\w.]+)/gm],
  scala: [/^\s*import\s+([\w.]+)/gm],
}
IMPORTS.javascript = IMPORTS.typescript
IMPORTS.svelte = IMPORTS.typescript
IMPORTS.vue = IMPORTS.typescript

// Route extraction. Group 1 is the path, or the file itself is the route.
const ROUTE_PATTERNS = [
  { fw: 'express/koa/fastify', re: /\.\s*(get|post|put|patch|delete|all|head|options)\s*\(\s*['"`](\/[^'"`]*)['"`]/g, m: 1, p: 2 },
  { fw: 'fastapi', re: /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g, m: 1, p: 2 },
  { fw: 'flask', re: /@(?:app|bp|blueprint)\.route\s*\(\s*['"]([^'"]+)['"]/g, p: 1 },
  { fw: 'django', re: /\bpath\s*\(\s*['"]([^'"]*)['"]/g, p: 1, only: /urls\.py$/ },
  { fw: 'rails', re: /^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/gm, m: 1, p: 2, only: /routes\.rb$/ },
  { fw: 'spring', re: /@(?:Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g, p: 1 },
  { fw: 'go-http', re: /\.(?:HandleFunc|Handle)\s*\(\s*["']([^"']+)["']/g, p: 1 },
]
// Convention-routed frameworks: the path IS the file path.
const FILE_ROUTES = [
  { fw: 'next-app', re: /(?:^|\/)app\/.*\/(page|route|layout)\.(tsx?|jsx?)$/ },
  { fw: 'next-pages', re: /(?:^|\/)pages\/.*\.(tsx?|jsx?)$/ },
  { fw: 'sveltekit', re: /(?:^|\/)src\/routes\/.*\/\+(page|server|layout)[\w.]*\.(svelte|ts|js)$/ },
  { fw: 'remix', re: /(?:^|\/)app\/routes\/.*\.(tsx?|jsx?)$/ },
  { fw: 'nuxt', re: /(?:^|\/)pages\/.*\.vue$/ },
]

const SCHEMA_HINTS = [
  { kind: 'prisma', re: /schema\.prisma$/ },
  { kind: 'migration', re: /(^|\/)(migrations?|migrate)\//i },
  { kind: 'sql', re: /\.sql$/ },
  { kind: 'django-model', re: /models\.py$/ },
  { kind: 'typeorm-entity', re: /\.entity\.(ts|js)$/ },
  { kind: 'drizzle', re: /(^|\/)(schema|db)\/.*\.(ts|js)$/ },
]

// Paths whose blast radius is high regardless of how they rank numerically.
const RISK = [
  { tag: 'auth', re: /(^|[\/_-])(auth|authn|authz|login|session|oauth|jwt|token|password|permission|rbac|tenant)/i },
  { tag: 'money', re: /(^|[\/_-])(payment|billing|invoice|charge|refund|stripe|subscription|price|checkout|transaction|ledger|balance|account|amount|money|cash)/i },
  { tag: 'data', re: /(^|[\/_-])(migration|schema|seed|backfill|sync|restore|wipe|rls|policy)/i },
  { tag: 'secrets', re: /(^|[\/_-])(secret|credential|vault|keystore|encrypt|crypto)/i },
  { tag: 'external', re: /(^|[\/_-])(webhook|callback|integration)/i },
  { tag: 'ai', re: /(^|[\/_-])(llm|prompt|embedding|completion|anthropic|openai)/i },
]

const GENERATED = [
  /(^|\/)node_modules\//, /(^|\/)vendor\//, /(^|\/)dist\//, /(^|\/)build\//,
  /(^|\/)out\//, /(^|\/)\.next\//, /(^|\/)\.nuxt\//, /(^|\/)target\//,
  /(^|\/)__pycache__\//, /(^|\/)\.venv\//, /(^|\/)venv\//, /(^|\/)coverage\//,
  /\.min\.(js|css)$/, /[-.]lock\.(json|yaml|yml)$/, /(^|\/)(package-lock|yarn|pnpm-lock|poetry|Cargo|composer|Gemfile)\.(json|lock)$/,
  /\.(generated|gen)\.[\w]+$/, /(^|\/)\.git\//, /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp4|mp3|pdf|zip|gz|jar|so|dylib|dll|wasm)$/i,
]
const TEST = [/(^|\/)(tests?|__tests__|spec|e2e|cypress|playwright)\//i, /\.(test|spec)\.[\w]+$/, /_test\.\w+$/, /(^|\/)test_\w+\.py$/]
// Documentation and example trees. Real project files, but not this project's
// behaviour: a framework's docs_src is full of @app.get examples that are not
// its routes, and filenames like schema_extra_example trip the risk patterns.
const EXAMPLE = [/(^|\/)(docs?_src|docs?|examples?|samples?|demos?|fixtures?|__fixtures__|website|site|playground|benchmarks?)\//i]

const isAny = (list, p) => list.some((re) => re.test(p))
const OMIT = /(^|\/)(?:\.git|\.dev|\.agents\/skills|\.claude\/skills|\.gemini\/[^/]*skills|\.codex\/skills)(?:\/|$)/
const SENSITIVE = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|credentials(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|id_rsa|id_ed25519)$|\.(?:pem|p12|pfx|jks|keystore|key)$/i
const safePath = (p) => {
  if (OMIT.test(p) || SENSITIVE.test(p)) return false
  try { const r = relative(ROOT, realpathSync(join(ROOT, p))); return !r.startsWith('..') && !isAbsolute(r) }
  catch { return false }
}

// -------------------------------------------------------------- walk --------

function fileList() {
  const out = sh('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  if (out.length) return [...new Set(out.split('\0').filter(Boolean))].sort()
  // Not a git repo: walk manually, skipping the obvious.
  const acc = []
  const walk = (dir) => {
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = join(dir, e.name)
      const rel = relative(ROOT, full).split(sep).join('/')
      if (e.isSymbolicLink() || OMIT.test(rel) || SENSITIVE.test(rel) || (e.isDirectory() && isAny(GENERATED, rel + '/'))) continue
      if (e.isDirectory()) walk(full)
      else acc.push(rel)
    }
  }
  walk(ROOT)
  return acc
}

// ------------------------------------------------------------ analyze -------

const files = []
const byLang = {}
const excluded = { generated: 0, binary: 0, toolarge: 0, unreadable: 0 }
const importEdges = []
const externalDeps = {}
const routes = []
const routeSeen = new Set()
const addRoute = (r) => {
  const k = `${r.path}|${r.method || ''}|${r.route}`
  if (routeSeen.has(k)) return
  routeSeen.add(k); routes.push(r)
}
const schemaFiles = []
const envVars = new Set()
const texts = new Map()
const sourceHashes = new Map()
const symbols = new Map()
const packages = new Set()
let totalLoc = 0

const ENV_RE = /(?:process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]|os\.environ(?:\.get)?[\[\(]['"]([A-Z_][A-Z0-9_]*)['"]|os\.getenv\(['"]([A-Z_][A-Z0-9_]*)['"]|ENV\[['"]([A-Z_][A-Z0-9_]*)['"]\])/g

const discoveredPaths = fileList()
const allPaths = discoveredPaths.filter(safePath)
excluded.sensitive_or_outside = discoveredPaths.length - allPaths.length

for (const rel of allPaths) {
  const abs = join(ROOT, rel)
  let st
  try { st = statSync(abs) } catch { excluded.unreadable++; continue }
  if (!st.isFile()) continue

  const ext = extname(rel).toLowerCase()
  const lang = LANG[ext] || 'other'
  const generated = isAny(GENERATED, rel)
  const test = isAny(TEST, rel)

  const example = isAny(EXAMPLE, rel)
  const rec = { path: rel, bytes: st.size, lang, generated, test, example, loc: 0, risk: [], fan_in: 0, churn: 0 }
  if (!example) for (const r of RISK) if (r.re.test(rel)) rec.risk.push(r.tag)
  if (!example) for (const s of SCHEMA_HINTS) if (s.re.test(rel)) { schemaFiles.push({ path: rel, kind: s.kind }); break }
  if (!example && lang === 'sql' && !rec.risk.includes('data')) rec.risk.push('data')
  if (!test && !generated && !example) {
    for (const f of FILE_ROUTES) if (f.re.test(rel)) addRoute({ path: rel, framework: f.fw, route: rel })
    const endpoint = rel.match(/(?:^|\/)supabase\/functions\/([^/]+)\/index\.ts$/)
    if (endpoint && !/^_|tests?$/.test(endpoint[1])) addRoute({ path: rel, framework: 'supabase-function', route: endpoint[1], method: null })
  }

  files.push(rec)
  if (generated) { excluded.generated++; continue }
  if (st.size > 2 * 1024 * 1024) { excluded.toolarge++; continue }

  let text
  try { text = readFileSync(abs, 'utf8') } catch { excluded.unreadable++; continue }
  if (text.includes('\u0000')) { excluded.binary++; continue }
  rec.parsed = true
  texts.set(rel, text)
  sourceHashes.set(rel, createHash('sha256').update(text).digest('hex'))
  if (lang === 'kotlin' || lang === 'java') {
    const pkg = text.match(/^\s*package\s+([\w.]+)/m)?.[1]
    if (pkg) {
      packages.add(pkg)
      const names = [basename(rel).replace(/\.[^.]+$/, ''), ...[...text.matchAll(/\b(?:class|interface|object|fun|val|var|typealias|enum)\s+([A-Za-z_]\w*)/g)].map((m) => m[1])]
      for (const name of names) {
        const key = `${pkg}.${name}`
        const existing = symbols.get(key) || new Set()
        existing.add(rel); symbols.set(key, existing)
      }
    }
  }

  rec.loc = text.length ? text.split('\n').length : 0
  totalLoc += rec.loc
  byLang[lang] = byLang[lang] || { files: 0, loc: 0 }
  byLang[lang].files++; byLang[lang].loc += rec.loc

  // imports
  const pats = IMPORTS[lang]
  if (pats) {
    for (const re of pats) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text)) !== null) {
        const spec = m[1]
        if (!spec) continue
        // Classify after resolution, not before. A specifier with no leading
        // dot can still be internal: Python `from app.models import X`, Go
        // `github.com/org/repo/pkg`, Java package paths. Deciding by prefix is
        // what made Python fan-in come out as zero.
        importEdges.push([rel, lang, spec])
      }
    }
  }

  // Routes declared in code. Tests and docs are excluded: a framework's own
  // test suite is full of `.get('/foo')` calls that are not this project's
  // routes, and counting them inflates the route list into noise.
  if (!test && !example && CODE.has(lang)) {
    for (const rp of ROUTE_PATTERNS) {
      if (rp.only && !rp.only.test(rel)) continue
      rp.re.lastIndex = 0
      let m
      while ((m = rp.re.exec(text)) !== null) {
        addRoute({ path: rel, framework: rp.fw, method: rp.m ? m[rp.m].toUpperCase() : null, route: m[rp.p] })
        if (routes.length > 5000) break
      }
    }
  }

  // env surface
  ENV_RE.lastIndex = 0
  let em
  while ((em = ENV_RE.exec(text)) !== null) {
    const v = em[1] || em[2] || em[3] || em[4] || em[5]
    if (v) envVars.add(v)
  }
  for (const m of text.matchAll(/Deno\.env\.get\(\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\)/g)) envVars.add(m[1])
}

const { stack, commands, components, warnings: sensingWarnings } = sense(allPaths, (p) => texts.get(p) ?? null)
for (const component of components) {
  component.entrypoints = routes.filter((r) => component.root === '.' || r.path.startsWith(component.root + '/')).map((r) => r.path)
  for (const entry of commands.entries) if (entry.origin === 'ci' && entry.cwd === component.root) component.commands.push(entry.id)
}

// ---------------------------------------------------- resolve fan-in --------

const byPath = new Map(files.map((f) => [f.path, f]))
const posix = (p) => p.split(sep).join('/').replace(/^\.\//, '')
const JS_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.svelte', '.vue',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx']
const SRC_ROOTS = ['', 'src/', 'app/', 'lib/', 'packages/', 'internal/', 'pkg/']

// Go module prefix, so `github.com/org/repo/pkg/x` resolves to `pkg/x`.
const goMod = (read0('go.mod') || '').match(/^module\s+(\S+)/m)
const GO_PREFIX = goMod ? goMod[1] : null
function read0(p) { return texts.get(p) ?? null }

function candidates(lang, fromFile, spec) {
  const dir = dirname(fromFile)
  const out = []
  if (lang === 'python') {
    if (spec.startsWith('.')) {
      const m = spec.match(/^(\.+)(.*)$/)
      let base = dir
      for (let i = 0; i < m[1].length - 1; i++) base = dirname(base)
      const rest = m[2].split('.').filter(Boolean).join('/')
      const p = posix(rest ? join(base, rest) : base)
      out.push(p + '.py', p + '/__init__.py')
    } else {
      const p = spec.split('.').join('/')
      for (const sr of SRC_ROOTS) out.push(sr + p + '.py', sr + p + '/__init__.py')
    }
  } else if (lang === 'go') {
    let p = spec
    if (GO_PREFIX && p.startsWith(GO_PREFIX)) p = p.slice(GO_PREFIX.length).replace(/^\//, '')
    else if (p.includes('.')) return out       // external module path
    if (p) out.push(p, p + '.go')
  } else if (lang === 'java' || lang === 'kotlin' || lang === 'scala' || lang === 'csharp') {
    let symbol = spec
    while (symbol.includes('.')) {
      const matches = symbols.get(symbol)
      if (matches?.size === 1) { out.push([...matches][0]); break }
      symbol = symbol.slice(0, symbol.lastIndexOf('.'))
    }
    const p = spec.split('.').join('/')
    for (const sr of ['src/main/java/', 'src/main/kotlin/', 'src/', '']) out.push(sr + p + '.java', sr + p + '.kt', sr + p + '.scala', sr + p + '.cs')
  } else if (lang === 'rust') {
    const p = spec.split('::').slice(1).join('/')
    if (p) out.push('src/' + p + '.rs', 'src/' + p + '/mod.rs')
  } else {
    // JS family and everything else
    if (spec.startsWith('.')) {
      const base = posix(join(dir, spec))
      for (const e of JS_EXT) out.push(base + e)
    } else if (/^[@~]\//.test(spec) || spec.startsWith('/')) {
      const tail = spec.replace(/^[@~]\//, '').replace(/^\//, '')
      for (const sr of SRC_ROOTS) for (const e of JS_EXT) out.push(sr + tail + e)
    }
  }
  return out
}

let resolvedEdges = 0, unresolvedInternal = 0, externalEdges = 0, unknownEdges = 0
const resolvedImports = []
const unresolvedImports = []
const declaredDeps = new Set(stack.manifests.flatMap((m) => [...Object.keys(m.deps || {}), ...Object.keys(m.devDeps || {})]))
for (const [from, lang, spec] of importEdges) {
  let hit = null
  for (const c of candidates(lang, from, spec)) if (byPath.has(c)) { hit = c; break }
  if (hit) { byPath.get(hit).fan_in++; resolvedEdges++; resolvedImports.push({ from, to: hit }) }
  else {
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/')
      : spec.replace(/^\.+/, '').split(/[/.:]/)[0]
    const internal = spec.startsWith('.') || /^[@~]\//.test(spec) || [...packages].some((p) => spec.startsWith(p + '.'))
    const external = declaredDeps.has(pkg) || /^(?:node:|npm:|jsr:|https?:)/.test(spec)
      || /^(?:java|javax|kotlin|kotlinx|android|androidx|org\.junit)\./.test(spec)
    if (internal) { unresolvedInternal++; unresolvedImports.push({ from, specifier: spec }) }
    else if (external) { externalEdges++; if (pkg) externalDeps[pkg] = (externalDeps[pkg] || 0) + 1 }
    else { unknownEdges++; unresolvedImports.push({ from, specifier: spec }) }
  }
}

// ------------------------------------------------------------- churn --------

const churnRaw = sh('git', ['log', '--since=12.months', '--numstat', '--format=%H', '--no-merges'])
let commitsSeen = 0
for (const line of churnRaw.split('\n')) {
  if (/^[0-9a-f]{40}$/.test(line)) { commitsSeen++; continue }
  const parts = line.split('\t')
  if (parts.length === 3) {
    const p = parts[2]
    const rec = byPath.get(p)
    if (rec) rec.churn++
  }
}

// test coverage proxy: does a test file mention this file's basename?
const testBodies = files.filter((f) => f.test && f.parsed).map((f) => texts.get(f.path)).join('\n')
for (const f of files) {
  if (f.test || f.generated || !CODE.has(f.lang)) continue
  const stem = basename(f.path).replace(/\.\w+$/, '')
  f.has_test = stem.length > 2 && testBodies.includes(stem)
}

// ----------------------------------------------------------- ranking --------

const code = files.filter((f) => f.parsed && CODE.has(f.lang) && !f.test && !f.example)
// The most-imported files are the load-bearing ones by definition. Force them
// in regardless of score: a file with 648 inbound imports is the thing every
// other file depends on, and missing it makes the whole map wrong.
const topFanIn = new Set([...code].sort((a, b) => (b.fan_in || 0) - (a.fan_in || 0))
  .filter((f) => f.fan_in > 0).slice(0, 20).map((f) => f.path))
const max = (k) => Math.max(1, ...code.map((f) => f[k] || 0))
const maxFan = max('fan_in'), maxChurn = max('churn'), maxLoc = max('loc')
const routeFiles = new Set(routes.map((r) => r.path))
const schemaSet = new Set(schemaFiles.map((s) => s.path))

for (const f of code) {
  const fan = (f.fan_in || 0) / maxFan
  const ch = (f.churn || 0) / maxChurn
  const size = Math.min(1, (f.loc || 0) / maxLoc)
  const risk = f.risk.length ? 1 : 0
  const isRoute = routeFiles.has(f.path) ? 1 : 0
  const untested = f.has_test ? 0 : 1
  // Weighted sum, not a product: a product zeroes out entry points, which have
  // fan-in 0 by definition and are exactly the files you must read.
  f.score = 0.30 * fan + 0.25 * ch + 0.15 * size + 0.15 * risk + 0.10 * isRoute + 0.05 * untested
  f.must_read = risk === 1 || isRoute === 1 || schemaSet.has(f.path) || topFanIn.has(f.path)
}
code.sort((a, b) => b.score - a.score)

const estTokens = (f) => Math.ceil(f.bytes / 4)
const selected = []
const deferred = []
let spent = 0
const controlCandidates = files.filter((f) => f.parsed && (manifestKind(f.path) || /(?:^|\/)(?:AGENTS|CLAUDE|README|DESIGN|ARCHITECTURE|CONTRIBUTING)(?:\.[^/]*)?$/i.test(f.path)
  || /^\.github\/workflows\/.+\.ya?ml$/.test(f.path) || /(?:^|\/)(?:Makefile|\.gitignore|tsconfig[^/]*\.json|Dockerfile)$/.test(f.path)))
  .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
const controls = []
const deferredControls = []
// Reserve room for source even when documentation is large. Record every omission.
const controlBudget = DEPTH === 'full' ? Infinity : Math.floor(BUDGET * 0.2)
for (const f of controlCandidates) {
  if (spent + estTokens(f) > controlBudget) { deferredControls.push(f.path); continue }
  controls.push(f.path); spent += estTokens(f)
}
if (DEPTH === 'full') {
  for (const f of code) { selected.push(f); spent += estTokens(f) }
} else {
  // Must-read files fill the budget first, highest score first. They are not
  // exempt from it: silently blowing past a budget the operator set is worse
  // than saying plainly which high-signal files did not fit.
  for (const f of code.filter((x) => x.must_read)) {
    const c = estTokens(f)
    if (spent + c > BUDGET) { deferred.push(f); continue }
    selected.push(f); spent += c
  }
  for (const f of code.filter((x) => !x.must_read)) {
    const c = estTokens(f)
    if (spent + c > BUDGET) continue
    selected.push(f); spent += c
  }
}

const selSet = new Set(selected.map((f) => f.path))
const totalFan = code.reduce((s, f) => s + (f.fan_in || 0), 0)
const coveredFan = code.filter((f) => selSet.has(f.path)).reduce((s, f) => s + (f.fan_in || 0), 0)
const riskFiles = code.filter((f) => f.risk.length)

// ----------------------------------------------- manifests / commands -------

const read = (p) => texts.get(p) ?? null
const readJson = (p) => { const t = read(p); if (!t) return null; try { return JSON.parse(t) } catch { return null } }


// ---------------------------------------------------------- deployment ------

const deployment = { containers: [], platforms: [], env_example: null, env_vars: [...envVars].sort(), iac: [] }
for (const f of allPaths) {
  if (/(^|\/)Dockerfile(\.\w+)?$/.test(f)) deployment.containers.push({ file: f })
  else if (/(^|\/)(docker-compose|compose)\.ya?ml$/.test(f)) deployment.containers.push({ file: f })
  else if (/^(vercel\.json|netlify\.toml|fly\.toml|render\.yaml|app\.yaml|Procfile|serverless\.ya?ml|railway\.json|amplify\.yml)$/.test(f))
    deployment.platforms.push({ file: f })
  else if (/(^|\/)(k8s|kubernetes|helm|terraform|\.tf)($|\/)/.test(f) || /\.tf$/.test(f)) deployment.iac.push(f)
}

// ------------------------------------------------- existing enforcement -----

const enforcement = {}
for (const [key, f] of [['typescript', 'tsconfig.json'], ['eslint', '.eslintrc.json'],
  ['eslint_flat', 'eslint.config.js'], ['prettier', '.prettierrc'], ['ruff', 'ruff.toml'],
  ['ruff_py', 'pyproject.toml'], ['golangci', '.golangci.yml'], ['editorconfig', '.editorconfig'],
  ['precommit', '.pre-commit-config.yaml']]) {
  if (existsSync(join(ROOT, f))) enforcement[key] = f
}
const tsconf = readJson('tsconfig.json')
if (tsconf) enforcement.typescript_options = tsconf.compilerOptions || {}

// -------------------------------------------------------------- emit --------

const head = sh('git', ['rev-parse', 'HEAD']).trim() || null
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim() || null
const gitStatus = sh('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
const changedFiles = []
const statusFields = gitStatus.split('\0').filter(Boolean)
for (let i = 0; i < statusFields.length; i++) {
  const status = statusFields[i].slice(0, 2), path = statusFields[i].slice(3)
  if (!OMIT.test(path)) changedFiles.push(path)
  if (/[RC]/.test(status)) i++
}
const sources = [...sourceHashes].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 }))
const fingerprint = createHash('sha256').update(JSON.stringify(sources)).digest('hex')
const parsedCount = files.filter((f) => f.parsed).length
const pct = (n, d) => d ? +(n / d * 100).toFixed(1) : null

const result = {
  schema: 2,
  generated_at: new Date().toISOString(),
  root: ROOT,
  git: { head, branch, commits_last_12mo: commitsSeen, is_repo: !!head, dirty: !!gitStatus, changed_files: [...new Set(changedFiles)].sort() },
  provenance: { fingerprint, sources, source_count: sources.length, method: 'sha256 of inspected UTF-8 file contents; excluded files are outside this snapshot' },
  inventory: {
    total_files: files.length,
    total_loc: totalLoc,
    by_language: Object.fromEntries(Object.entries(byLang).sort((a, b) => b[1].loc - a[1].loc)),
    excluded,
    test_files: files.filter((f) => f.test && !f.generated).length,
  },
  stack: { ...stack, external_imports: Object.fromEntries(Object.entries(externalDeps).sort((a, b) => b[1] - a[1]).slice(0, 60)) },
  commands,
  components,
  warnings: sensingWarnings,
  deployment,
  enforcement,
  imports: { edges_found: importEdges.length, edges_resolved: resolvedEdges,
    internal_resolved: resolvedEdges, internal_unresolved: unresolvedInternal, external: externalEdges, unknown: unknownEdges,
    resolution_pct: pct(resolvedEdges, resolvedEdges + unresolvedInternal),
    edges: resolvedImports, unresolved: unresolvedImports },
  routes: routes.slice(0, 1000),
  schema_files: schemaFiles,
  risk_files: riskFiles.map((f) => ({ path: f.path, tags: f.risk })),
  ranking: code.slice(0, 400).map((f) => ({
    path: f.path, score: +f.score.toFixed(4), fan_in: f.fan_in, churn: f.churn,
    loc: f.loc, risk: f.risk, has_test: !!f.has_test, must_read: !!f.must_read,
  })),
  selection: {
    depth: DEPTH,
    budget_tokens: DEPTH === 'full' ? null : BUDGET,
    files: selected.map((f) => f.path),
    control_files: controls,
    deferred_control_files: deferredControls,
    est_tokens: spent,
    deferred_high_signal: deferred.map((f) => ({ path: f.path, risk: f.risk, est_tokens: estTokens(f) })),
  },
  coverage: {
    files_parsed: parsedCount,
    files_parsed_pct: pct(parsedCount, files.length),
    code_files: code.length,
    files_to_model_read: selected.length,
    files_to_model_read_pct: code.length ? +(selected.length / code.length * 100).toFixed(1) : 0,
    fan_in_weight_covered_pct: pct(coveredFan, totalFan),
    route_detection: routeFiles.size ? 'detected' : 'unknown',
    route_files_covered_pct: routeFiles.size
      ? +([...routeFiles].filter((p) => selSet.has(p)).length / routeFiles.size * 100).toFixed(1) : null,
    risk_files_covered_pct: riskFiles.length
      ? +(riskFiles.filter((f) => selSet.has(f.path)).length / riskFiles.length * 100).toFixed(1) : null,
    not_read: {
      generated_or_vendored: excluded.generated,
      tests: files.filter((f) => f.test && !f.generated).length,
      non_code: files.filter((f) => !f.generated && !CODE.has(f.lang)).length,
      docs_and_examples: files.filter((f) => f.example && !f.generated).length,
      low_signal_code: code.length - selected.length,
    },
    caveats: [
      'Import edges come from regex, not a parser. Dynamic and computed imports are missed, so fan-in is a lower bound.',
      'Token estimates are bytes/4 and are approximate.',
      'Test coverage here is a filename-mention heuristic, not a coverage report.',
      'Selected-file coverage describes a proposed reading set, not a completed audit. No findings are validated by this sensor.',
      'Route discovery is convention-based and incomplete. Zero detected routes means unknown, not complete coverage.',
      'Unclassified imports remain unknown, not external. Fan-in measures only resolved edges.',
      'CI parsing supports ordinary GitHub Actions mappings and literal run blocks. Other forms need source review.',
    ],
  },
}

function summary(r) {
  const c = r.coverage
  const L = []
  L.push('')
  L.push(`project   ${r.root}`)
  L.push(`git       ${r.git.branch || 'not a repo'}${r.git.head ? ' @ ' + r.git.head.slice(0, 8) : ''}  ${r.git.commits_last_12mo} commits in 12mo`)
  L.push('')
  L.push(`parsed    ${c.files_parsed} files, ${r.inventory.total_loc.toLocaleString()} lines  (${c.files_parsed_pct ?? 'unknown'}% of inventoried files)`)
  const langs = Object.entries(r.inventory.by_language).slice(0, 6)
    .map(([k, v]) => `${k} ${v.files}`).join(', ')
  L.push(`languages ${langs}`)
  L.push(`routes    ${r.routes.length}   schema files ${r.schema_files.length}   risk-flagged ${r.risk_files.length}`)
  L.push('')
  L.push(`to read   ${c.files_to_model_read} of ${c.code_files} code files (${c.files_to_model_read_pct}%)  ~${r.selection.est_tokens.toLocaleString()} tokens`)
  L.push(`controls  ${r.selection.control_files.length} selected; ${r.selection.deferred_control_files.length} deferred`)
  L.push(`imports   ${r.imports.internal_resolved} resolved internal, ${r.imports.internal_unresolved} unresolved internal, ${r.imports.external} external, ${r.imports.unknown} unknown`)
  L.push(`  covering ${c.fan_in_weight_covered_pct ?? 'unknown'}% of resolved import fan-in weight`)
  L.push(`           ${c.route_files_covered_pct ?? 'unknown'}% of detected route files`)
  L.push(`           ${c.risk_files_covered_pct ?? 'unknown'}% of detected risk files`)
  L.push('')
  if (r.selection.deferred_high_signal.length) {
    L.push(`WARNING   ${r.selection.deferred_high_signal.length} high-signal files did not fit the ${r.selection.budget_tokens.toLocaleString()}-token budget.`)
    L.push(`          Raise --budget-tokens or use --depth full to include them.`)
    L.push('')
  }
  L.push(`not read  ${c.not_read.generated_or_vendored} generated or vendored`)
  L.push(`          ${c.not_read.tests} tests`)
  L.push(`          ${c.not_read.non_code} non-code`)
  L.push(`          ${c.not_read.docs_and_examples} docs and example trees`)
  L.push(`          ${c.not_read.low_signal_code} code files below the budget cut`)
  L.push('')
  return L.join('\n')
}

process.stdout.write(summary(result))
if (!ESTIMATE_ONLY) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(result, null, 2))
  process.stdout.write(`written   ${relative(ROOT, OUT) || OUT}\n\n`)
} else {
  process.stdout.write('estimate only - nothing written\n\n')
}
