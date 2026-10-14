// Keep fixtures inside the project, including in restricted Windows sessions.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../.dev/test-tmp')
mkdirSync(directory, { recursive: true })
process.env.TEMP = directory
process.env.TMP = directory
process.env.TMPDIR = directory
