import { z } from 'zod'

/**
 * Self-service sign-up contract, shared by the /auth/signup form and
 * POST /api/auth/register so client and server validate identically.
 *
 * Deliberately has NO `role` field: public sign-up always creates an EMPLOYEE.
 * Unknown keys (e.g. a hand-crafted `role: 'ADMIN'`) are stripped by zod.
 */

export const PASSWORD_MIN_LENGTH = 8
/** bcrypt only hashes the first 72 bytes; cap well above that but bounded. */
export const PASSWORD_MAX_LENGTH = 128

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Email is too long')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`),
})

export type RegisterInput = z.infer<typeof registerSchema>

export const signUpFormSchema = registerSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

export type SignUpFormValues = z.input<typeof signUpFormSchema>
