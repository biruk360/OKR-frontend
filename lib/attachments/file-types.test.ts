import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateUpload, readImageDimensions, dispositionFor,
  ALLOWED_TYPES, MAX_FILE_BYTES, extensionOf,
} from './file-types'

const PNG_HEAD = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, 0,0,0,13, 0x49,0x48,0x44,0x52, 0,0,0x02,0x00, 0,0,0x01,0x00])
const JPEG_HEAD = new Uint8Array([0xff,0xd8,0xff,0xe0, 0,16, 0x4a,0x46,0x49,0x46,0, 1,1,0, 0,1, 0,1, 0,0])
const PDF_HEAD = new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34])
const ZIP_HEAD = new Uint8Array([0x50,0x4b,0x03,0x04, 0,0,0,0, 0,0,0,0, 0,0,0,0])
const TEXT_HEAD = new Uint8Array(Array.from('name,value\n').map((c) => c.charCodeAt(0)))

function ok(filename: string, mime: string, head: Uint8Array, size = 1024) {
  return validateUpload({ filename, declaredMime: mime, size, head })
}

// ── UPL-3: the stored-XSS hole this feature must not reopen ────────────────

test('UPL-AC-1: an .html upload is rejected', () => {
  const r = ok('payload.html', 'text/html', TEXT_HEAD)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, 'FORBIDDEN_TYPE')
})

test('every script-bearing extension is rejected, whatever MIME is claimed', () => {
  // Each of these executes if served from our own origin.
  for (const name of ['x.svg', 'x.htm', 'x.xhtml', 'x.js', 'x.mjs', 'x.php', 'x.jsp',
                      'x.sh', 'x.exe', 'x.bat', 'x.jar', 'x.vbs', 'x.ps1', 'x.hta', 'x.xml']) {
    const r = ok(name, 'image/png', PNG_HEAD)   // lying about the MIME must not help
    assert.equal(r.ok, false, `${name} was accepted`)
    assert.equal(r.ok === false && r.reason, 'FORBIDDEN_TYPE', name)
  }
})

test('a forbidden MIME is rejected even behind an innocent extension', () => {
  // "notes.txt" declared as text/html — the extension allowlist alone would pass it.
  const r = ok('notes.txt', 'text/html', TEXT_HEAD)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, 'FORBIDDEN_TYPE')
})

// ── UPL-2: bytes must back up the name ─────────────────────────────────────

test('UPL-AC-2: a PNG renamed to .pdf is rejected on content', () => {
  const r = ok('sneaky.pdf', 'application/pdf', PNG_HEAD)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, 'CONTENT_MISMATCH')
})

test('HTML renamed to .png is rejected on content', () => {
  const html = new Uint8Array(Array.from('<html><script>').map((c) => c.charCodeAt(0)))
  const r = ok('evil.png', 'image/png', html)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, 'CONTENT_MISMATCH')
})

test('genuine files of every allowed kind are accepted', () => {
  assert.equal(ok('a.png', 'image/png', PNG_HEAD).ok, true)
  assert.equal(ok('a.jpg', 'image/jpeg', JPEG_HEAD).ok, true)
  assert.equal(ok('a.pdf', 'application/pdf', PDF_HEAD).ok, true)
  assert.equal(ok('a.csv', 'text/csv', TEXT_HEAD).ok, true)
  assert.equal(ok('a.txt', 'text/plain', TEXT_HEAD).ok, true)
  const docx = ok('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ZIP_HEAD)
  assert.equal(docx.ok, true)
  // The three OOXML types share the ZIP signature; extension must disambiguate.
  assert.equal(docx.ok === true && docx.type.extensions[0], '.docx')
})

test('an unknown-but-harmless extension is refused rather than guessed at', () => {
  const r = ok('archive.7z', 'application/x-7z-compressed', ZIP_HEAD)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, 'UNSUPPORTED_TYPE')
})

// ── UPL-5: size ────────────────────────────────────────────────────────────

test('size limits are enforced at both ends', () => {
  const big = ok('a.png', 'image/png', PNG_HEAD, MAX_FILE_BYTES + 1)
  assert.equal(big.ok === false && big.reason, 'TOO_LARGE')
  assert.match(big.ok === false ? big.message : '', /a\.png/)   // names the file

  const empty = ok('a.png', 'image/png', PNG_HEAD, 0)
  assert.equal(empty.ok === false && empty.reason, 'EMPTY')

  assert.equal(ok('a.png', 'image/png', PNG_HEAD, MAX_FILE_BYTES).ok, true)   // boundary
})

test('extensionOf is case-insensitive and safe on odd names', () => {
  assert.equal(extensionOf('A.PNG'), '.png')
  assert.equal(extensionOf('no-extension'), '')
  assert.equal(extensionOf('.hidden'), '.hidden')
  assert.equal(extensionOf('a.tar.gz'), '.gz')
  // Rejected via the forbidden list, not by mis-parsing the double extension.
  assert.equal(ok('evil.png.html', 'image/png', PNG_HEAD).ok, false)
})

// ── ATT-5: dimensions ──────────────────────────────────────────────────────

test('dimensions are read from PNG and GIF headers', () => {
  assert.deepEqual(readImageDimensions(PNG_HEAD, 'image/png'), { width: 512, height: 256 })
  const gif = new Uint8Array([0x47,0x49,0x46,0x38,0x39,0x61, 0x20,0x00, 0x10,0x00, 0,0,0])
  assert.deepEqual(readImageDimensions(gif, 'image/gif'), { width: 32, height: 16 })
})

test('a malformed header returns null instead of throwing', () => {
  // A truncated image must not fail the whole upload.
  assert.equal(readImageDimensions(new Uint8Array([0x89, 0x50]), 'image/png'), null)
  assert.equal(readImageDimensions(TEXT_HEAD, 'text/csv'), null)
})

// ── UPL-7: how each kind is served back ────────────────────────────────────

test('only images and PDFs render inline; everything else downloads', () => {
  for (const t of ALLOWED_TYPES) {
    const expected = t.kind === 'IMAGE' || t.kind === 'PDF' ? 'inline' : 'attachment'
    assert.equal(dispositionFor(t), expected, t.mime)
  }
  // Nothing in the allowlist may be a type a browser would execute. Checked by
  // round-tripping each allowed type back through the validator rather than by
  // pattern-matching its name — "openxmlformats" contains "xml" but a .docx is
  // inert, and conflating the two is exactly the bug this test found.
  for (const t of ALLOWED_TYPES) {
    const head = t.signatures.length
      ? new Uint8Array(Array.from({ length: 32 }, (_, i) => {
          for (const sig of t.signatures) {
            const off = sig.offset ?? 0
            if (i >= off && i < off + sig.bytes.length) return sig.bytes[i - off]
          }
          return 0
        }))
      : TEXT_HEAD
    const r = validateUpload({ filename: `f${t.extensions[0]}`, declaredMime: t.mime, size: 10, head })
    assert.equal(r.ok, true, `${t.mime} (${t.extensions[0]}) was rejected by its own allowlist entry`)
  }
})
