import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const binaryExtensions = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
])
const highConfidencePatterns = [
  ['private-key block', /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/g],
  ['AWS access key', /AKIA[0-9A-Z]{16}/g],
  [
    'GitHub token',
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g,
  ],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ['live Stripe key', /sk_live_[A-Za-z0-9]{20,}/g],
]
const frontendPrivateValue = /0x[0-9a-fA-F]{64}/g
const unsafeViteEnvironment =
  /VITE_[A-Z0-9_]*(?:PRIVATE|SECRET|MNEMONIC|SEED|SIGNING|API_KEY)[A-Z0-9_]*/g

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)

const trackedEnvironmentFiles = trackedFiles.filter((path) =>
  /(^|\/)\.env(?:\.|$)/.test(path),
)
assert.deepEqual(
  trackedEnvironmentFiles.filter((path) => !path.endsWith('.example')),
  [],
  'A non-example .env file is tracked.',
)

const findings = []
for (const path of trackedFiles) {
  scanFile(path, false)
}

const dist = resolve(root, 'dist')
if (existsSync(dist)) {
  for (const path of walk(dist)) {
    scanFile(relative(root, path).replaceAll('\\', '/'), true)
  }
}

if (findings.length > 0) {
  throw new Error(`Secret scan failed:\n${findings.join('\n')}`)
}

console.log(
  `Secret scan passed for ${trackedFiles.length} tracked files${existsSync(dist) ? ' and the production bundle' : ''}.`,
)

function scanFile(path, generated) {
  if (binaryExtensions.has(extname(path).toLowerCase())) return
  const absolutePath = resolve(root, path)
  if (!existsSync(absolutePath) || statSync(absolutePath).isDirectory()) return

  const contents = readFileSync(absolutePath, 'utf8')
  for (const [label, pattern] of highConfidencePatterns) {
    reportMatches(path, contents, label, pattern)
  }

  if (generated || isFrontendPath(path)) {
    reportMatches(path, contents, '32-byte private value', frontendPrivateValue)
    reportMatches(
      path,
      contents,
      'secret-bearing VITE environment variable',
      unsafeViteEnvironment,
    )
  }
}

function reportMatches(path, contents, label, pattern) {
  pattern.lastIndex = 0
  for (const match of contents.matchAll(pattern)) {
    const line = contents.slice(0, match.index).split('\n').length
    findings.push(`${path}:${line} contains a possible ${label}`)
  }
}

function isFrontendPath(path) {
  return (
    path === 'index.html' ||
    path === 'vite.config.ts' ||
    path.startsWith('public/') ||
    path.startsWith('src/')
  )
}

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else yield path
  }
}
