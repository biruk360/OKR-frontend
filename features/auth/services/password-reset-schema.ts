import { z } from 'zod'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './signup-schema'

/**
 * Client-side contracts for the two secondary auth screens. The bounds match
 * what POST /api/auth/forgot-password and POST /api/auth/reset-password enforce
 * (the reset route imports PASSWORD_MIN/MAX_LENGTH from signup-schema too), so
 * a value the form accepts is never rejected server-side for shape alone.
 */

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(254, 'That email address is too long.')
    .email('That does not look like an email address.'),
})

export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>

export const resetPasswordFormSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`),
    confirmPassword: z.string().min(1, 'Re-enter the password.'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match.',
  })

export type ResetPasswordFormValues = z.input<typeof resetPasswordFormSchema>
