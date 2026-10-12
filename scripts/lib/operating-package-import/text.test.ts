import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { earliestDate, inferFiscalYear, isoDay, latestDate, parseDates, parseDurationMinutes, readTable, splitNames, truncate } from './text'

const days = (text: string) => parseDates(text).map(isoDay)

test('parseDates reads day-month(-year) tokens with fiscal-year inference', () => {
  assert.deepEqual(days('Fri 23 Oct 2026'), ['2026-10-23'])
  assert.deepEqual(days('31 Mar / 6 Jul 2027'), ['2027-03-31', '2027-07-06'])
  assert.deepEqual(days('30 Oct / 15 Nov / 30 Nov / 1 Dec 2026'), ['2026-10-30', '2026-11-15', '2026-11-30', '2026-12-01'])
  assert.deepEqual(days('Fri 16 Oct'), ['2026-10-16'])
  assert.deepEqual(days('31 Dec 2026 / 31 Jan / 31 Mar / 6 Jul 2027'), ['2026-12-31', '2027-01-31', '2027-03-31', '2027-07-06'])
  assert.deepEqual(days('before the AI note-taker joins client meetings (1 Nov)'), ['2026-11-01'])
  assert.deepEqual(days('Measured Q2; scored Q3 and Q4'), [])
  assert.deepEqual(days('≥30 days before go-live'), [])
})

test('parseDates falls back to month-only tokens', () => {
  assert.deepEqual(days('Dec 2026 / Mar 2027'), ['2026-12-31', '2027-03-31'])
  assert.deepEqual(days('statutory deadline, early Nov 2026'), ['2026-11-10'])
  assert.deepEqual(days('From Nov 2026'), [])
})

test('inferFiscalYear splits the year on 7 July', () => {
  assert.equal(inferFiscalYear(9, 12), 2026)
  assert.equal(inferFiscalYear(0, 31), 2027)
  assert.equal(inferFiscalYear(6, 6), 2027)
  assert.equal(inferFiscalYear(6, 7), 2026)
})

test('latestDate / earliestDate', () => {
  assert.equal(isoDay(latestDate('First by 31 Mar 2027; second by 6 Jul 2027')), '2027-07-06')
  assert.equal(isoDay(earliestDate('30 Oct 2026 / 31 Dec 2026')), '2026-10-30')
  assert.equal(latestDate('Quarterly'), null)
})

test('parseDurationMinutes', () => {
  assert.equal(parseDurationMinutes('30 min'), 30)
  assert.equal(parseDurationMinutes('1 h'), 60)
  assert.equal(parseDurationMinutes('90 min + 30 min prep'), 120)
  assert.equal(parseDurationMinutes('30–45 min'), 45)
  assert.equal(parseDurationMinutes('1–2 h'), 120)
  assert.equal(parseDurationMinutes('Half-day'), 240)
  assert.equal(parseDurationMinutes('2 days'), 960)
  assert.equal(parseDurationMinutes('~14 h'), 840)
  assert.equal(parseDurationMinutes('Automatic + 10 min per project'), 10)
  assert.equal(parseDurationMinutes('—'), null)
})

test('splitNames keeps parentheses together and splits lists', () => {
  assert.deepEqual(splitNames('Meklit; Betty'), ['Meklit', 'Betty'])
  assert.deepEqual(splitNames('Eden, Yohannes G'), ['Eden', 'Yohannes G'])
  assert.deepEqual(splitNames('Eyoel (team set-up; interim CPO function)'), ['Eyoel (team set-up; interim CPO function)'])
  assert.deepEqual(splitNames('Meklit / plan'), ['Meklit', 'plan'])
  assert.deepEqual(splitNames('Betty, Meklit and Eden'), ['Betty', 'Meklit', 'Eden'])
  assert.deepEqual(splitNames('—'), [])
})

test('readTable detects the header row under a note row', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Generated from the company dependency map.', '', ''],
    ['ID', 'Direction', 'Item'],
    ['DEP01', 'Inbound', 'Commission plan'],
    ['', '', ''],
    ['X01', 'Outbound', 'Bid data'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Links')
  const t = readTable(wb, 'Links', 'ID')
  assert.ok(t)
  assert.equal(t!.headerRow, 1)
  assert.deepEqual(t!.header, ['ID', 'Direction', 'Item'])
  assert.equal(t!.rows.length, 2)
  assert.equal(t!.rows[1].rowNumber, 5)
  assert.equal(readTable(wb, 'Missing', 'ID'), null)
})

test('truncate cuts on a word boundary', () => {
  assert.equal(truncate('short', 10), 'short')
  const out = truncate('one two three four five six seven', 15)
  assert.ok(out.length <= 15)
  assert.ok(out.endsWith('…'))
})
