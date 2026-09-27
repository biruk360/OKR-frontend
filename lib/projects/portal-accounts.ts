import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authTokenLookupValues, generateAuthToken, hashAuthToken } from '@/lib/security/auth-tokens'

/**
 * Client-portal account management (remediation F5, 2026-09-25).
 *
 * Portal accounts (`ClientPortalUser`) are managed per project from Project
 * settings → Client portal. A project manager (or a management role that can
 * write the project) invites a client contact; the contact either sets their own
 * password through a one-time invite link, or receives a temporary password
 * from the PM out of band.
 *
 * No schema change: the model has no invite-token columns, so a pending invite
 * is stored in `passwordHash` itself as `invite:sha256:<hex>:<expiresMs>`:
 *   - only the SHA-256 of the CSPRNG token is stored (lib/security/auth-tokens),
 *     so a leaked row is not a working link;
 *   - such a value can never satisfy `bcrypt.compare` (not a 60-char bcrypt
 *     hash) and `authorize` also refuses it explicitly, so an invited account
 *     cannot sign in until the invite is accepted.
 *
 * Scope is project-by-project: `projectIds` is the hard scope (invariant #4 /
 * lib/portal-auth.ts). Revoking removes one project; an account with no
 * projects left is deactivated. A PM of project A never sees or edits another
 * project's scope, and granting access to an account that is already active on
 * other projects never touches its credentials, name or company.
 */

export const PORTAL_INVITE_PREFIX = 'invite:'
export const PORTAL_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const PORTAL_PASSWORD_MIN_LENGTH = 10
export const PORTAL_PASSWORD_MAX_LENGTH = 200
export const PORTAL_BCRYPT_COST = 12
export const PORTAL_ACCEPT_INVITE_PATH = '/portal/accept-invite'

export const portalPasswordSchema = z
  .string()
  .min(PORTAL_PASSWORD_MIN_LENGTH, `Password must be at least ${PORTAL_PASSWORD_MIN_LENGTH} characters`)
  .max(PORTAL_PASSWORD_MAX_LENGTH)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), 'Password must contain letters and numbers')

export const portalCredentialSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('INVITE'), sendEmail: z.boolean().optional() }),
  z.object({ mode: z.literal('PASSWORD'), password: portalPasswordSchema }),
])

export type PortalCredentialInput = z.infer<typeof portalCredentialSchema>

export const grantPortalAccessSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().min(2).max(120),
  clientName: z.string().trim().min(2).max(120),
  credential: portalCredentialSchema,
})

export const updatePortalAccountSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('RESEND_INVITE'), sendEmail: z.boolean().optional() }),
  z.object({ action: z.literal('SET_PASSWORD'), password: portalPasswordSchema }),
])

export const acceptPortalInviteSchema = z.object({
  token: z.string().trim().min(16).max(256),
  password: portalPasswordSchema,
})

export type PortalAccountStatus = 'ACTIVE' | 'INVITED' | 'INVITE_EXPIRED' | 'INACTIVE'

/** Internal-facing summary for the PM's settings panel. Never sent to the portal. */
export interface PortalAccountSummary {
  id: string
  email: string
  name: string
  clientName: string
  status: PortalAccountStatus
  inviteExpiresAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

export interface PortalAccountRow {
  id: string
  email: string
  name: string
  clientName: string
  passwordHash: string
  projectIds: string[]
  isActive: boolean
  lastLoginAt: Date | null
  createdById: string
  createdAt: Date
}

/** The slice of the Prisma client the service needs (the real client satisfies it). */
export interface PortalAccountDb {
  clientPortalUser: {
    findMany(args: any): Promise<PortalAccountRow[]>
    findUnique(args: any): Promise<PortalAccountRow | null>
    findFirst(args: any): Promise<PortalAccountRow | null>
    create(args: any): Promise<PortalAccountRow>
    update(args: any): Promise<PortalAccountRow>
  }
}

export class PortalAccountError extends Error {
  constructor(readonly code: 'CONFLICT' | 'NOT_FOUND' | 'INVALID_INVITE' | 'EXPIRED_INVITE', message: string) {
    super(message)
    this.name = 'PortalAccountError'
  }
}

// ── credential encoding ──────────────────────────────────────────────────────

export function isPendingInviteCredential(passwordHash: string | null | undefined): boolean {
  return !!passwordHash && passwordHash.startsWith(PORTAL_INVITE_PREFIX)
}

/** The value stored in `passwordHash` for a pending invite. */
export function encodeInviteCredential(rawToken: string, expiresAt: Date): string {
  return `${PORTAL_INVITE_PREFIX}${hashAuthToken(rawToken)}:${expiresAt.getTime()}`
}

/** `passwordHash` prefix a raw invite token must match, or null if the token is unusable. */
export function inviteLookupPrefix(rawToken: string): string | null {
  // authTokenLookupValues rejects empty/overlong tokens and values that already
  // carry the hash prefix (a leaked hash can never be replayed as a token).
  const [hashed] = authTokenLookupValues(rawToken)
  return hashed ? `${PORTAL_INVITE_PREFIX}${hashed}:` : null
}

export function inviteExpiry(passwordHash: string): Date | null {
  if (!isPendingInviteCredential(passwordHash)) return null
  const ms = Number(passwordHash.slice(passwordHash.lastIndexOf(':') + 1))
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null
}

/**
 * Short, non-reversible fingerprint of the stored credential. It is put in the
 * portal JWT at sign-in; `getPortalSessionSafe` rejects a session whose
 * fingerprint no longer matches, so a password reset / re-invite ends every
 * existing session without a schema change.
 */
export function portalCredentialFingerprint(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash, 'utf8').digest('hex').slice(0, 24)
}

