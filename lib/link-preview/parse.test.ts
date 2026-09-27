import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePreviewMeta, MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH } from './parse'

/** LPV-6 / LPV-7 / LPV-AC-4 — metadata parsing. */

const URL_ = 'https://www.example.com/articles/one'

test('og:* wins over twitter:* and <title>', () => {
  const html = `<html><head>
    <title>Doc title</title>
    <meta name="twitter:title" content="Twitter title">
    <meta property="og:title" content="OG title">
    <meta name="twitter:description" content="Twitter desc">
    <meta property="og:description" content="OG desc">
    <meta name="description" content="Plain desc">
    <meta property="og:site_name" content="Example Site">
  </head><body></body></html>`
  const m = parsePreviewMeta(html, URL_)
  assert.equal(m.title, 'OG title')
  assert.equal(m.description, 'OG desc')
  assert.equal(m.siteName, 'Example Site')
  assert.equal(m.domain, 'example.com')
})

test('falls back twitter:* → <title> / meta description, and site name → hostname without www', () => {
  const tw = parsePreviewMeta('<head><title>T</title><meta name="twitter:title" content="TW"><meta name="twitter:description" content="TWD"></head>', URL_)
  assert.equal(tw.title, 'TW')
  assert.equal(tw.description, 'TWD')
  const plain = parsePreviewMeta('<head><title>  Just   the\n title </title><meta name="description" content="Plain"></head>', URL_)
  assert.equal(plain.title, 'Just the title')
  assert.equal(plain.description, 'Plain')
  assert.equal(plain.siteName, 'example.com')
})

test('attribute order and quoting do not matter', () => {
  const html = `<head>
    <meta content="Reversed" property="og:title" />
    <meta content='Single quoted' name='description'>
    <META CONTENT="Upper" PROPERTY="OG:SITE_NAME">
  </head>`
  const m = parsePreviewMeta(html, URL_)
  assert.equal(m.title, 'Reversed')
  assert.equal(m.description, 'Single quoted')
  assert.equal(m.siteName, 'Upper')
})

test('a > inside a quoted attribute does not break parsing', () => {
  const m = parsePreviewMeta('<head><meta property="og:title" content="a > b"></head>', URL_)
  assert.equal(m.title, 'a > b')
})

test('LPV-AC-4: a relative og:image resolves to an absolute https URL', () => {
  const m = parsePreviewMeta('<head><meta property="og:image" content="/img/card.png"></head>', 'https://host.example/path/page')
  assert.equal(m.image, 'https://host.example/img/card.png')
})

test('og:image:secure_url is preferred; twitter:image is the fallback', () => {
  const both = parsePreviewMeta(
    '<head><meta property="og:image" content="https://cdn.x.io/a.png"><meta property="og:image:secure_url" content="https://cdn.x.io/secure.png"></head>',
    URL_,
  )
  assert.equal(both.image, 'https://cdn.x.io/secure.png')
  const tw = parsePreviewMeta('<head><meta name="twitter:image:src" content="https://cdn.x.io/tw.png"></head>', URL_)
  assert.equal(tw.image, 'https://cdn.x.io/tw.png')
})

test('LPV-7: http images are dropped (no mixed content), falling through to the next candidate', () => {
  const only = parsePreviewMeta('<head><meta property="og:image" content="http://cdn.x.io/a.png"></head>', URL_)
  assert.equal(only.image, null)
  const next = parsePreviewMeta(
    '<head><meta property="og:image" content="http://cdn.x.io/a.png"><meta name="twitter:image" content="https://cdn.x.io/b.png"></head>',
    URL_,
  )
  assert.equal(next.image, 'https://cdn.x.io/b.png')
  // Relative image on an http page resolves to http → dropped.
  assert.equal(parsePreviewMeta('<head><meta property="og:image" content="/a.png"></head>', 'http://plain.example/').image, null)
  assert.equal(parsePreviewMeta('<head><meta property="og:image" content="javascript:alert(1)"></head>', URL_).image, null)
})

test('entities are decoded (named, decimal, hex)', () => {
  const m = parsePreviewMeta(
    '<head><title>Tom &amp; Jerry&#39;s &#x201C;Show&#x201D; &mdash; &hellip; &copy; &nbsp;x</title></head>',
    URL_,
  )
  assert.equal(m.title, "Tom & Jerry's “Show” — … © x")
})

test('favicon: picks the largest link[rel~=icon], resolves relatively, else apple-touch-icon, else /favicon.ico', () => {
  const sized = parsePreviewMeta(
    '<head><link rel="icon" href="/f16.png" sizes="16x16"><link rel="shortcut icon" href="/f32.png" sizes="32x32"><link rel="apple-touch-icon" href="/apple.png"></head>',
    URL_,
  )
  assert.equal(sized.favicon, 'https://www.example.com/f32.png')
  const apple = parsePreviewMeta('<head><link href="/apple.png" rel="apple-touch-icon"></head>', URL_)
  assert.equal(apple.favicon, 'https://www.example.com/apple.png')
  const none = parsePreviewMeta('<head><title>x</title></head>', URL_)
  assert.equal(none.favicon, 'https://www.example.com/favicon.ico')
  // An http page gets no favicon at all (the UI shows a globe) — never mixed content.
  assert.equal(parsePreviewMeta('<head></head>', 'http://plain.example/').favicon, null)
  // A mask-icon is not a favicon.
  assert.equal(
    parsePreviewMeta('<head><link rel="mask-icon" href="/mask.svg"></head>', URL_).favicon,
    'https://www.example.com/favicon.ico',
  )
})

test('title and description are length-capped', () => {
  const long = 'word '.repeat(200)
  const m = parsePreviewMeta(`<head><meta property="og:title" content="${long}"><meta property="og:description" content="${long}"></head>`, URL_)
  assert.ok(m.title && m.title.length <= MAX_TITLE_LENGTH, `title ${m.title?.length}`)
  assert.ok(m.description && m.description.length <= MAX_DESCRIPTION_LENGTH)
  assert.ok(m.title!.endsWith('…'))
})

test('metadata inside comments, scripts or the body is ignored; empty pages yield nulls', () => {
  const html = `<head><!-- <meta property="og:title" content="Commented"> -->
    <script>var s = '<meta property="og:title" content="Scripted">'</script>
    <title>Real</title></head><body><meta property="og:description" content="Body"><svg><title>Icon</title></svg></body>`
  const m = parsePreviewMeta(html, URL_)
  assert.equal(m.title, 'Real')
  assert.equal(m.description, null)
  const empty = parsePreviewMeta('', URL_)
  assert.equal(empty.title, null)
  assert.equal(empty.description, null)
  assert.equal(empty.image, null)
})

test('<base href> is honoured when resolving relative URLs', () => {
  const m = parsePreviewMeta('<head><base href="https://static.example.org/assets/"><meta property="og:image" content="card.png"></head>', URL_)
  assert.equal(m.image, 'https://static.example.org/assets/card.png')
})
