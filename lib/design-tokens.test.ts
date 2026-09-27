/**
 * Design-token wiring: tailwind.config.js palette tokens → CSS variables in
 * app/globals.css. Run: `npx tsx --test lib/design-tokens.test.ts`.
 *
 * Guards the three ways this breaks silently (a missing variable compiles to a
 * colourless utility, not an error):
 *   1. a token references a variable the light `:root` block does not define;
 *   2. dark mode forgets to retarget it (the token stays light-on-dark);
 *   3. a variable holds a full colour instead of bare channels, which breaks
 *      every `/NN` opacity modifier.
 * Plus the WCAG contrast floor for ink on every surface in dark mode.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contrastRatio } from './card-visuals'

const ROOT = join(__dirname, '..')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require(join(ROOT, 'tailwind.config.js'))
const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

const PALETTE_FAMILIES = ['surface', 'ink', 'primary', 'success', 'warning', 'danger']

/** Declarations of the first rule whose selector list matches `selectorTest`. */
function varsOf(selectorTest: (sel: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {}
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = ruleRe.exec(css))) {
    const selectors = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim())
    if (!selectors.some(selectorTest)) continue
    for (const d of m[2].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
      const i = d.indexOf(':')
      if (i > 0 && d.trim().startsWith('--')) out[d.slice(0, i).trim()] = d.slice(i + 1).trim()
    }
  }
  return out
}

const light = varsOf((s) => s === ':root')
const dark = varsOf((s) => s === ':root.dark')

/** Resolve a token (string, or a Tailwind colour function) to the text it emits. */
function emitted(token: unknown): string {
  return typeof token === 'function' ? (token as (o: object) => string)({}) : String(token)
}

function paletteTokens(): Array<[string, string]> {
  const colors = config.theme.extend.colors as Record<string, Record<string, unknown>>
  const out: Array<[string, string]> = []
  for (const family of PALETTE_FAMILIES) {
    for (const [step, token] of Object.entries(colors[family])) {
      if (step === 'DEFAULT' || step === 'foreground') continue // shadcn HSL tokens
      out.push([`${family}-${step}`, emitted(token)])
    }
  }
  return out
}

const varNames = (s: string) => Array.from(s.matchAll(/var\((--[\w-]+)/g), (m) => m[1])
const rgbHex = (channels: string) =>
  '#' + channels.trim().split(/\s+/).map((n) => Number(n).toString(16).padStart(2, '0')).join('')

test('every palette token resolves to variables defined in light AND dark', () => {
  const tokens = paletteTokens()
  assert.ok(tokens.length >= 40, `expected the full palette, got ${tokens.length}`)
  for (const [name, value] of tokens) {
    const vars = varNames(value)
    assert.ok(vars.length > 0, `${name} is not variable-driven: ${value}`)
    for (const v of vars) {
      assert.ok(v in light, `${name}: ${v} missing from :root`)
      assert.ok(v in dark, `${name}: ${v} missing from :root.dark — dark mode would keep the light colour`)
    }
  }
})

test('palette variables hold bare channels, so opacity modifiers work', () => {
  for (const block of [light, dark]) {
    for (const [k, v] of Object.entries(block)) {
      if (k.startsWith('--rgb-')) assert.match(v, /^\d{1,3} \d{1,3} \d{1,3}$/, `${k}: "${v}"`)
    }
    assert.match(block['--ap-accent-lch'], /^[\d.]+ [\d.]+ [\d.]+$/)
  }
})

test('one accent: primary-500/600 and --ap-accent read the same variable', () => {
  const colors = config.theme.extend.colors
  assert.equal(emitted(colors.primary[500]), emitted(colors.primary[600]))
  assert.ok(emitted(colors.primary[500]).includes('var(--ap-accent-lch)'))
  assert.equal(light['--ap-accent'], 'oklch(var(--ap-accent-lch))')
  assert.equal(dark['--ap-accent'], 'oklch(var(--ap-accent-lch))')
})

test('light values are the original palette hexes (no light-mode drift)', () => {
  const ORIGINAL: Record<string, string> = {
    'surface-app': '#f2f2f7', 'surface-card': '#ffffff', 'surface-sidebar': '#f9f9fb',
    'surface-hover': '#f9f9fb', 'surface-muted': '#e5e5ea',
    'ink-primary': '#1d1d1f', 'ink-secondary': '#8e8e93', 'ink-tertiary': '#d1d1d6',
    'success-500': '#34c759', 'warning-500': '#ff9500', 'danger-500': '#ff3b30',
    'danger-700': '#b32a22', 'success-700': '#248a3d', 'warning-800': '#8a5000',
  }
  for (const [name, hex] of Object.entries(ORIGINAL)) {
    assert.equal(rgbHex(light[`--rgb-${name}`]), hex, name)
  }
  assert.equal(light['--ap-tint-scale'], '1')
})

test('dark mode: ink clears WCAG on every surface', () => {
  const surfaces = ['surface-app', 'surface-card', 'surface-sidebar', 'surface-hover', 'surface-muted']
  const hex = (n: string) => rgbHex(dark[`--rgb-${n}`])
  for (const s of surfaces) {
    assert.ok(contrastRatio(hex('ink-primary'), hex(s)) >= 4.5, `ink-primary on ${s}`)
    assert.ok(contrastRatio(hex('ink-secondary'), hex(s)) >= 4.5, `ink-secondary on ${s}`)
    // Tertiary is the disabled / decorative tier (1.5:1 in light) — 3:1 floor.
    assert.ok(contrastRatio(hex('ink-tertiary'), hex(s)) >= 3, `ink-tertiary on ${s}`)
  }
  for (const t of ['primary-700', 'success-600', 'success-700', 'warning-600', 'warning-700', 'danger-500', 'danger-600', 'danger-700']) {
    for (const s of ['surface-app', 'surface-card', 'surface-hover']) {
      assert.ok(contrastRatio(hex(t), hex(s)) >= 4.5, `${t} on ${s}: ${contrastRatio(hex(t), hex(s)).toFixed(2)}`)
    }
  }
})