export function portalAccountStatus(row: Pick<PortalAccountRow, 'isActive' | 'passwordHash'>, now = new Date()): PortalAccountStatus {
  if (!row.isActive) return 'INACTIVE'
  if (!isPendingInviteCredential(row.passwordHash)) return 'ACTIVE'
  const expiresAt = inviteExpiry(row.passwordHash)
  return expiresAt && expiresAt.getTime() > now.getTime() ? 'INVITED' : 'INVITE_EXPIRED'
}

export function toPortalAccountSummary(row: PortalAccountRow, now = new Date()): PortalAccountSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    clientName: row.clientName,
    status: portalAccountStatus(row, now),
    inviteExpiresAt: inviteExpiry(row.passwordHash)?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export function portalInvitePath(rawToken: string): string {
  return `${PORTAL_ACCEPT_INVITE_PATH}?token=${encodeURIComponent(rawToken)}`
}

interface ResolvedCredential {
  passwordHash: string
  inviteToken: string | null
  inviteExpiresAt: Date | null
}

async function resolveCredential(
  credential: { mode: 'INVITE' } | { mode: 'PASSWORD'; password: string },
  now: Date,
): Promise<ResolvedCredential> {
  if (credential.mode === 'PASSWORD') {
    return { passwordHash: await bcrypt.hash(credential.password, PORTAL_BCRYPT_COST), inviteToken: null, inviteExpiresAt: null }
  }
  const token = generateAuthToken()
  const expiresAt = new Date(now.getTime() + PORTAL_INVITE_TTL_MS)
  return { passwordHash: encodeInviteCredential(token, expiresAt), inviteToken: token, inviteExpiresAt: expiresAt }
}

// ── service operations ───────────────────────────────────────────────────────

