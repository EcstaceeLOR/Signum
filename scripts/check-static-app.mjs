import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const index = readFileSync(resolve(root, 'dist/index.html'), 'utf8')
const manifest = JSON.parse(
  readFileSync(resolve(root, 'dist/game.manifest.json'), 'utf8'),
)

assert.match(index, /<div id="root"><\/div>/)
assert.match(
  index,
  /<script async src="https:\/\/jam\.chain\.wtf\/widget\.js"><\/script>/,
  'The production HTML must include the Chain Jam widget.',
)
assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.apiVersion, 1)
assert.equal(manifest.gameId, 'signum')
assert.equal(manifest.presentation?.mode, 'full-iframe')
assert.deepEqual(manifest.capabilities, {
  openSession: true,
  submitAction: false,
  forfeitExpiredSession: false,
  cancelStuckRandomness: true,
  resize: true,
})

const assetDirectory = resolve(root, 'dist/assets')
const productionAssets = readdirSync(assetDirectory).filter((name) =>
  /\.(?:css|js)$/.test(name),
)
const gzipBytes = (extension) =>
  productionAssets
    .filter((name) => name.endsWith(extension))
    .reduce(
      (total, name) =>
        total +
        gzipSync(readFileSync(resolve(assetDirectory, name))).byteLength,
      0,
    )
const javascriptGzipBytes = gzipBytes('.js')
const stylesheetGzipBytes = gzipBytes('.css')
const totalGzipBytes = javascriptGzipBytes + stylesheetGzipBytes

assert.ok(
  javascriptGzipBytes <= 116 * 1024,
  `JavaScript gzip budget exceeded: ${formatKilobytes(javascriptGzipBytes)} > 116 kB.`,
)
assert.ok(
  stylesheetGzipBytes <= 10 * 1024,
  `CSS gzip budget exceeded: ${formatKilobytes(stylesheetGzipBytes)} > 10 kB.`,
)
assert.ok(
  totalGzipBytes <= 125 * 1024,
  `Combined gzip budget exceeded: ${formatKilobytes(totalGzipBytes)} > 125 kB.`,
)

console.log(
  `Verified static Signum build and asset budgets (JS ${formatKilobytes(javascriptGzipBytes)}, CSS ${formatKilobytes(stylesheetGzipBytes)}, combined ${formatKilobytes(totalGzipBytes)}).`,
)

function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB gzip`
}
