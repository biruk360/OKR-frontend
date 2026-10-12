import test from 'node:test'
import assert from 'node:assert/strict'
import * as path from 'path'
import { loadUserMap, normalisePersonName, PeopleResolver, type UserMapFile, type UserRow } from './people'

const USERS: UserRow[] = [
  { id: 'u-biruk', name: 'Biruk Hailu', email: 'biruk@360ground.com', isActive: true },
  { id: 'u-betty', name: 'Bethlehem Getahun', email: 'betty@360ground.com', isActive: true },
  { id: 'u-eden', name: 'Eden Tsega', email: 'eden@360ground.com', isActive: true },
  { id: 'u-yg', name: 'Yohannes Getachew', email: 'yohannes@360ground.com', isActive: true },
  { id: 'u-yt', name: 'Yohannes Taye', email: 'yt@360ground.com', isActive: true },
  { id: 'u-sara1', name: 'Sara Alemu', email: 's1@x.test', isActive: true },
  { id: 'u-sara2', name: 'Sara Bekele', email: 's2@x.test', isActive: true },
  { id: 'u-old', name: 'Eden Tsega', email: 'eden.old@x.test', isActive: false },
]

const MAP: UserMapFile = {
  people: [
    { name: 'Biruk Hailu', emails: ['biruk@360ground.com'], aliases: ['CEO', 'Biruk'] },
    { name: 'Bethlehem', emails: ['missing@360ground.com'], aliases: ['Betty'] },
    { name: 'Yohannes Getachew', aliases: ['Yohannes G'] },
    { name: 'Yohannes Taye', aliases: ['Yohannes T', 'Mobile & Banking Lead'] },
    { name: 'Mukuken', aliases: ['ERP Lead'] },
  ],
  nonPersons: ['Systems team', 'AI Lead'],
  nonPersonPatterns: ['\\bteams?\\b', '^each\\b'],
}

test('normalisePersonName strips qualifiers', () => {
  assert.equal(normalisePersonName('Eden (Bid Lead)'), 'Eden')
  assert.equal(normalisePersonName('CEO when needed'), 'CEO')
  assert.equal(normalisePersonName('Presales Lead when hired'), 'Presales Lead')
  assert.equal(normalisePersonName('Meklit (trade-finance playbook)'), 'Meklit')
})

test('aliases resolve by email, then name, then unique first name', () => {
  const r = new PeopleResolver(USERS, MAP)
  const ceo = r.resolve('CEO (chairs)')
  assert.equal(ceo.status, 'MATCHED')
  assert.equal(ceo.status === 'MATCHED' && ceo.userId, 'u-biruk')
  const betty = r.resolve('Betty')
  assert.equal(betty.status === 'MATCHED' && betty.userId, 'u-betty')
  assert.equal(betty.status === 'MATCHED' && betty.method, 'map: name (first name)')
  const yt = r.resolve('Mobile & Banking Lead (Meda product owner)')
  assert.equal(yt.status === 'MATCHED' && yt.userId, 'u-yt')
  const yg = r.resolve('Yohannes G')
  assert.equal(yg.status === 'MATCHED' && yg.userId, 'u-yg')
})

test('users-table fallback: full name, unique first name, active preferred', () => {
  const r = new PeopleResolver(USERS, MAP)
  const eden = r.resolve('Eden')
  assert.equal(eden.status === 'MATCHED' && eden.userId, 'u-eden')
  assert.equal(r.resolve('Sara').status, 'AMBIGUOUS')
  assert.equal(r.resolve('Yohannes').status, 'AMBIGUOUS')
  assert.equal(r.resolve('ERP Lead').status, 'UNMATCHED')
})

test('non-persons never become users', () => {
  const r = new PeopleResolver(USERS, MAP)
  assert.equal(r.resolve('Systems team').status, 'NON_PERSON')
  assert.equal(r.resolve('AI Lead').status, 'NON_PERSON')
  assert.equal(r.resolve("Yared's ERP team").status, 'NON_PERSON')
  assert.equal(r.resolve('Each direct report').status, 'NON_PERSON')
  assert.equal(r.resolve('—').status, 'NON_PERSON')
})

test('userIds de-duplicates a list cell', () => {
  const r = new PeopleResolver(USERS, MAP)
  assert.deepEqual(r.userIds('CEO, Biruk; Eden (battle cards); Systems team'), ['u-biruk', 'u-eden'])
})

test('the shipped user map is valid and covers every package owner alias', () => {
  const map = loadUserMap(path.resolve(__dirname, '../../data/operating-package-user-map.json'))
  const aliases = new Set(map.people.flatMap((p) => [p.name, ...(p.aliases ?? [])].map((a) => a.toLowerCase())))
  for (const a of ['ceo', 'biruk', 'betty', 'bethlehem', 'eden', 'eyoel', 'meklit', 'yared', 'yohannes g', 'yohannes t', 'mobile & banking lead', 'erp lead', 'mukuken']) {
    assert.ok(aliases.has(a), `alias ${a} missing`)
  }
})

test('reporting-line qualifiers', () => {
  assert.equal(normalisePersonName('CEO until then'), 'CEO')
  assert.equal(normalisePersonName('Head of Technology once hired'), 'Head of Technology')
  assert.equal(normalisePersonName('until the Head of Technology is hired (then the Head of Technology)'), '')
})

test('skip: true people resolve to SKIPPED even when an account exists, and are never user ids', () => {
  const map: UserMapFile = {
    ...MAP,
    people: MAP.people.map((p) => (p.name === 'Yohannes Taye' || p.name === 'Mukuken' ? { ...p, skip: true, skipReason: 'not assigned yet' } : p)),
  }
  const r = new PeopleResolver(USERS, map)
  const yt = r.resolve('Mobile & Banking Lead (Meda product owner)')
  assert.equal(yt.status, 'SKIPPED')
  assert.equal(r.resolve('ERP Lead').status, 'SKIPPED')
  assert.deepEqual(r.userIds('Eden; Yohannes T; ERP Lead'), ['u-eden'])
  // Yohannes Getachew is unaffected by Yohannes Taye being skipped.
  const yg = r.resolve('Yohannes G')
  assert.equal(yg.status === 'MATCHED' && yg.userId, 'u-yg')
})

test('the shipped user map skips Yohannes Taye and Mukuken (Muluken) only', () => {
  const shipped = loadUserMap(path.join(__dirname, '../../data/operating-package-user-map.json'))
  const skipped = shipped.people.filter((p) => p.skip).map((p) => p.name).sort()
  assert.deepEqual(skipped, ['Mukuken', 'Yohannes Taye'])
  const r = new PeopleResolver(USERS, shipped)
  assert.equal(r.resolve('Muluken').status, 'SKIPPED')
})
