import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RETRO_PLAIN_TEXT_MAX,
  RETRO_RICH_TEXT_MAX,
  parseRetrospectiveInput,
  sanitizeRetroRichText,
} from './retrospective-input'

const XSS = [
  '<img src=x onerror="alert(1)">',
  '<script>alert(1)</script>',
  '<a href="javascript:alert(1)">x</a>',
  '<p onclick="alert(1)">hi</p>',
  '<iframe src="https://evil.example"></iframe>',
  '<svg><script>alert(1)</script></svg>',
  '<style>body{display:none}</style>',
]

test('retro: script-bearing markup is stripped from rich fields', () => {
  for (const payload of XSS) {
    const out = sanitizeRetroRichText(payload)
    assert.doesNotMatch(out, /<script|onerror|onclick|javascript:|<iframe|<svg|<style/i, `${payload} -> ${out}`)
  }
})

test('retro: Tiptap output survives sanitising', () => {
  const html = '<p>We <strong>shipped</strong> <em>two</em> features</p><ul><li><p>one</p></li></ul>'
  const out = sanitizeRetroRichText(html)
  assert.match(out, /<strong>shipped<\/strong>/)
  assert.match(out, /<li>/)
})

test('retro: parse sanitises every rich field and keeps drafts partial', () => {
  const parsed = parseRetrospectiveInput({
    whatWasAchieved: '<p>ok</p><img src=x onerror=alert(1)>',
    whatWeLearned: '<script>alert(1)</script><p>lesson</p>',
    whatWentWell: '',
  })
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  assert.doesNotMatch(parsed.data.whatWasAchieved, /onerror/)
  assert.doesNotMatch(parsed.data.whatWeLearned, /script/i)
  assert.match(parsed.data.whatWeLearned, /lesson/)
  assert.equal(parsed.data.whatWentWell, null)
  assert.equal(parsed.data.whatBlockedUs, null)
  assert.equal(parsed.data.recommendedAction, '')
  assert.equal(parsed.data.wouldSetAgain, null)
})

test('retro: oversize and wrongly typed fields are rejected', () => {
  assert.equal(parseRetrospectiveInput({ whatWeLearned: 'x'.repeat(RETRO_RICH_TEXT_MAX + 1) }).ok, false)
  assert.equal(parseRetrospectiveInput({ gradeRationale: 'x'.repeat(RETRO_PLAIN_TEXT_MAX + 1) }).ok, false)
  assert.equal(parseRetrospectiveInput({ whatWasAchieved: { html: '<p>x</p>' } }).ok, false)
  assert.equal(parseRetrospectiveInput(null).ok, false)
  assert.equal(parseRetrospectiveInput([]).ok, false)
})

test('retro: enum fields are allowlisted', () => {
  assert.equal(parseRetrospectiveInput({ recommendedAction: 'ROLL_FORWARD' }).ok, true)
  assert.equal(parseRetrospectiveInput({ recommendedAction: '<b>x</b>' }).ok, false)
  assert.equal(parseRetrospectiveInput({ primaryBlocker: 'SCOPE_CREEP' }).ok, true)
  assert.equal(parseRetrospectiveInput({ primaryBlocker: '"><script>' }).ok, false)
  const booleans = parseRetrospectiveInput({ wouldSetAgain: true, wasAmbitious: 'yes' })
  assert.ok(booleans.ok && booleans.data.wouldSetAgain === true && booleans.data.wasAmbitious === null)
})
