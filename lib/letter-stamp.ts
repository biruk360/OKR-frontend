/**
 * Company stamp on letters is Super Admin (ADMIN) only — not EXECUTIVE.
 * Prisma-free so the letter form client can share the same rule as the API.
 */
export function canAttachLetterCompanyStamp(role: string | null | undefined): boolean {
  return role === 'ADMIN'
}
