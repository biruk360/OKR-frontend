import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_LETTER_FONT_FAMILY,
  LETTER_FONT_IMPORTS,
  isAllowedPdfRequestUrl,
  resolveLetterFont,
  sanitizeLetterBodyHtml,
  sanitizeStyle,
  sanitizeUrl,
} from './letter-sanitize'
import { renderLetterHtml } from './letter-html'
import { resolvePlaceholders } from './letters'
import {
  DEFAULT_LETTER_MATRIX,
  LETTER_ADMIN_FEATURE_KEY,
  LETTER_PERMISSION_TARGETS,
  LETTER_PERMISSIONS,
} from './letter-permissions'

/**
 * Letters security guards (remediation 2026-09-25, agent S3):
 *   - stored XSS via the letter body   → strict allowlist sanitizer
 *   - reflected XSS via ?font= / ?origin= → font allowlist, no origin input
 *   - SSRF via Puppeteer               → request allowlist
 *   - privilege escalation via letter.view_all → ADMIN-only feature key
 */

const ROOT = join(__dirname, '..')

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

const XSS_VECTORS = [
  '<script>alert(1)</script>',
  '<SCRIPT SRC=//evil/x.js></SCRIPT>',
  '<img src=x onerror=alert(1)>',
  '<img src="x" ONERROR="alert(1)">',
  '<svg onload=alert(1)><circle/></svg>',
  '<svg><script>alert(1)</script></svg>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">',
  '<link rel=stylesheet href="//evil/x.css">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="//evil/">',
  '<form action="//evil"><button>go</button></form>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="jav&#x61;script:alert(1)">x</a>',
  '<a href="jav&#97;script:alert(1)">x</a>',
  '<a href="javascript&colon;alert(1)">x</a>',
  '<a href=" &#14; javascript:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<p style="width:expression(alert(1))">x</p>',
  '<p style="background:url(http://169.254.169.254/)">x</p>',
  '<p style="x:\\75 rl(//evil)">x</p>',
  '<style>@import "//evil"</style>',
  '<div onmouseover="alert(1)">x</div>',
  '<p/onclick=alert(1)>x</p>',
  '<<script>alert(1)//<</script>',
  '<!--><script>alert(1)</script>-->',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<textarea><img src=x onerror=alert(1)></textarea>',
  '<template><script>alert(1)</script></template>',
  '</p><script>alert(1)</script>',
  '<img src=x onerror=alert(1)//',
  '<a href="x" onclick="alert(1)" target="_blank">x</a>',
]

