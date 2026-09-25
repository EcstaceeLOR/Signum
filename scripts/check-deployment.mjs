import assert from 'node:assert/strict'

const input = process.argv[2]
assert.ok(input, 'Usage: npm run deployment:check -- https://example.com/path/')

const pageUrl = new URL(input)
assert.equal(pageUrl.protocol, 'https:', 'Deployment URL must use HTTPS.')
if (!pageUrl.pathname.endsWith('/')) pageUrl.pathname += '/'

const [pageResponse, manifestResponse] = await Promise.all([
  fetch(pageUrl),
  fetch(new URL('game.manifest.json', pageUrl)),
])

assert.equal(pageResponse.status, 200, `Page returned ${pageResponse.status}.`)
assert.equal(
  manifestResponse.status,
  200,
  `Manifest returned ${manifestResponse.status}.`,
)

const html = await pageResponse.text()
const manifest = await manifestResponse.json()
assert.match(html, /https:\/\/jam\.chain\.wtf\/widget\.js/)
assert.match(html, /<div id="root"><\/div>/)
assert.equal(manifest.gameId, 'signum')
assert.equal(manifest.presentation?.mode, 'full-iframe')

const framePolicy = pageResponse.headers.get('x-frame-options')?.toLowerCase()
assert.ok(
  framePolicy !== 'deny' && framePolicy !== 'sameorigin',
  `Restrictive X-Frame-Options header found: ${framePolicy}.`,
)
const contentSecurityPolicy =
  pageResponse.headers.get('content-security-policy')?.toLowerCase() ?? ''
assert.doesNotMatch(
  contentSecurityPolicy,
  /frame-ancestors\s+(?:'none'|'self')(?:;|$)/,
  'Restrictive frame-ancestors policy prevents Chain embedding.',
)

console.log(
  `Verified public page, manifest, Jam widget, and iframe policy at ${pageUrl}`,
)
