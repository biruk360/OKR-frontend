import test from 'node:test'
import assert from 'node:assert/strict'
import { extractPreviewUrls, trimTrailingPunctuation } from './extract'

/** LPV-1 — which URLs get a preview card. */

test('collects anchor hrefs and bare URLs, de-duplicated, in document order', () => {
  const html =
    '<p>See <a href="https://github.com/vercel/next.js" target="_blank">https://github.com/vercel/next.js</a> ' +
    'and https://nodejs.org/en/docs then https://github.com/vercel/next.js#readme again.</p>'
  assert.deepEqual(extractPreviewUrls(html), ['https://github.com/vercel/next.js', 'https://nodejs.org/en/docs'])
})

test('decodes &amp; in hrefs and text', () => {
  const html = '<p><a href="https://example.com/search?a=1&amp;b=2">x</a> https://other.example/?q=1&amp;r=2</p>'
  assert.deepEqual(extractPreviewUrls(html), ['https://example.com/search?a=1&b=2', 'https://other.example/?q=1&r=2'])
})

test('trims trailing punctuation but keeps balanced parentheses', () => {
  assert.equal(trimTrailingPunctuation('https://x.io/a.'), 'https://x.io/a')
  assert.equal(trimTrailingPunctuation('https://x.io/a?!"'), 'https://x.io/a')
  assert.equal(trimTrailingPunctuation('https://en.wikipedia.org/wiki/Foo_(bar)'), 'https://en.wikipedia.org/wiki/Foo_(bar)')
  assert.equal(trimTrailingPunctuation('https://en.wikipedia.org/wiki/Foo_(bar)).'), 'https://en.wikipedia.org/wiki/Foo_(bar)')
  const html = '<p>(see https://x.io/docs), or https://en.wikipedia.org/wiki/Foo_(bar).</p>'
  assert.deepEqual(extractPreviewUrls(html), ['https://x.io/docs', 'https://en.wikipedia.org/wiki/Foo_(bar)'])
})

test('mention markup is ignored', () => {
  const html =
    '<p><span class="mention" data-type="mention" data-id="u1" data-label="https://evil.example">@https://evil.example</span> hi https://ok.example/</p>'
  assert.deepEqual(extractPreviewUrls(html), ['https://ok.example/'])
})

test('same-origin (in-app) links are skipped when an origin is given', () => {
  const html = '<p><a href="https://okr.360ground.com/dashboard/todos?card=1">card</a> https://github.com/</p>'
  assert.deepEqual(extractPreviewUrls(html, { origin: 'https://okr.360ground.com' }), ['https://github.com/'])
  assert.equal(extractPreviewUrls(html).length, 2)
})

test('caps at 3 by default and honours max', () => {
  const html = '<p>https://a.io https://b.io https://c.io https://d.io</p>'
  assert.deepEqual(extractPreviewUrls(html), ['https://a.io/', 'https://b.io/', 'https://c.io/'])
  assert.deepEqual(extractPreviewUrls(html, { max: 1 }), ['https://a.io/'])
})

test('mailto, relative, javascript and other schemes are skipped', () => {
  const html =
    '<p><a href="mailto:a@b.co">mail</a><a href="/dashboard">rel</a><a href="javascript:alert(1)">js</a>' +
    '<a href="ftp://files.example/x">ftp</a> https://ok.example/</p>'
  assert.deepEqual(extractPreviewUrls(html), ['https://ok.example/'])
})

test('plain-text (legacy) comments work; empty input yields nothing', () => {
  assert.deepEqual(extractPreviewUrls('check http://example.org/page, thanks'), ['http://example.org/page'])
  assert.deepEqual(extractPreviewUrls(''), [])
  assert.deepEqual(extractPreviewUrls('<p>no links here</p>'), [])
})
