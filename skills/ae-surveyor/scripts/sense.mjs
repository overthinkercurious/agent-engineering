// Bounded repository sensors. These report observations, never execute commands.
import { basename, posix } from 'node:path'

export const manifestKind = (file) => ({
  'package.json': 'node', 'deno.json': 'deno', 'deno.jsonc': 'deno',
  'build.gradle': 'gradle', 'build.gradle.kts': 'gradle',
  'settings.gradle': 'gradle', 'settings.gradle.kts': 'gradle',
  'gradle-wrapper.properties': 'gradle', 'libs.versions.toml': 'gradle',
  'pyproject.toml': 'python', 'requirements.txt': 'python', 'Pipfile': 'python',
  'go.mod': 'go', 'Cargo.toml': 'rust', 'Gemfile': 'ruby',
  'composer.json': 'php', 'pom.xml': 'maven',
}[basename(file)] || null)

export const commandKind = (value) => /type.?check|\btsc\b|deno check/i.test(value) ? 'typecheck'
  : /(?:^|[\s:_-])(?:test|check|verify|gate|vitest|jest)(?:$|[\s:_-])/i.test(value) ? 'test'
    : /lint/i.test(value) ? 'lint' : /build|assemble/i.test(value) ? 'build' : 'other'

// Do not persist environment values, credentials in URLs, or common secret flags.
export function redact(text) {
  return String(text).replace(/(\b[A-Z_][A-Z0-9_]*\s*=)\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s\n;]+)/g, '$1<redacted>')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1<redacted>@')
    .replace(/(--?(?:password|token|secret|api[-_]?key)(?:=|\s+))(?:"[^"\n]*"|'[^'\n]*'|[^\s\n]+)/gi, '$1<redacted>')
}

const scalar = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2')
const indent = (s) => s.length - s.trimStart().length
const scopeValue = (lines, key) => {
  const found = lines.find((l) => new RegExp(`^\\s*${key}:`).test(l))
  return found ? scalar(found.slice(found.indexOf(':') + 1)) : null
}

