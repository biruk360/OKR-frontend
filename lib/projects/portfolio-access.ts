import type { UserRole } from '@/lib/permissions'

/**
 * Who may read the cross-project portfolio (dashboard, portfolio report, WBR
 * pack and their PDFs): executives and department leads — build spec §5.1,
 * portfolio views are management views. Single source for the page gate and
 * every /api/projects/portfolio/** route, so they can never disagree.
 */
export const PORTFOLIO_READ_ROLES: readonly UserRole[] = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']

export function canReadPortfolio(role: string | null | undefined): boolean {
  return !!role && (PORTFOLIO_READ_ROLES as readonly string[]).includes(role)
}
