import { test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  acceptPortalInvite,
  encodeInviteCredential,
  grantPortalAccess,
  inviteExpiry,
  inviteLookupPrefix,
  isPendingInviteCredential,
  listProjectPortalAccounts,
  peekPortalInvite,
  portalAccountStatus,
  portalCredentialFingerprint,
  portalInviteEmail,
  portalPasswordSchema,
  PORTAL_INVITE_TTL_MS,
  resetPortalCredential,
  revokePortalAccess,
  type PortalAccountDb,
  type PortalAccountRow,
} from './portal-accounts'
import { hashAuthToken } from '../security/auth-tokens'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Minimal in-memory stand-in for prisma.clientPortalUser (only the filters the service uses). */
function fakeDb(seed: PortalAccountRow[] = []) {
  const rows = seed.map((r) => ({ ...r, projectIds: [...r.projectIds] }))
  let seq = rows.length
  const matches = (row: PortalAccountRow, where: any): boolean => {
    for (const [key, cond] of Object.entries(where ?? {})) {
      const value = (row as any)[key]
      if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        if ('has' in cond && !(value as string[]).includes((cond as any).has)) return false
        if ('startsWith' in cond && !String(value).startsWith((cond as any).startsWith)) return false
      } else if (value !== cond) return false
    }
    return true
  }
  const db: PortalAccountDb & { rows: PortalAccountRow[] } = {
    rows,
    clientPortalUser: {
      findMany: async ({ where }: any) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      findUnique: async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
      findFirst: async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `cpu${++seq}`, lastLoginAt: null, createdAt: new Date('2026-09-25T00:00:00Z'), ...data }
        rows.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id)!
        Object.assign(row, data)
        return { ...row }
      },
    },
  }
  return db
}

const NOW = new Date('2026-09-25T10:00:00Z')
const base = (over: Partial<PortalAccountRow>): PortalAccountRow => ({
  id: 'cpu-x',
  email: 'x@client.com',
  name: 'Client X',
  clientName: 'Meda',
  passwordHash: '$2a$04$abcdefghijklmnopqrstuuJ5oKcGf2i0wq2Gm0L0H9Y0tXmZC4w1a',
  projectIds: ['p1'],
  isActive: true,
  lastLoginAt: null,
  createdById: 'u-pm',
  createdAt: NOW,
  ...over,
})

test('invite credential: only the SHA-256 of the token is stored and it is never a bcrypt hash', () => {
  const expires = new Date(NOW.getTime() + PORTAL_INVITE_TTL_MS)
  const stored = encodeInviteCredential('a'.repeat(64), expires)
  assert.ok(isPendingInviteCredential(stored))
  assert.ok(!stored.includes('a'.repeat(64)), 'raw token must not be stored')
  assert.ok(stored.startsWith(`invite:${hashAuthToken('a'.repeat(64))}:`))
  assert.equal(inviteExpiry(stored)?.getTime(), expires.getTime())
  assert.equal(inviteLookupPrefix(hashAuthToken('abc')), null, 'a leaked hash cannot be replayed as a token')
  assert.equal(inviteLookupPrefix(''), null)
})

test('password policy: ≥10 chars with letters and digits', () => {
  assert.equal(portalPasswordSchema.safeParse('short1').success, false)
  assert.equal(portalPasswordSchema.safeParse('onlyletterss').success, false)
  assert.equal(portalPasswordSchema.safeParse('1234567890').success, false)
  assert.equal(portalPasswordSchema.safeParse('Sunrise2026x').success, true)
})

test('grant: new account via invite link is pending, cannot sign in, and is scoped to the project', async () => {
  const db = fakeDb()
  const result = await grantPortalAccess(db, {
    projectId: 'p1', email: ' New@Client.com ', name: 'New Contact', clientName: 'Meda',
    credential: { mode: 'INVITE' }, actorId: 'u-pm', now: NOW,
  })
  assert.equal(result.created, true)
  assert.ok(result.inviteToken && result.inviteToken.length >= 32)
  const row = db.rows[0]
  assert.equal(row.email, 'new@client.com')
  assert.deepEqual(row.projectIds, ['p1'])
  assert.ok(isPendingInviteCredential(row.passwordHash))
  assert.equal(await bcrypt.compare('anything', row.passwordHash), false)
  assert.equal(result.account.status, 'INVITED')
  assert.ok(!JSON.stringify(result.account).includes('invite:'), 'summary never exposes the stored credential')
})

