// Email service.
//
// Until SMTP is wired in via env vars, every send goes two places:
//   1. console.log (so server logs show the message body)
//   2. the `outbound_emails` table (status='LOGGED_ONLY') so we have an audit trail
//      and a queue we can later drain when SMTP is configured.
//
// To switch on real sending, set EMAIL_DRIVER=smtp and configure EMAIL_SERVER_* vars.

import { prisma } from '@/lib/prisma'
import nodemailer from 'nodemailer'
import { renderInvitationEmail } from '@/lib/email/templates/invitation'

// Hard block-list: addresses/domains that are known NOT to be real mailboxes
// (demo-seed fakes, role-placeholder users from the 360Ground import).
// Sending to them produces Gmail bounce DSNs back to the admin inbox.
// Rows for these recipients land in outbound_emails with status='FAILED' and
// a clear error, so the audit trail is preserved but nothing leaves the server.
const BLOCKED_RECIPIENT_DOMAINS = ['@company.com']
const BLOCKED_RECIPIENT_ADDRESSES = new Set<string>([
  'unassigned@360ground.com',
  'delivery@360ground.com',
  'all.ses@360ground.com',
  'finance@360ground.com',
  'hr@360ground.com',
  'wessagn@360ground.com',
  'pm.lead@360ground.com',
  'kalkidan@360ground.com',
  'biruk.hailu@360ground.et',
])

function isBlockedRecipient(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (BLOCKED_RECIPIENT_ADDRESSES.has(normalized)) return true
  return BLOCKED_RECIPIENT_DOMAINS.some((d) => normalized.endsWith(d))
}

interface UserInvitationEmailData {
  email: string
  name: string
  activationToken: string
  role: string
}

export interface MailMessage {
  to: string
  toName?: string | null
  subject: string
  text: string
  html?: string
  template?: string
  metadata?: Record<string, unknown>
}

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromEmail: string
  fromName?: string
}

let cachedTransport: nodemailer.Transporter | null = null

function loadSmtpConfig(): SmtpConfig {
  const host = process.env.EMAIL_SERVER_HOST
  const portRaw = process.env.EMAIL_SERVER_PORT
  const user = process.env.EMAIL_SERVER_USER
  const pass = process.env.EMAIL_SERVER_PASSWORD
  const fromEmail = process.env.EMAIL_FROM
  const fromName = process.env.EMAIL_FROM_NAME || undefined

  const port = Number(portRaw || 587)
  const secure = process.env.EMAIL_SERVER_SECURE
    ? process.env.EMAIL_SERVER_SECURE === 'true'
    : port === 465

  if (!host || !user || !pass || !fromEmail) {
    throw new Error('Missing SMTP env vars: EMAIL_SERVER_HOST, EMAIL_SERVER_USER, EMAIL_SERVER_PASSWORD, EMAIL_FROM')
  }
  if (!Number.isFinite(port)) {
    throw new Error('EMAIL_SERVER_PORT must be a number')
  }

  return { host, port, secure, user, pass, fromEmail, fromName }
}

async function deliverEmail(message: MailMessage): Promise<void> {
  const config = loadSmtpConfig()
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    })
  }

  const from = config.fromName
    ? `${config.fromName} <${config.fromEmail}>`
    : config.fromEmail

  await cachedTransport.sendMail({
    from,
    to: message.toName ? `${message.toName} <${message.to}>` : message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
}

/**
 * Send an email through the active driver. Without SMTP configured, this writes to the
 * outbound_emails table with status='LOGGED_ONLY' and mirrors to console.
 */
export async function sendMail(message: MailMessage): Promise<{ id: string; status: 'SENT' | 'LOGGED_ONLY' | 'FAILED' }> {
  const driver = (process.env.EMAIL_DRIVER || 'log').toLowerCase()

  // Always log to server output regardless of driver — keeps dev visibility.
  console.log('[email] queued', { driver, to: message.to, subject: message.subject })

  let status: 'SENT' | 'LOGGED_ONLY' | 'FAILED' = 'LOGGED_ONLY'
  let error: string | null = null

  // Hard block before any SMTP handoff — prevents bounce DSNs from known-fake recipients
  // regardless of DB state. Row is still persisted so the audit trail is intact.
  if (isBlockedRecipient(message.to)) {
    status = 'FAILED'
    error = 'blocked: recipient on fake-address block-list (see lib/email.ts)'
    console.warn('[email] blocked send to fake recipient', message.to)
  } else if (driver !== 'log') {
    try {
      await deliverEmail(message)
      status = 'SENT'
    } catch (err) {
      status = 'FAILED'
      error = err instanceof Error ? err.message : String(err)
      console.error('[email] driver send failed', err)
    }
  }

  try {
    const row = await prisma.outboundEmail.create({
      data: {
        toEmail: message.to,
        toName: message.toName ?? null,
        subject: message.subject,
        bodyText: message.text,
        bodyHtml: message.html ?? null,
        template: message.template ?? null,
        metadata: message.metadata ? JSON.stringify(message.metadata) : null,
        status,
        error,
        attempts: status === 'LOGGED_ONLY' ? 0 : 1,
        sentAt: status === 'SENT' ? new Date() : null,
      },
    })
    return { id: row.id, status }
  } catch (err) {
    console.error('[email] failed to persist outbound row', err)
    return { id: 'unpersisted', status: 'FAILED' }
  }
}

/**
 * Send the rich HTML welcome / invitation email to a new (or re-onboarded) user.
 * Uses lib/email/templates/invitation for the body so the bulk-send script and
 * the new-user API both render identical content. The activation link points at
 * /auth/reset-password (which handles both first-time setup and password reset).
 */
export async function sendUserInvitationEmail(data: UserInvitationEmailData & { expiresInHours?: number }) {
  const { email, name, activationToken, role, expiresInHours } = data
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const activationUrl = `${base}/auth/reset-password?token=${activationToken}`

  const rendered = renderInvitationEmail({
    name,
    email,
    role,
    activationUrl,
    expiresInHours,
  })

  await sendMail({
    to: email,
    toName: name,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    template: 'user-invitation',
    metadata: { role },
  })

  return { success: true }
}

// Email templates for other notifications
export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`
  await sendMail({
    to: email,
    subject: 'Password Reset Request - OKR System',
    text: `A password reset has been requested for your OKR System account.

To reset your password, please click the link below:

${resetUrl}

This link will expire in 1 hour.

If you did not request this password reset, please contact your administrator immediately.

For security reasons, any active sessions for your account have been invalidated and you will need to log in again after resetting your password.

Best regards,
The OKR System Team
`,
  })
  return { success: true }
}

export async function sendWelcomeEmail(email: string, name: string) {
  await sendMail({
    to: email,
    toName: name,
    subject: 'Welcome to OKR System!',
    text: `Dear ${name},

Your account has been successfully activated! Welcome to the OKR Management System.

You can now log in and start setting up your objectives and key results.

If you have any questions, please don't hesitate to contact your administrator.

Best regards,
The OKR System Team
`,
  })
  return { success: true }
}
