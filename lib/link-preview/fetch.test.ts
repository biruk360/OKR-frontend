import test from 'node:test'
import assert from 'node:assert/strict'
import type { LookupAddress } from 'node:dns'
import {
  assertPreviewableUrl,
  createSafeLookup,
  decodeHtml,
  fetchPreviewHtml,
  getLinkPreview,
  LinkPreviewError,
} from './fetch'

/**
 * LPV-5 / LPV-AC-2 — the fetcher refuses internal targets before any socket
 * is opened. None of these tests touch the network: static-rule rejections
 * happen before DNS, and the lookup tests use an injected resolver (or
 * `localhost`, which resolves from /etc/hosts).
 */

const isCode = (code: string) => (err: unknown) => err instanceof LinkPreviewError && err.code === code

test('rejects internal targets and forbidden URL shapes without a network call', async () => {
  const cases: [string, string][] = [
    ['http://localhost', 'BLOCKED'],
    ['http://localhost:3000/', 'INVALID_URL'], // non-default port is caught first
    ['http://127.0.0.1', 'BLOCKED'],
    ['http://169.254.169.254/latest/meta-data', 'BLOCKED'],
    ['http://[::1]/', 'BLOCKED'],
    ['http://[::ffff:7f00:1]/', 'BLOCKED'],
    ['http://2130706433/', 'BLOCKED'], // decimal 127.0.0.1 — WHATWG URL normalises it
    ['http://0x7f.1/', 'BLOCKED'],
    ['http://intranet/', 'BLOCKED'], // single-label name
    ['http://printer.local/', 'BLOCKED'],
    ['http://example.com:8080/', 'INVALID_URL'],
    ['https://example.com:8443/', 'INVALID_URL'],
    ['http://user:pw@example.com/', 'INVALID_URL'],
    ['http://user@example.com/', 'INVALID_URL'],
    ['ftp://example.com/', 'INVALID_URL'],
    ['file:///etc/passwd', 'INVALID_URL'],
    ['javascript:alert(1)', 'INVALID_URL'],
    ['not a url', 'INVALID_URL'],
  ]
  const started = Date.now()
  for (const [url, code] of cases) {
    await assert.rejects(fetchPreviewHtml(url), isCode(code), url)
    assert.throws(() => getLinkPreview(url), isCode(code), url)
  }
  assert.ok(Date.now() - started < 1000, 'no request was attempted')
})

test('default ports written explicitly are fine; the fragment is dropped', () => {
  assert.equal(assertPreviewableUrl('http://example.com:80/a#frag').href, 'http://example.com/a')
  assert.equal(assertPreviewableUrl('https://example.com:443/').href, 'https://example.com/')
})

function fakeResolver(map: Record<string, LookupAddress[]>) {
  return (host: string, cb: (err: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) =>
    setImmediate(() => cb(null, map[host] || []))
}

function runLookup(lookup: ReturnType<typeof createSafeLookup>, host: string, all: boolean) {
  return new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
    lookup(host, { all }, (err, address, family) => resolve({ err, address, family })),
  )
}

test('LPV-AC-2: a public hostname resolving to 10.0.0.5 is refused at connect time', async () => {
  const lookup = createSafeLookup(fakeResolver({ 'rebind.example': [{ address: '10.0.0.5', family: 4 }] }))
  const { err } = await runLookup(lookup, 'rebind.example', false)
  assert.equal(err?.code, 'EBLOCKED')
})

test('LPV-AC-2 end to end: the request fails with BLOCKED and no socket is opened', async () => {
  const lookup = createSafeLookup(fakeResolver({ 'rebind.example': [{ address: '10.0.0.5', family: 4 }] }))
  await assert.rejects(fetchPreviewHtml('http://rebind.example/', { lookup }), isCode('BLOCKED'))
  await assert.rejects(fetchPreviewHtml('https://rebind.example/', { lookup }), isCode('BLOCKED'))
})

test('any blocked address in a mixed answer refuses the whole host', async () => {
  const lookup = createSafeLookup(
    fakeResolver({
      'mixed.example': [
        { address: '93.184.216.34', family: 4 },
        { address: '::ffff:169.254.169.254', family: 6 },
      ],
    }),
  )
  assert.equal((await runLookup(lookup, 'mixed.example', true)).err?.code, 'EBLOCKED')
})

test('a clean answer is passed through in both callback shapes', async () => {
  const lookup = createSafeLookup(
    fakeResolver({
      'ok.example': [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ],
    }),
  )
  const single = await runLookup(lookup, 'ok.example', false)
  assert.equal(single.err, null)
  assert.equal(single.address, '93.184.216.34')
  assert.equal(single.family, 4)
  const all = await runLookup(lookup, 'ok.example', true)
  assert.equal((all.address as LookupAddress[]).length, 2)
})

test('the real resolver refuses localhost (resolved locally, no network)', async () => {
  const { err } = await runLookup(createSafeLookup(), 'localhost', true)
  assert.ok(err, 'localhost must not resolve to a usable address')
})

test('charset: utf-8 by default, latin1/windows-1252 honoured from header or <meta>', () => {
  const utf8 = Buffer.from('<title>café — 日本</title>', 'utf8')
  assert.equal(decodeHtml(utf8, null), '<title>café — 日本</title>')
  const latin = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x71, 0x94]) // café “q” in cp1252
  assert.equal(decodeHtml(latin, 'iso-8859-1'), 'café “q”')
  const meta = Buffer.concat([Buffer.from('<meta charset="windows-1252"><title>'), Buffer.from([0xe9]), Buffer.from('</title>')])
  assert.equal(decodeHtml(meta, null), '<meta charset="windows-1252"><title>é</title>')
  assert.equal(decodeHtml(Buffer.from('ok'), 'x-unknown-charset'), 'ok')
})