test('grant: temporary password is bcrypt-hashed and the account is active', async () => {
  const db = fakeDb()
  const result = await grantPortalAccess(db, {
    projectId: 'p1', email: 'pw@client.com', name: 'Pw Contact', clientName: 'Meda',
    credential: { mode: 'PASSWORD', password: 'Sunrise2026x' }, actorId: 'u-pm', now: NOW,
  })
  assert.equal(result.inviteToken, null)
  assert.equal(result.account.status, 'ACTIVE')
  assert.equal(await bcrypt.compare('Sunrise2026x', db.rows[0].passwordHash), true)
})

test('grant: an account active on another project only gains scope — credentials, name and company untouched', async () => {
  const existing = base({ id: 'cpu1', email: 'shared@client.com', projectIds: ['p9'], name: 'Original', clientName: 'Other Co' })
  const db = fakeDb([existing])
  const result = await grantPortalAccess(db, {
    projectId: 'p1', email: 'shared@client.com', name: 'Renamed', clientName: 'Meda',
    credential: { mode: 'PASSWORD', password: 'Takeover2026x' }, actorId: 'u-pm', now: NOW,
  })
  assert.equal(result.created, false)
  assert.equal(result.credentialChanged, false)
  assert.equal(result.inviteToken, null)
  assert.deepEqual(db.rows[0].projectIds, ['p9', 'p1'])
  assert.equal(db.rows[0].passwordHash, existing.passwordHash)
  assert.equal(db.rows[0].name, 'Original')
  assert.equal(db.rows[0].clientName, 'Other Co')
})

test('grant: duplicate access to the same project is a conflict', async () => {
  const db = fakeDb([base({ id: 'cpu1', email: 'dup@client.com', projectIds: ['p1'] })])
  await assert.rejects(
    grantPortalAccess(db, { projectId: 'p1', email: 'dup@client.com', name: 'Dup', clientName: 'Meda', credential: { mode: 'INVITE' }, actorId: 'u', now: NOW }),
    /already has portal access/,
  )
})

test('grant: a deactivated account is re-issued fresh, never revived with its old password', async () => {
  const old = base({ id: 'cpu1', email: 'back@client.com', projectIds: [], isActive: false })
  const db = fakeDb([old])
  const result = await grantPortalAccess(db, {
    projectId: 'p1', email: 'back@client.com', name: 'Back Again', clientName: 'Meda',
    credential: { mode: 'INVITE' }, actorId: 'u', now: NOW,
  })
  assert.equal(result.credentialChanged, true)
  assert.equal(db.rows[0].isActive, true)
  assert.notEqual(db.rows[0].passwordHash, old.passwordHash)
  assert.ok(isPendingInviteCredential(db.rows[0].passwordHash))
})

test('list: only accounts scoped to the project, with derived status', async () => {
  const expired = encodeInviteCredential('t'.repeat(64), new Date(NOW.getTime() - 1000))
  const db = fakeDb([
    base({ id: 'a', email: 'a@c.com', projectIds: ['p1'] }),
    base({ id: 'b', email: 'b@c.com', projectIds: ['p2'] }),
    base({ id: 'c', email: 'c@c.com', projectIds: ['p1', 'p2'], passwordHash: expired }),
  ])
  const list = await listProjectPortalAccounts(db, 'p1', NOW)
  assert.deepEqual(list.map((a) => a.id).sort(), ['a', 'c'])
  assert.equal(list.find((a) => a.id === 'c')?.status, 'INVITE_EXPIRED')
  assert.equal(portalAccountStatus({ isActive: false, passwordHash: 'x' }), 'INACTIVE')
})

test('revoke: removes only this project; the last project deactivates the account', async () => {
  const db = fakeDb([base({ id: 'a', projectIds: ['p1', 'p2'] })])
  const first = await revokePortalAccess(db, { projectId: 'p1', accountId: 'a' })
  assert.equal(first.deactivated, false)
  assert.deepEqual(db.rows[0].projectIds, ['p2'])
  assert.equal(db.rows[0].isActive, true)
  await assert.rejects(revokePortalAccess(db, { projectId: 'p1', accountId: 'a' }), /not found for this project/)
  const last = await revokePortalAccess(db, { projectId: 'p2', accountId: 'a' })
  assert.equal(last.deactivated, true)
  assert.equal(db.rows[0].isActive, false)
})

