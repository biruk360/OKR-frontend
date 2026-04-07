/**
 * Demo credentials shown on the sign-in page and applied by Prisma seeds.
 * After changing the password, re-run `npm run db:seed` (or your deploy seed) so stored hashes match.
 */
export const DEMO_SEED_PASSWORD = 'admin123' as const

export const DEMO_SEED_ACCOUNTS = [
  { label: 'System Administrator', role: 'ADMIN', email: 'admin@company.com' },
  { label: 'Biruk Hailu', role: 'ADMIN', email: 'biruk@360ground.com' },
  { label: 'Alex Rodriguez', role: 'EMPLOYEE', email: 'engineer1@company.com' },
  { label: 'David Brown', role: 'EMPLOYEE', email: 'marketer1@company.com' },
] as const
