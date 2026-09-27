import crypto from 'node:crypto'

/**
 * Invite / password-reset tokens (stored in `User.activationToken`).
 *
 * - Generated with a CSPRNG (32 random bytes, hex) — never Math.random.
 * - Only a SHA-256 hash is stored, prefixed with `sha256:` so a stored value can
 *   never be replayed as a token (a leaked DB row is not a working reset link).
 * - Lookup also accepts a legacy raw value so links issued before this change
 *   (and by scripts that still store raw tokens) keep working until they expire.
 *   A submitted token that already carries the hash prefix is refused outright,
 *   otherwise a leaked hash would match the legacy raw branch.
 */

export const HASHED_TOKEN_PREFIX = 'sha256:'

/** A fresh raw token to put in the emailed link. */
export function generateAuthToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** The value to persist in `User.activationToken` for `raw`. */
export function hashAuthToken(raw: string): string {
  return HASHED_TOKEN_PREFIX + crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
}

/** Stored values that `raw` may match. Empty when `raw` is unusable. */
export function authTokenLookupValues(raw: string): string[] {
  const token = raw.trim()
  if (!token || token.length > 256 || token.startsWith(HASHED_TOKEN_PREFIX)) return []
  return [hashAuthToken(token), token]
}

/**
 * Session-epoch check. `authTimeMs` is when the credentials were last proven
 * (the `authTime` JWT claim, epoch ms). A session/bearer token minted before the
 * account's `passwordChangedAt` is stale and must be rejected.
 *
 * A token without any auth time is treated as stale once a password change has
 * been recorded — there is no way to prove it is newer.
 */
export function isAuthTimeStale(
  authTimeMs: number | null | undefined,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt) return false
  if (typeof authTimeMs !== 'number' || !Number.isFinite(authTimeMs)) return true
  return authTimeMs < passwordChangedAt.getTime()
}

/** Read the auth time (ms) from a decoded JWT: `authTime`, else legacy `iat` (s). */
export function authTimeFromClaims(claims: Record<string, unknown> | null | undefined): number | null {
  if (!claims) return null
  if (typeof claims.authTime === 'number') return claims.authTime
  if (typeof claims.iat === 'number') return claims.iat * 1000
  return null
}