test('reset: only accounts in this project; changes the credential fingerprint (ends sessions)', async () => {
  const db = fakeDb([base({ id: 'a', projectIds: ['p1'] }), base({ id: 'b', email: 'b@c.com', projectIds: ['p2'] })])
  const before = portalCredentialFingerprint(db.rows[0].passwordHash)
  const result = await resetPortalCredential(db, { projectId: 'p1', accountId: 'a', credential: { mode: 'INVITE' }, now: NOW })
  assert.ok(result.inviteToken)
  assert.notEqual(portalCredentialFingerprint(db.rows[0].passwordHash), before)
  await assert.rejects(resetPortalCredential(db, { projectId: 'p1', accountId: 'b', credential: { mode: 'INVITE' } }), /not found/)
})

test('accept: valid token sets the password once; reused, unknown and expired tokens fail', async () => {
  const db = fakeDb()
  const granted = await grantPortalAccess(db, {
    projectId: 'p1', email: 'inv@client.com', name: 'Invitee', clientName: 'Meda', credential: { mode: 'INVITE' }, actorId: 'u', now: NOW,
  })
  const token = granted.inviteToken!
  assert.deepEqual(await peekPortalInvite(db, token, NOW), { email: 'inv@client.com', name: 'Invitee' })
  assert.equal(await peekPortalInvite(db, 'f'.repeat(64), NOW), null)

  const accepted = await acceptPortalInvite(db, { token, password: 'Sunrise2026x', now: NOW })
  assert.deepEqual(accepted.projectIds, ['p1'])
  assert.equal(await bcrypt.compare('Sunrise2026x', db.rows[0].passwordHash), true)
  await assert.rejects(acceptPortalInvite(db, { token, password: 'Another2026x', now: NOW }), /invalid or has already been used/)

  const second = await resetPortalCredential(db, { projectId: 'p1', accountId: db.rows[0].id, credential: { mode: 'INVITE' }, now: NOW })
  const late = new Date(NOW.getTime() + PORTAL_INVITE_TTL_MS + 1)
  assert.equal(await peekPortalInvite(db, second.inviteToken!, late), null)
  await assert.rejects(acceptPortalInvite(db, { token: second.inviteToken!, password: 'Sunrise2026x', now: late }), /expired/)
})

test('invariant 4: the invite email is signed by the company, never by an employee', () => {
  const mail = portalInviteEmail({ name: 'Client X', clientName: 'Meda', projectName: 'Portal <b>', url: 'https://x/portal/accept-invite?token=t', expiresAt: NOW })
  assert.match(mail.text, /— 360Ground/)
  assert.match(mail.html, /Portal &lt;b&gt;/)
})

test('routes: portal account mutations are write-gated, transactional and audited; the token is never logged', () => {
  const list = read('app/api/projects/[id]/portal-users/route.ts')
  const item = read('app/api/projects/[id]/portal-users/[portalUserId]/route.ts')
  for (const src of [list, item]) {
    assert.match(src, /getWritableProject\(session, params\.id\)/)
    assert.match(src, /\{ client: tx, required: true \}/)
    assert.doesNotMatch(src, /metadata: \{[^}]*inviteToken/)
  }
  assert.equal((item.match(/recordActivity\(\{/g) ?? []).length, 2)
  const invite = read('app/api/portal/invite/route.ts')
  assert.match(invite, /hitRateLimit\(/)
  assert.match(invite, /recordActivity\(\{/)
})

test('portal auth: pending invites cannot sign in and sessions are re-validated against the account', () => {
  const src = read('lib/portal-auth.ts')
  assert.match(src, /isPendingInviteCredential\(client\.passwordHash\)/)
  assert.match(src, /portalCredentialFingerprint\(account\.passwordHash\)/)
  assert.match(src, /projectIds: \[\.\.\.account\.projectIds\]/)
  assert.match(src, /if \(!account\?\.isActive/)
})
