export const DEMO_USER_EMAIL_SUFFIXES = ['@company.com'] as const

export function isSelectableSystemUserEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return !DEMO_USER_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

export function selectableSystemUserEmailWhere() {
  return {
    NOT: DEMO_USER_EMAIL_SUFFIXES.map((suffix) => ({
      email: { endsWith: suffix, mode: 'insensitive' as const },
    })),
  }
}
