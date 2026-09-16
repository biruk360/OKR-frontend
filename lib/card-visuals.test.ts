import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_PALETTE,
  CARD_PATTERNS,
  swatchForColor,
  patternForColor,
  resolvePattern,
  patternBackgroundImage,
  contrastRatio,
  readableInk,
  relativeLuminance,
} from './card-visuals'

test('T-01: every palette swatch has a distinct colour and pattern', () => {
  const colors = CARD_PALETTE.map((s) => s.hex.toLowerCase())
  assert.equal(new Set(colors).size, colors.length, 'duplicate colour in palette')
  const patterns = CARD_PALETTE.map((s) => s.pattern)
  // Distinct textures are the whole point: two labels must stay tellable apart
  // in greyscale.
  assert.equal(new Set(patterns).size, patterns.length, 'duplicate pattern in palette')
  assert.equal(CARD_PALETTE.length, 10)
})

test('T-02: swatchForColor matches case-insensitively and rejects unknowns', () => {
  assert.equal(swatchForColor('#61BD4F')?.key, 'green')
  assert.equal(swatchForColor('#61bd4f')?.key, 'green')
  assert.equal(swatchForColor('  #61BD4F  ')?.key, 'green')
  assert.equal(swatchForColor('#123456'), null)
  assert.equal(swatchForColor(null), null)
  assert.equal(swatchForColor(undefined), null)
})

test('T-03: patternForColor is stable and defined for custom colours', () => {
  // A colour outside the palette still needs a deterministic texture, or the
  // same label would shimmer between patterns across renders.
  const a = patternForColor('#123456')
  const b = patternForColor('#123456')
  assert.equal(a, b)
  assert.ok(CARD_PATTERNS.includes(a))
  assert.equal(patternForColor(null), 'SOLID')
})

test('T-04: resolvePattern prefers a stored pattern, else derives one', () => {
  assert.equal(resolvePattern('DOTS', '#61BD4F'), 'DOTS')
  // Unknown stored values must not leak through to CSS.
  assert.equal(resolvePattern('NOT_A_PATTERN', '#61BD4F'), 'DIAGONAL')
  assert.equal(resolvePattern(null, '#61BD4F'), 'DIAGONAL')
  assert.equal(resolvePattern(undefined, '#EB5A46'), 'DOTS')
})

test('T-05: SOLID renders no overlay, every other pattern does', () => {
  assert.equal(patternBackgroundImage('SOLID'), '')
  for (const p of CARD_PATTERNS.filter((x) => x !== 'SOLID')) {
    assert.notEqual(patternBackgroundImage(p), '', `${p} produced no overlay`)
  }
})

test('T-06: relativeLuminance handles shorthand, longhand and bad input', () => {
  assert.equal(relativeLuminance('#000000'), 0)
  assert.equal(Math.round(relativeLuminance('#FFFFFF')), 1)
  assert.equal(relativeLuminance('#fff'), relativeLuminance('#ffffff'))
  // Garbage must not throw — it degrades to "treat as light".
  assert.equal(relativeLuminance('nonsense'), 1)
})

test('T-07: contrastRatio is symmetric and bounded', () => {
  const bw = contrastRatio('#000000', '#FFFFFF')
  assert.equal(Math.round(bw * 100) / 100, 21)
  assert.equal(contrastRatio('#FFFFFF', '#000000'), bw)
  assert.equal(contrastRatio('#123456', '#123456'), 1)
})

test('T-08: readableInk keeps every palette colour above 4.5:1 (CVR-4)', () => {
  // This is the acceptance criterion for full-bleed covers: the title sits
  // directly on the colour, so each swatch must support readable text.
  for (const sw of CARD_PALETTE) {
    const ink = readableInk(sw.hex)
    const ratio = contrastRatio(sw.hex, ink)
    assert.ok(ratio >= 4.5, `${sw.label} (${sw.hex}) only reaches ${ratio.toFixed(2)}:1 with ${ink}`)
  }
})

test('T-09: readableInk flips at the light/dark boundary', () => {
  assert.equal(readableInk('#FFFFFF'), '#1D1D1F')
  assert.equal(readableInk('#000000'), '#FFFFFF')
  // Slate is dark enough to need white; yellow is light enough to need black.
  assert.equal(readableInk('#344563'), '#FFFFFF')
  assert.equal(readableInk('#F2D600'), '#1D1D1F')
})
