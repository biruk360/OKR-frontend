import test from 'node:test'
import assert from 'node:assert/strict'
import {
  krProgressFraction,
  krProgressPercent,
  normalizeKrDirection,
  parseStartAndTarget,
} from './keyResultNumbers'

test('INCREASE (default): unchanged rules — target > 0 and start < target', () => {
  assert.deepEqual(parseStartAndTarget('', '10'), { ok: true, start: 0, target: 10 })
  assert.deepEqual(parseStartAndTarget(5, 10, 'INCREASE'), { ok: true, start: 5, target: 10 })
  assert.equal(parseStartAndTarget(0, 0).ok, false)
  assert.equal(parseStartAndTarget(-5, -1).ok, false) // target must be > 0
  assert.equal(parseStartAndTarget(10, 10).ok, false)
  assert.equal(parseStartAndTarget(12, 10).ok, false)
  assert.equal(parseStartAndTarget('abc', 10).ok, false)
  assert.equal(parseStartAndTarget(0, undefined).ok, false)
})

test('DECREASE (KRX-1): target < start allowed, target may be 0, start === target rejected', () => {
  assert.deepEqual(parseStartAndTarget(20, 5, 'DECREASE'), { ok: true, start: 20, target: 5 })
  assert.deepEqual(parseStartAndTarget(8, 0, 'DECREASE'), { ok: true, start: 8, target: 0 })
  assert.deepEqual(parseStartAndTarget('100', '85', 'decrease'), { ok: true, start: 100, target: 85 })
  const eq = parseStartAndTarget(5, 5, 'DECREASE')
  assert.equal(eq.ok, false)
  if (!eq.ok) assert.match(eq.message, /different/)
  const up = parseStartAndTarget(5, 10, 'DECREASE')
  assert.equal(up.ok, false)
  if (!up.ok) assert.match(up.message, /lower than Start/)
})

test('normalizeKrDirection: anything but DECREASE is INCREASE', () => {
  assert.equal(normalizeKrDirection('DECREASE'), 'DECREASE')
  assert.equal(normalizeKrDirection(' decrease '), 'DECREASE')
  assert.equal(normalizeKrDirection(undefined), 'INCREASE')
  assert.equal(normalizeKrDirection('UP'), 'INCREASE')
})

test('krProgressFraction: INCREASE over the span with a non-zero start (FND-3)', () => {
  assert.equal(krProgressFraction({ startValue: 100, targetValue: 300, currentValue: 150 }), 0.25)
  assert.equal(krProgressFraction({ startValue: 100, targetValue: 300, currentValue: 50 }), 0) // clamped
  assert.equal(krProgressFraction({ startValue: 100, targetValue: 300, currentValue: 999 }), 1) // clamped
  assert.equal(krProgressFraction({ startValue: null, targetValue: 10, currentValue: 5 }), 0.5)
  assert.equal(krProgressFraction({ startValue: 5, targetValue: 5, currentValue: 5 }), null)
  assert.equal(krProgressFraction({ startValue: 10, targetValue: 5, currentValue: 7 }), null) // legacy wrong-way row
})

test('krProgressFraction: DECREASE = (start − current) / (start − target) (KRX-1)', () => {
  assert.equal(krProgressFraction({ startValue: 20, targetValue: 5, currentValue: 11, direction: 'DECREASE' }), 0.6)
  assert.equal(krProgressFraction({ startValue: 8, targetValue: 0, currentValue: 0, direction: 'DECREASE' }), 1)
  assert.equal(krProgressFraction({ startValue: 8, targetValue: 0, currentValue: 12, direction: 'DECREASE' }), 0)
  assert.equal(krProgressFraction({ startValue: 5, targetValue: 10, currentValue: 7, direction: 'DECREASE' }), null)
  assert.equal(krProgressPercent({ startValue: 20, targetValue: 5, currentValue: 11, direction: 'DECREASE' }), 60)
  assert.equal(krProgressPercent({ startValue: 5, targetValue: 5, currentValue: 5 }), 0)
})
