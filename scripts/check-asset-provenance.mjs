import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const expectedMedia = new Map([
  [
    'docs/assets/signum-carrier.png',
    'f1b3262f60917ac0b03c2833289f4656654735fac9115b8aec8f635a9e6f5983',
  ],
  [
    'docs/assets/signum-deepwave.png',
    '770341bff5151a66dd80517aeb45b07951c7a39d4611af03d0e495b9a4db3ac2',
  ],
  [
    'docs/assets/signum-pulse.png',
    '458efef352b75b74b1e468d5a92beec3ab181e7d3604d12e8d8a520cd0191c6e',
  ],
  [
    'docs/assets/signum-showcase-demo.webm',
    '24d8e70d27afb47f53b152e168cc8584c30e47452fc6a01f22461905aa30a3d9',
  ],
  [
    'public/og-image.png',
    '65e0e8e928f7d68edbaf5d796527d497720a881b041977e2cab3f6760e461d4d',
  ],
])

const mediaExtensions = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.ogg',
  '.otf',
  '.png',
  '.svg',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
])

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const item = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(item)))
    else files.push(item.replaceAll('\\', '/'))
  }
  return files
}

const discovered = (await Promise.all(['docs', 'public'].map(walk)))
  .flat()
  .filter((file) => mediaExtensions.has(path.extname(file).toLowerCase()))
  .sort()
const expected = [...expectedMedia.keys()].sort()

if (JSON.stringify(discovered) !== JSON.stringify(expected)) {
  throw new Error(
    `Media inventory drifted.\nExpected: ${expected.join(', ')}\nFound: ${discovered.join(', ')}`,
  )
}

for (const [file, expectedHash] of expectedMedia) {
  const hash = createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
  if (hash !== expectedHash) throw new Error(`${file} hash changed: ${hash}`)
}

for (const dependency of ['penpal', 'react', 'react-dom']) {
  const metadata = JSON.parse(
    await readFile(`node_modules/${dependency}/package.json`, 'utf8'),
  )
  if (metadata.license !== 'MIT') {
    throw new Error(
      `${dependency} has unreviewed runtime license: ${metadata.license ?? 'undeclared'}`,
    )
  }
}

console.log(
  `Asset provenance verified: ${expected.length} original media files and 3 MIT runtime dependencies.`,
)