// A conservative reader for the ordinary GitHub Actions mapping/block subset.
// Unsupported YAML is reported; expressions remain literal and CI-only.
export function githubSteps(file, text) {
  const lines = text.split(/\r?\n/)
  const jobsIndex = lines.findIndex((l) => /^jobs:\s*(?:#.*)?$/.test(l))
  const warnings = []
  if (/^\s*(?:[^#\n]*:\s*[&*]|<<:)/m.test(text) || /\t/.test(text)) warnings.push('YAML anchors, aliases or tabs require manual review')
  if (jobsIndex < 0) return { steps: [], warnings: ['No supported jobs mapping detected'] }
  const global = lines.slice(0, jobsIndex)
  const envNames = (segment) => {
    const names = new Set([...segment.join('\n').matchAll(/\b(?:secrets|vars|env)\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))
    for (let i = 0; i < segment.length; i++) if (/^\s*env:\s*$/.test(segment[i])) {
      const level = indent(segment[i])
      for (let j = i + 1; j < segment.length && (!segment[j].trim() || indent(segment[j]) > level); j++) {
        const m = segment[j].match(/^\s*([A-Za-z_][A-Za-z0-9_]*):/)
        if (m) names.add(m[1])
      }
    }
    return [...names]
  }
  const jobStarts = []
  for (let i = jobsIndex + 1; i < lines.length; i++) if (/^  [\w.-]+:\s*(?:#.*)?$/.test(lines[i])) jobStarts.push(i)
  const steps = []
  for (let ji = 0; ji < jobStarts.length; ji++) {
    const start = jobStarts[ji], end = jobStarts[ji + 1] ?? lines.length
    const job = lines[start].trim().split(':')[0]
    const stepStart = lines.findIndex((l, i) => i > start && i < end && /^    steps:\s*$/.test(l))
    if (stepStart < 0) { warnings.push(`Job ${job}: no supported steps mapping`); continue }
    const jobHeader = lines.slice(start + 1, stepStart)
    const starts = []
    for (let i = stepStart + 1; i < end; i++) if (/^\s+-\s+\w[\w-]*:/.test(lines[i])) starts.push(i)
    for (let si = 0; si < starts.length; si++) {
      const raw = lines.slice(starts[si], starts[si + 1] ?? end)
      const block = raw.map((l, i) => i === 0 ? l.replace(/^(\s*)- /, '$1  ') : l)
      const runAt = block.findIndex((l) => /^\s*run:/.test(l))
      if (runAt < 0) continue
      const level = indent(block[runAt]), value = scalar(block[runAt].slice(block[runAt].indexOf(':') + 1))
      let run = value
      if (/^[|>][+-]?(?:\s+#.*)?$/.test(value)) {
        const body = []
        for (let k = runAt + 1; k < block.length; k++) {
          if (block[k].trim() && indent(block[k]) <= level) break
          body.push(block[k])
        }
        const trim = Math.min(...body.filter((l) => l.trim()).map(indent))
        run = body.map((l) => l.slice(trim)).join('\n').trimEnd()
        if (value.startsWith('>')) warnings.push(`Job ${job} step ${si + 1}: folded YAML retained as lines; inspect before running`)
      }
      const sanitized = redact(run)
      steps.push({ id: `${file}:${job}:${si + 1}`, source: file, job,
        name: scopeValue(block, 'name') || `step ${si + 1}`, command: sanitized, run: sanitized,
        cwd: scopeValue(block, 'working-directory') || scopeValue(jobHeader, 'working-directory') || scopeValue(global, 'working-directory') || '.',
        shell: scopeValue(block, 'shell') || scopeValue(jobHeader, 'shell') || scopeValue(global, 'shell') || 'runner default',
        env_names: [...new Set([...envNames(global), ...envNames(jobHeader), ...envNames(block)])].sort(),
        kind: commandKind(run), origin: 'ci', execution_context: 'ci',
        prerequisites: ['CI runner, preceding steps and job configuration must be reviewed'],
        runnable: sanitized === run && warnings.length === 0 && !/\$\{\{/.test(run),
      })
    }
  }
  return { steps, warnings: [...new Set(warnings)] }
}

export function sense(paths, read) {
  const stack = { package_managers: [], manifests: [], runtimes: {} }
  const commands = { scripts: {}, make_targets: [], ci: [], entries: [] }
  const components = []
  const warnings = []
  const managers = { node: 'npm', deno: 'deno', gradle: 'gradle', python: 'pip/poetry', go: 'go', rust: 'cargo', ruby: 'bundler', php: 'composer', maven: 'maven' }
  const parse = (text, file) => { try { return JSON.parse(text) } catch { warnings.push(`${file}: structured JSON parsing unavailable; inspect manually`); return null } }
  for (const file of paths) {
    const kind = manifestKind(file)
    if (!kind) continue
    const text = read(file)
    if (text === null) continue
    const root = posix.dirname(file)
    const id = `${kind}:${root}`
    let component = components.find((c) => c.id === id)
    if (!component) { component = { id, root, kind, manifests: [], entrypoints: [], commands: [] }; components.push(component) }
    component.manifests.push(file)
    let pm = managers[kind]
    const record = { file, component: id, kind, deps: {}, devDeps: {} }
    if (kind === 'node' || kind === 'deno') {
      const json = parse(text, file)
      if (json) {
        record.deps = Object.fromEntries(Object.entries(json.dependencies || json.imports || {}).map(([k, v]) => [k, redact(v)]))
        record.devDeps = Object.fromEntries(Object.entries(json.devDependencies || {}).map(([k, v]) => [k, redact(v)]))
        record.name = json.name || null
        record.workspaces = json.workspaces || json.workspace || []
        if (kind === 'node') {
          const explicit = json.packageManager?.split('@')[0]
          pm = ['npm', 'pnpm', 'yarn', 'bun'].includes(explicit) ? explicit
            : paths.includes(posix.join(root, 'pnpm-lock.yaml')) ? 'pnpm'
              : paths.includes(posix.join(root, 'yarn.lock')) ? 'yarn'
                : paths.some((p) => [posix.join(root, 'bun.lock'), posix.join(root, 'bun.lockb')].includes(p)) ? 'bun' : 'npm'
          record.runtimes = json.engines || {}
          if (root === '.') stack.runtimes = { ...json.engines, ...(json.packageManager ? { packageManager: json.packageManager } : {}) }
        }
        for (const [name, raw] of Object.entries(json.scripts || json.tasks || {})) {
          const body = typeof raw === 'string' ? raw : raw?.command
          if (typeof body !== 'string') continue
          const command = `${pm}${kind === 'deno' ? ' task' : ' run'} ${JSON.stringify(name)}`
          const entry = { id: `${file}:${name}`, name, command, body: redact(body), cwd: root, source: file,
            kind: commandKind(`${name} ${body}`), shell: 'project package manager', env_names: [...body.matchAll(/\b([A-Z_][A-Z0-9_]*)\s*=/g)].map((m) => m[1]),
            origin: 'manifest', execution_context: 'local', prerequisites: [`Install ${pm} and this component's dependencies`], runnable: true }
          commands.entries.push(entry); component.commands.push(entry.id)
          if (root === '.' && kind === 'node') commands.scripts[name] = redact(body)
        }
      }
    }
    stack.package_managers.push(pm)
    stack.manifests.push(record)
  }
  for (const file of paths) {
    if (basename(file) === 'Makefile') {
      const targets = [...(read(file) || '').matchAll(/^([a-zA-Z0-9_.-]+):\s*(?:[^=]|$)/gm)].map((m) => m[1])
      if (file === 'Makefile') commands.make_targets = targets
      for (const name of targets) commands.entries.push({ id: `${file}:${name}`, name, command: `make ${name}`, cwd: posix.dirname(file), source: file, kind: commandKind(name), shell: 'make', env_names: [], origin: 'manifest', execution_context: 'local', prerequisites: ['make and target prerequisites'], runnable: true })
    }
    if (/^\.github\/workflows\/.+\.ya?ml$/.test(file)) {
      const parsed = githubSteps(file, read(file) || '')
      commands.ci.push({ file, run_steps: parsed.steps.map((s) => s.run), ...parsed })
      commands.entries.push(...parsed.steps)
      warnings.push(...parsed.warnings.map((w) => `${file}: ${w}`))
    } else if (/^(?:\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|Jenkinsfile|\.travis\.yml)$/.test(file)) {
      commands.ci.push({ file, run_steps: [], steps: [], warnings: ['CI format requires manual review'] })
      warnings.push(`${file}: CI format requires manual review`)
    }
  }
  stack.package_managers = [...new Set(stack.package_managers)]
  return { stack, commands, components, warnings }
}
