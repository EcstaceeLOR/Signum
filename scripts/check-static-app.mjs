import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

console.log(
  'Verified static Signum build, same-origin manifest, and Chain Jam widget.',
)