export async function listProjectPortalAccounts(db: PortalAccountDb, projectId: string, now = new Date()): Promise<PortalAccountSummary[]> {
  const rows = await db.clientPortalUser.findMany({
    where: { projectIds: { has: projectId } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
  return rows.map((row) => toPortalAccountSummary(row, now))
}

export interface GrantPortalAccessResult {
  account: PortalAccountSummary
  /** A new account was created (false when an existing account gained this project). */
  created: boolean
  /** Credentials were (re)set — false when an active account on other projects was only re-scoped. */
  credentialChanged: boolean
  /** Raw invite token (only in the response to the PM; only its hash is stored). */
  inviteToken: string | null
}

export async function grantPortalAccess(
  db: PortalAccountDb,
  input: {
    projectId: string
    email: string
    name: string
    clientName: string
    credential: { mode: 'INVITE' } | { mode: 'PASSWORD'; password: string }
    actorId: string
    now?: Date
  },
): Promise<GrantPortalAccessResult> {
  const now = input.now ?? new Date()
  const email = input.email.trim().toLowerCase()
  const existing = await db.clientPortalUser.findUnique({ where: { email } })

  if (!existing) {
    const credential = await resolveCredential(input.credential, now)
    const row = await db.clientPortalUser.create({
      data: {
        email,
        name: input.name.trim(),
        clientName: input.clientName.trim(),
        passwordHash: credential.passwordHash,
        projectIds: [input.projectId],
        isActive: true,
        createdById: input.actorId,
      },
    })
    return { account: toPortalAccountSummary(row, now), created: true, credentialChanged: true, inviteToken: credential.inviteToken }
  }

  const hasProject = existing.projectIds.includes(input.projectId)
  if (existing.isActive && hasProject) {
    throw new PortalAccountError('CONFLICT', 'This email already has portal access to this project')
  }

  const projectIds = hasProject ? existing.projectIds : [...existing.projectIds, input.projectId]
  const dormant = !existing.isActive || existing.projectIds.length === 0
  if (!dormant) {
    // Active on other projects: only widen the scope. Credentials, name and
    // company belong to the account, not to this project.
    const row = await db.clientPortalUser.update({ where: { id: existing.id }, data: { projectIds } })
    return { account: toPortalAccountSummary(row, now), created: false, credentialChanged: false, inviteToken: null }
  }

  // A deactivated account is re-issued like a new one: never silently revive an old password.
  const credential = await resolveCredential(input.credential, now)
  const row = await db.clientPortalUser.update({
    where: { id: existing.id },
    data: {
      projectIds,
      isActive: true,
      name: input.name.trim(),
      clientName: input.clientName.trim(),
      passwordHash: credential.passwordHash,
    },
  })
  return { account: toPortalAccountSummary(row, now), created: false, credentialChanged: true, inviteToken: credential.inviteToken }
}

/** The account, only if it is in this project's scope. */
export async function findProjectPortalAccount(db: PortalAccountDb, projectId: string, accountId: string): Promise<PortalAccountRow | null> {
  return db.clientPortalUser.findFirst({ where: { id: accountId, projectIds: { has: projectId } } })
}

export async function resetPortalCredential(
  db: PortalAccountDb,
  input: {
    projectId: string
    accountId: string
    credential: { mode: 'INVITE' } | { mode: 'PASSWORD'; password: string }
    now?: Date
  },
): Promise<{ account: PortalAccountSummary; inviteToken: string | null }> {
  const now = input.now ?? new Date()
  const existing = await findProjectPortalAccount(db, input.projectId, input.accountId)
  if (!existing || !existing.isActive) throw new PortalAccountError('NOT_FOUND', 'Portal account not found for this project')
  const credential = await resolveCredential(input.credential, now)
  const row = await db.clientPortalUser.update({ where: { id: existing.id }, data: { passwordHash: credential.passwordHash } })
  return { account: toPortalAccountSummary(row, now), inviteToken: credential.inviteToken }
}

export async function revokePortalAccess(
  db: PortalAccountDb,
  input: { projectId: string; accountId: string; now?: Date },
): Promise<{ account: PortalAccountSummary; deactivated: boolean }> {
  const existing = await findProjectPortalAccount(db, input.projectId, input.accountId)
  if (!existing) throw new PortalAccountError('NOT_FOUND', 'Portal account not found for this project')
  const projectIds = existing.projectIds.filter((id) => id !== input.projectId)
  const deactivated = projectIds.length === 0
  const row = await db.clientPortalUser.update({
    where: { id: existing.id },
    data: { projectIds, ...(deactivated ? { isActive: false } : {}) },
  })
  return { account: toPortalAccountSummary(row, input.now), deactivated }
}

/** What the accept-invite page may show before the password is chosen. */
export async function peekPortalInvite(
  db: PortalAccountDb,
  rawToken: string,
  now = new Date(),
): Promise<{ email: string; name: string } | null> {
  const row = await findInviteRow(db, rawToken)
  if (!row) return null
  const expiresAt = inviteExpiry(row.passwordHash)
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) return null
  return { email: row.email, name: row.name }
}

export async function acceptPortalInvite(
  db: PortalAccountDb,
  input: { token: string; password: string; now?: Date },
): Promise<{ accountId: string; email: string; projectIds: string[] }> {
  const now = input.now ?? new Date()
  const row = await findInviteRow(db, input.token)
  if (!row) throw new PortalAccountError('INVALID_INVITE', 'This invite link is invalid or has already been used')
  const expiresAt = inviteExpiry(row.passwordHash)
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    throw new PortalAccountError('EXPIRED_INVITE', 'This invite link has expired. Ask your project manager for a new one.')
  }
  const passwordHash = await bcrypt.hash(input.password, PORTAL_BCRYPT_COST)
  const updated = await db.clientPortalUser.update({ where: { id: row.id }, data: { passwordHash } })
  return { accountId: updated.id, email: updated.email, projectIds: updated.projectIds }
}

async function findInviteRow(db: PortalAccountDb, rawToken: string): Promise<PortalAccountRow | null> {
  const prefix = inviteLookupPrefix(rawToken)
  if (!prefix) return null
  const row = await db.clientPortalUser.findFirst({ where: { isActive: true, passwordHash: { startsWith: prefix } } })
  // Defence in depth: the fake/real DB filter and this check must agree.
  if (!row || !row.isActive || !row.passwordHash.startsWith(prefix)) return null
  return row
}

/** Invite email body. Signed by the company, never by an employee (invariant #4). */
export function portalInviteEmail(input: { name: string; clientName: string; projectName: string; url: string; expiresAt: Date }) {
  const expires = input.expiresAt.toUTCString()
  const text = [
    `Hello ${input.name},`,
    '',
    `You have been given access to the 360Ground client portal for "${input.projectName}" (${input.clientName}).`,
    `Set your password here: ${input.url}`,
    '',
    `This link can be used once and expires on ${expires}.`,
    '— 360Ground',
  ].join('\n')
  const html = `<p>Hello ${escapeHtml(input.name)},</p>
<p>You have been given access to the 360Ground client portal for <strong>${escapeHtml(input.projectName)}</strong> (${escapeHtml(input.clientName)}).</p>
<p><a href="${escapeHtml(input.url)}">Set your password</a></p>
<p>This link can be used once and expires on ${escapeHtml(expires)}.</p>
<p>— 360Ground</p>`
  return { subject: `Your 360Ground client portal access — ${input.projectName}`, text, html }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}