/** Everything the sanitizer emits must be free of live script vectors. */
function assertInert(out: string, input: string) {
  const lower = out.toLowerCase()
  for (const bad of ['<script', '<iframe', '<object', '<embed', '<svg', '<math', '<link', '<meta', '<base', '<form', '<style', '<textarea', '<template']) {
    assert.ok(!lower.includes(bad), `${bad} survived: ${input} → ${out}`)
  }
  assert.ok(!/\son[a-z]+\s*=/i.test(out), `event handler survived: ${input} → ${out}`)
  assert.ok(!/(href|src)="\s*(javascript|vbscript|data:text)/i.test(out), `dangerous URL survived: ${input} → ${out}`)
  assert.ok(!/url\s*\(|expression\s*\(|\\/i.test(out.match(/style="[^"]*"/g)?.join(' ') ?? ''), `dangerous CSS survived: ${input} → ${out}`)
  assert.ok(!/data:image\/svg/i.test(out), `svg data URI survived: ${input} → ${out}`)
}

test('sanitizer neutralises known XSS vectors', () => {
  for (const v of XSS_VECTORS) assertInert(sanitizeLetterBodyHtml(v), v)
})

test('sanitizer output is idempotent and balanced', () => {
  for (const v of XSS_VECTORS) {
    const once = sanitizeLetterBodyHtml(v)
    assert.equal(sanitizeLetterBodyHtml(once), once, `not idempotent for ${v}`)
  }
  assert.equal(sanitizeLetterBodyHtml('<p><strong>a</p>'), '<p><strong>a</strong></p>')
  assert.equal(sanitizeLetterBodyHtml('a</div>b'), 'ab')
})

test('sanitizer keeps legitimate mammoth / Tiptap letter markup', () => {
  const body = [
    '<h2>Offer</h2>',
    '<p style="text-align:center; font-family:Roboto, Noto Sans Ethiopic, sans-serif">Dear <strong>Client</strong>,</p>',
    '<p><span style="text-decoration:underline">u</span> <em>e</em> <a href="https://360ground.com/x?a=1&amp;b=2">link</a> <a href="mailto:a@b.c">m</a></p>',
    '<ul><li>one</li><li>two</li></ul><ol start="3"><li>three</li></ol>',
    '<table><tbody><tr><th colspan="2">H</th></tr><tr><td>a</td><td rowspan="1">b</td></tr></tbody></table>',
    '<p>ሰላም &amp; welcome &mdash; 5 &lt; 6</p>',
    '<img src="data:image/png;base64,iVBORw0KGgo=" alt="logo" width="120">',
    '<br><hr><div class="letter-page-break"></div>',
  ].join('')
  const out = sanitizeLetterBodyHtml(body)
  assert.ok(out.includes('<h2>Offer</h2>'))
  assert.ok(out.includes('style="text-align:center; font-family:Roboto, Noto Sans Ethiopic, sans-serif"'))
  assert.ok(out.includes('<a href="https://360ground.com/x?a=1&amp;b=2">link</a>'))
  assert.ok(out.includes('<a href="mailto:a@b.c">m</a>'))
  assert.ok(out.includes('<ol start="3"><li>three</li></ol>'))
  assert.ok(out.includes('<th colspan="2">H</th>'))
  assert.ok(out.includes('ሰላም &amp; welcome &mdash; 5 &lt; 6'))
  assert.ok(out.includes('<img src="data:image/png;base64,iVBORw0KGgo=" alt="logo" width="120">'))
  assert.ok(out.includes('<div class="letter-page-break"></div>'))
})

test('URL policy', () => {
  assert.equal(sanitizeUrl('https://a.b/c', 'link'), 'https://a.b/c')
  assert.equal(sanitizeUrl('/dashboard/letters/1', 'link'), '/dashboard/letters/1')
  assert.equal(sanitizeUrl('#section', 'link'), '#section')
  assert.equal(sanitizeUrl('javascript:alert(1)', 'link'), null)
  assert.equal(sanitizeUrl('  JAVASCRIPT:alert(1)', 'link'), null)
  assert.equal(sanitizeUrl('/\\evil.com', 'link'), null)
  assert.equal(sanitizeUrl('data:image/png;base64,AAAA', 'link'), null)
  assert.equal(sanitizeUrl('data:image/png;base64,AAAA', 'img'), 'data:image/png;base64,AAAA')
  assert.equal(sanitizeUrl('data:text/html;base64,AAAA', 'img'), null)
  assert.equal(sanitizeUrl('mailto:x@y.z', 'img'), null)
})

test('style policy drops fetching / executing CSS but keeps plain declarations', () => {
  assert.equal(sanitizeStyle('color:red; background:url(//evil)'), 'color:red')
  assert.equal(sanitizeStyle('behavior:url(x.htc)'), '')
  assert.equal(sanitizeStyle('font-family:&#39;Roboto&#39;, serif'), "font-family:'Roboto', serif")
  assert.equal(sanitizeStyle('width:expr\\65 ssion(alert(1))'), '')
})

test('placeholder values are HTML-escaped before splicing into the body', () => {
  const { html } = resolvePlaceholders('<p>{{customer_name}}</p>', {
    customerName: '<img src=x onerror=alert(1)>',
    date: new Date('2026-01-02'),
    referenceNumber: null,
    signatoryName: null,
    senderDepartment: null,
    salutation: null,
    closing: null,
  })
  assert.equal(html, '<p>&lt;img src=x onerror=alert(1)&gt;</p>')
})

// ---------------------------------------------------------------------------
// Font allowlist + renderer (reflected XSS via ?font= / ?origin=)
// ---------------------------------------------------------------------------

test('font allowlist: catalog families pass, everything else falls back', () => {
  for (const family of Object.keys(LETTER_FONT_IMPORTS)) assert.equal(resolveLetterFont(family), family)
  for (const bad of [
    "Roboto'; } </style><script>alert(1)</script>",
    '</style><script>alert(1)</script>',
    'Comic Sans MS',
    'roboto',
    '__proto__',
    'constructor',
    '',
    undefined,
    null,
    42,
  ]) {
    assert.equal(resolveLetterFont(bad), DEFAULT_LETTER_FONT_FAMILY, String(bad))
  }
})

test('the font catalog matches the UI picker (features/letters/i18n.ts)', () => {
  const i18n = readFileSync(join(ROOT, 'features/letters/i18n.ts'), 'utf8')
  const ids = Array.from(i18n.matchAll(/\{ id: '([^']+)'/g)).map((m) => m[1])
  assert.ok(ids.length > 0)
  assert.deepEqual([...ids].sort(), Object.keys(LETTER_FONT_IMPORTS).sort())
})

function fakeLetter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1', referenceNumber: '360G/LT/CL/001/2026', subject: 'Subject <b>x</b>', letterType: 'CL',
    letterTypeId: null, status: 'DRAFT', date: new Date('2026-01-02T00:00:00Z'), odooPartnerId: null,
    customerName: 'ACME "Co"', recipientAddress: null, salutation: null, closing: null, senderDepartment: null,
    bodyContent: '<p onclick="x">Hello</p><script>alert(1)</script>', bodyDocx: null, preparedById: 'u1',
    signatoryId: null, signatoryTitle: null, signatoryTitleAmharic: null, dispatchMethod: null, dispatchDate: null,
    trackingReference: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
    signatory: null, enclosures: [], letterTypeDef: null,
    ...overrides,
  } as any
}

test('renderLetterHtml: ?font= injection cannot break out of <style>', () => {
  const { html } = renderLetterHtml({ letter: fakeLetter(), font: "x'; } </style><script>alert(1)</script>" })
  assert.ok(!html.includes('<script'), 'script injected')
  assert.equal((html.match(/<\/style>/g) ?? []).length, 1)
  assert.ok(html.includes(`'${DEFAULT_LETTER_FONT_FAMILY}'`))
})

test('renderLetterHtml: no caller origin, assets inlined, body sanitized, fields escaped', () => {
  // `origin` is no longer part of the API; an injected value is simply ignored.
  const { html } = renderLetterHtml({ letter: fakeLetter(), origin: '"><script>alert(1)</script>' } as any)
  assert.ok(!html.includes('<script'))
  assert.ok(!html.includes('onclick'))
  assert.ok(!/<img[^>]+src="https?:/i.test(html), 'logo must not reference an absolute origin')
  assert.ok(html.includes('Subject &lt;b&gt;x&lt;/b&gt;'))
  assert.ok(html.includes('ACME &quot;Co&quot;'))
  const lang = renderLetterHtml({ letter: fakeLetter(), lang: '"><script>' as any }).html
  assert.ok(lang.includes('<html lang="en">'))
})

// ---------------------------------------------------------------------------
// Puppeteer network allowlist (SSRF)
// ---------------------------------------------------------------------------

test('PDF request allowlist: only data:/about:/blob: and Google Fonts over HTTPS', () => {
  for (const ok of [
    'data:font/truetype;base64,AAAA',
    'about:blank',
    'https://fonts.googleapis.com/css2?family=Roboto',
    'https://fonts.gstatic.com/s/roboto/v1/x.woff2',
  ]) assert.equal(isAllowedPdfRequestUrl(ok), true, ok)
  for (const bad of [
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:3000/api/letters',
    'http://127.0.0.1:5432/',
    'http://fonts.googleapis.com/css2',
    'https://fonts.googleapis.com.evil.com/x',
    'https://evil.com/?fonts.googleapis.com',
    'https://user:pw@fonts.googleapis.com/x',
    'https://fonts.googleapis.com:8443/x',
    'file:///etc/passwd',
    'ftp://fonts.gstatic.com/x',
    'not a url',
  ]) assert.equal(isAllowedPdfRequestUrl(bad), false, bad)
})

test('Puppeteer pages are hardened (JS off + request interception)', () => {
  const src = readFileSync(join(ROOT, 'lib/letter-pdf-puppeteer.ts'), 'utf8')
  assert.ok(src.includes('setJavaScriptEnabled(false)'))
  assert.ok(src.includes('setRequestInterception(true)'))
  assert.ok(src.includes('isAllowedPdfRequestUrl'))
  // Both entry points run the hardening before loading content.
  assert.equal((src.match(/await hardenPage\(page\)/g) ?? []).length, 2)
})

// ---------------------------------------------------------------------------
// Permission mapping (privilege escalation via letter.view_all)
// ---------------------------------------------------------------------------

test('letter.view_all (letter admin) maps to the ADMIN-only feature key, not module.letters', () => {
  const target = LETTER_PERMISSION_TARGETS['letter.view_all']
  assert.deepEqual(target, { kind: 'feature', featureKey: LETTER_ADMIN_FEATURE_KEY })
  assert.equal(LETTER_ADMIN_FEATURE_KEY, 'button.letter.admin')
  for (const p of LETTER_PERMISSIONS) {
    const t = LETTER_PERMISSION_TARGETS[p]
    assert.ok(t, `no target for ${p}`)
    if (t.kind === 'feature') assert.ok(!t.featureKey.startsWith('module.'), `${p} maps to a module-visibility key`)
  }
})

test('seed grants button.letter.admin to ADMIN only (and module.letters stays visibility-only)', () => {
  const seed = readFileSync(join(ROOT, 'scripts/seed-permissions.ts'), 'utf8')
  const line = seed.split('\n').find((l) => l.includes("'button.letter.admin'"))
  assert.ok(line, 'button.letter.admin missing from seed FEATURES')
  assert.match(line!, /ADMIN:\s*true,\s*EXECUTIVE:\s*false,\s*DEPARTMENT_LEAD:\s*false,\s*EMPLOYEE:\s*false/)
})

test('EMPLOYEE can still create/edit/submit own drafts but is not a letter admin', () => {
  const emp = DEFAULT_LETTER_MATRIX.EMPLOYEE
  assert.equal(emp['letter.read'], true)
  assert.equal(emp['letter.create'], true)
  assert.equal(emp['letter.write'], true)
  assert.equal(emp['letter.submit'], true)
  assert.equal(emp['letter.view_all'], false)
  const seed = readFileSync(join(ROOT, 'scripts/seed-permissions.ts'), 'utf8')
  const letterBlock = seed.slice(seed.indexOf("'letter',\n    all(),"), seed.indexOf('// letter_enclosure'))
  assert.match(letterBlock, /canRead: true, canWrite: true, canCreate: true, canSubmit: true/)
})

test('admin-edit routes use canAdministerLetters; read routes use the shared read guard', () => {
  const r = (p: string) => readFileSync(join(ROOT, 'app/api/letters', p), 'utf8')
  for (const p of ['[id]/route.ts', '[id]/archive/route.ts', '[id]/enclosures/route.ts', '[id]/enclosures/[enclosureId]/route.ts', '[id]/docx/route.ts']) {
    assert.ok(!r(p).includes("'letter.view_all'"), `${p} still checks letter.view_all directly`)
  }
  for (const p of ['[id]/route.ts', '[id]/html/route.ts', '[id]/pdf/route.ts', '[id]/docx/route.ts', '[id]/activity/route.ts', '[id]/duplicate/route.ts']) {
    assert.ok(r(p).includes('letterReadGuard('), `${p} lacks the read guard`)
  }
  assert.equal((r('[id]/pdf/route.ts').match(/letterReadGuard\(/g) ?? []).length, 2, 'pdf GET and POST both guarded')
  assert.ok(r('route.ts').includes('buildLetterReadWhere('))
  assert.ok(!r('[id]/html/route.ts').includes("searchParams.get('origin')"))
})

// ---------------------------------------------------------------------------
// Wave 4 (G3): templates, enclosures, reports, transition read scope
// ---------------------------------------------------------------------------

test('transition routes run the read guard before any state check', () => {
  const r = (p: string) => readFileSync(join(ROOT, 'app/api/letters', p), 'utf8')
  for (const p of ['[id]/approve/route.ts', '[id]/reject/route.ts', '[id]/send/route.ts', '[id]/submit/route.ts', '[id]/archive/route.ts']) {
    const src = r(p)
    const guard = src.indexOf('letterReadGuard(session.user.id, id)')
    assert.ok(guard > 0, `${p} lacks the read guard`)
    assert.ok(guard < src.indexOf('prisma.letter.findUnique'), `${p} reads the letter before the scope check`)
  }
})

test('templates: create input is validated and the body sanitized', async () => {
  const { parseLetterTemplateCreate, parseLetterTemplateUpdate } = await import('./letter-templates')
  const ok = parseLetterTemplateCreate({
    name: '  Offer v2 ', letterType: 'of', language: 'am',
    bodyHtml: '<p onclick="x()">Dear {{customer_name}}</p><script>alert(1)</script><img src=x onerror=alert(1)>',
  })
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(ok.data.name, 'Offer v2')
    assert.equal(ok.data.letterType, 'OF')
    assert.equal(ok.data.language, 'am')
    assert.ok(ok.data.bodyHtml.includes('{{customer_name}}'))
    assert.doesNotMatch(ok.data.bodyHtml, /script|onclick|onerror/i)
  }
  assert.equal(parseLetterTemplateCreate({ name: 'x', letterType: 'CL', bodyHtml: '<p>a</p>' }).ok, false)
  assert.equal(parseLetterTemplateCreate({ name: 'Good', letterType: 'C/L', bodyHtml: '<p>a</p>' }).ok, false)
  assert.equal(parseLetterTemplateCreate({ name: 'Good', letterType: 'CL', language: 'fr', bodyHtml: '<p>a</p>' }).ok, false)
  assert.equal(parseLetterTemplateCreate({ name: 'Good', letterType: 'CL', bodyHtml: '<script>alert(1)</script>' }).ok, false)
  assert.equal(parseLetterTemplateUpdate({}).ok, false)
  assert.equal(parseLetterTemplateUpdate({ isActive: 'no' }).ok, false)
  const upd = parseLetterTemplateUpdate({ isActive: false, bodyHtml: '<a href="javascript:alert(1)">x</a> hi' })
  assert.ok(upd.ok)
  if (upd.ok) {
    assert.equal(upd.data.isActive, false)
    assert.doesNotMatch(upd.data.bodyHtml ?? '', /javascript:/i)
  }
})

test('templates: built-in seeds mirror the constants with stable unique keys', async () => {
  const { builtinTemplateSeeds, constantTemplateFor } = await import('./letter-templates')
  const { LETTER_TEMPLATES } = await import('./letters')
  const seeds = builtinTemplateSeeds()
  assert.equal(seeds.length, Object.keys(LETTER_TEMPLATES).length)
  assert.deepEqual(seeds.map((s) => s.seedKey).sort(), ['builtin:CL:en', 'builtin:GR:en', 'builtin:OF:en'])
  for (const s of seeds) assert.equal(s.bodyHtml, sanitizeLetterBodyHtml(s.bodyHtml), 'seed body is already sanitized')
  assert.equal(constantTemplateFor('cl'), LETTER_TEMPLATES.COVER)
  assert.equal(constantTemplateFor('NC'), null)
  const route = readFileSync(join(ROOT, 'app/api/letters/templates/route.ts'), 'utf8')
  assert.match(route, /POST[\s\S]*canAdministerLetters/)
  const item = readFileSync(join(ROOT, 'app/api/letters/templates/[templateId]/route.ts'), 'utf8')
  assert.equal((item.match(/canAdministerLetters\(/g) ?? []).length, 2, 'PATCH and DELETE both admin-only')
  assert.equal((item.match(/recordActivity\(/g) ?? []).length, 2)
})

test('enclosures: only server-generated stored names resolve to a file', async () => {
  const { enclosureStoredName, enclosureHasFile } = await import('./letter-enclosures')
  const { resolveEnclosurePath } = await import('./letter-enclosure-storage')
  const { generateStoredName } = await import('./attachments/storage')
  const good = `letter-enclosure:${generateStoredName('.pdf')}`
  assert.ok(enclosureHasFile(good))
  const root = join(ROOT, 'var', 'test-letter-root')
  assert.equal(resolveEnclosurePath(good, root), join(root, enclosureStoredName(good)!))
  for (const bad of [
    '/mock/letters/abc/123-file.pdf',
    'letter-enclosure:../../etc/passwd',
    'letter-enclosure:1700000000000-aaaaaaaaaaaaaaaaaaaaaaaa.pdf/../x',
    'letter-enclosure:',
    'letter-enclosure:evil.html',
    '',
  ]) {
    assert.equal(enclosureHasFile(bad), false, bad)
    assert.equal(resolveEnclosurePath(bad, root), null, bad)
  }
})

test('enclosure routes: multipart + validateUpload, no client storagePath, guarded download', () => {
  const r = (p: string) => readFileSync(join(ROOT, 'app/api/letters', p), 'utf8')
  const post = r('[id]/enclosures/route.ts')
  assert.ok(post.includes('validateUpload('))
  assert.ok(post.includes('letterReadGuard('))
  assert.ok(!/body\.storagePath|storagePath:\s*body/.test(post), 'client must not choose storagePath')
  const item = r('[id]/enclosures/[enclosureId]/route.ts')
  assert.equal((item.match(/letterReadGuard\(/g) ?? []).length, 2, 'GET and DELETE both guarded')
  assert.ok(item.includes('attachmentResponseHeaders('))
  assert.ok(item.includes('deleteEnclosureFile('))
})

test('reports: turnaround uses the approved submission; aggregates by status/type/people', async () => {
  const { aggregateLetterReport, letterMilestones, parseReportFilters } = await import('./letter-reports')
  const t = (h: number) => new Date(Date.UTC(2026, 8, 1) + h * 3_600_000)
  const events = [
    { letterId: 'a', action: 'LETTER_SUBMITTED' as const, createdAt: t(0) },
    // rejected, resubmitted at 10h, approved at 12h, sent at 36h
    { letterId: 'a', action: 'LETTER_SUBMITTED' as const, createdAt: t(10) },
    { letterId: 'a', action: 'LETTER_APPROVED' as const, createdAt: t(12) },
    { letterId: 'a', action: 'LETTER_SENT' as const, createdAt: t(36) },
    { letterId: 'b', action: 'LETTER_SUBMITTED' as const, createdAt: t(0) },
    { letterId: 'b', action: 'LETTER_APPROVED' as const, createdAt: t(4) },
  ]
  const ms = letterMilestones(events).get('a')!
  assert.equal(ms.submittedAt!.getTime(), t(10).getTime())
  const base = {
    customerName: 'ACME', letterType: 'CL', letterTypeId: 'type-cl', typeName: 'Cover Letter', typeCode: 'CL',
    preparedById: 'u1', preparedByName: 'Abebe', signatoryId: 's1', signatoryName: 'Sara',
  }
  const report = aggregateLetterReport(
    [
      { ...base, id: 'a', status: 'SENT', date: t(0) },
      { ...base, id: 'b', status: 'APPROVED', date: t(0) },
      { ...base, id: 'c', status: 'DRAFT', date: new Date(Date.UTC(2026, 9, 2)), customerName: '', signatoryId: null, signatoryName: null },
    ],
    events,
    { filters: { from: null, to: null, letterTypeId: null }, truncated: false },
  )
  assert.equal(report.total, 3)
  assert.deepEqual(report.byStatus.map((s) => s.count), [1, 0, 1, 1, 0])
  assert.deepEqual(report.byMonth.map((m) => m.month), ['2026-09', '2026-10'])
  assert.equal(report.turnaround.submitToApprove.count, 2)
  assert.equal(report.turnaround.submitToApprove.avgHours, 3) // (2 + 4) / 2
  assert.equal(report.turnaround.approveToSend.avgHours, 24)
  assert.equal(report.turnaround.submitToSend.medianHours, 26)
  assert.equal(report.preparers[0].total, 3)
  assert.equal(report.signatories[0].total, 2)
  assert.equal(report.signatories[0].avgSubmitToApproveHours, 3)
  assert.ok(report.byCustomer.some((c) => c.customer === '(No customer)'))

  assert.ok('error' in parseReportFilters(new URLSearchParams('from=2026-13-40x')))
  assert.ok('error' in parseReportFilters(new URLSearchParams('from=2026-09-10&to=2026-09-01')))
  const f = parseReportFilters(new URLSearchParams('from=2026-09-01&to=2026-09-30&letterTypeId=x'))
  assert.ok(!('error' in f))
  const reportRoute = readFileSync(join(ROOT, 'lib/letter-reports.ts'), 'utf8')
  assert.ok(reportRoute.includes('buildLetterReadWhere('), 'report uses the list read scope')
})
