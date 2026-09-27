import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { escapeScrumHtml, sanitizeScrumRichText, sanitizeScrumRichTextOrNull } from './html'
import { parseHtmlToItems, serializeItemsToHtml } from './items'

describe('escapeScrumHtml', () => {
  it('escapes every markup-significant character', () => {
    assert.equal(escapeScrumHtml(`<img src=x onerror="alert('1')">&`), '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;')
  })
})

describe('serializeItemsToHtml (stored XSS regression)', () => {
  it('escapes item text instead of concatenating raw markup', () => {
    const html = serializeItemsToHtml([{ id: '1', text: '<script>alert(1)</script>' }, { id: '2', text: 'a & b' }])
    assert.equal(html, '<p>• &lt;script&gt;alert(1)&lt;/script&gt;</p><p>• a &amp; b</p>')
    assert.ok(!html.includes('<script'))
  })

  it('stays safe on the legacy path where stripHtml decodes &lt; back to <', () => {
    const items = parseHtmlToItems('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
    assert.equal(items[0].text, '<img src=x onerror=alert(1)>')
    const html = serializeItemsToHtml(items)
    assert.ok(!/<img/i.test(html))
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  })

  it('round-trips plain text through parse → serialize', () => {
    const html = serializeItemsToHtml([{ id: '1', text: 'Ship "v2" <beta>' }])
    assert.deepEqual(parseHtmlToItems(html).map((i) => i.text), ['Ship "v2" <beta>'])
  })
})

describe('sanitizeScrumRichText', () => {
  it('keeps allow-listed formatting tags and strips their attributes', () => {
    assert.equal(
      sanitizeScrumRichText('<p class="x" onclick="evil()">Hi <strong style="color:red">there</strong></p><ul><li>one</li></ul>'),
      '<p>Hi <strong>there</strong></p><ul><li>one</li></ul>',
    )
  })

  it('drops script/style/iframe blocks with their content', () => {
    assert.equal(sanitizeScrumRichText('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="//x"></iframe>'), '<p>a</p>')
  })

  it('escapes non-allow-listed tags so they render as text', () => {
    const out = sanitizeScrumRichText('<img src=x onerror=alert(1)><svg onload=alert(1)>')
    assert.ok(!/<img|<svg/i.test(out))
    assert.ok(out.includes('&lt;img'))
  })

  it('cannot be broken out of with a > inside an attribute', () => {
    const out = sanitizeScrumRichText('<p title=">"><img src=x onerror=alert(1)>')
    assert.equal(out, '<p>"&gt;&lt;img src=x onerror=alert(1)&gt;')
  })

  it('neutralises comments and stray angle brackets', () => {
    const out = sanitizeScrumRichText('<!--<img src=x onerror=alert(1)>--> 2 < 3 > 1')
    assert.ok(!/<img|<!--/.test(out))
  })

  it('keeps only safe hrefs on links and forces rel/target', () => {
    assert.equal(
      sanitizeScrumRichText('<a href="https://example.com/?a=1&amp;b=2" onclick="x()">ok</a>'),
      '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok</a>',
    )
    assert.equal(sanitizeScrumRichText('<a href="javascript:alert(1)">x</a>'), '<a>x</a>')
    assert.equal(sanitizeScrumRichText('<a href="jav&#x09;ascript:alert(1)">x</a>'), '<a>x</a>')
    assert.equal(sanitizeScrumRichText('<a href=" JaVaScRiPt:alert(1)">x</a>'), '<a>x</a>')
    assert.equal(sanitizeScrumRichText('<a href="data:text/html,<script>">x</a>'), '<a>"&gt;x</a>')
    assert.equal(sanitizeScrumRichText("<a href='data:text/html;base64,PHNjcmlwdD4='>x</a>"), '<a>x</a>')
    assert.equal(sanitizeScrumRichText('<a href="//evil.com">x</a>'), '<a>x</a>')
  })

  it('returns null for empty input via the nullable helper', () => {
    assert.equal(sanitizeScrumRichTextOrNull(''), null)
    assert.equal(sanitizeScrumRichTextOrNull(null), null)
    assert.equal(sanitizeScrumRichTextOrNull('<script>x</script>'), null)
  })
})
