import type { NextRequest } from 'next/server'
import { withRole } from '@/lib/api/withAuth'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { sendMail } from '@/lib/email'
import { isValidEmail } from '@/lib/utils'

type TestEmailBody = {
  to?: string
  toName?: string
  subject?: string
  text?: string
}

export const POST = withRole('ADMIN', async (req: NextRequest, { session }) => {
  let body: TestEmailBody = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const to = body.to ?? session.user.email ?? ''
  if (!to) return apiBadRequest('Recipient email is required')
  if (!isValidEmail(to)) return apiBadRequest('Invalid recipient email')

  const subject = body.subject?.trim() || 'OKR SMTP Test'
  const text =
    body.text?.trim() ||
    `Test email from OKR system. Sent by ${session.user.email ?? 'admin'}.`

  const result = await sendMail({
    to,
    toName: body.toName,
    subject,
    text,
  })

  return apiSuccess(result, {
    message: result.status === 'SENT' ? 'Email sent' : 'Email queued',
  })
})
