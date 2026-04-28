/**
 * Welcome / invitation email — used by:
 *   - lib/email.sendUserInvitationEmail (new-user flow from POST /api/users)
 *   - scripts/send-welcome-to-all-users.ts (bulk send)
 *
 * Single source of truth for the on-boarding email. Beautiful, mobile-friendly,
 * dark-mode tolerant inline-styled HTML with a plain-text fallback.
 */

export interface InvitationEmailData {
  /** Recipient name. */
  name: string
  /** Recipient email (used for personalization line). */
  email?: string
  /** Recipient role string ("ADMIN" / "EXECUTIVE" / "DEPARTMENT_LEAD" / "EMPLOYEE"). */
  role: string
  /** Absolute URL to the password setup / reset page. */
  activationUrl: string
  /** Hours until the activation/reset link expires. Default 168 (7 days). */
  expiresInHours?: number
}

export interface RenderedInvitationEmail {
  subject: string
  text: string
  html: string
}

// Design tokens — mirror tailwind.config.js so the email matches the in-app UI.
const PRIMARY = '#007AFF'
const PRIMARY_DARK = '#0051D5'
const INK = '#1D1D1F'
const MUTED = '#8E8E93'
const BORDER = '#E5E5EA'
const SOFT_BG = '#FAFAFC'
const APP_BG = '#F2F2F7'

function roleLabel(role: string): string {
  switch ((role || '').toUpperCase()) {
    case 'ADMIN': return 'Administrator'
    case 'EXECUTIVE': return 'Executive'
    case 'DEPARTMENT_LEAD': return 'Department Lead'
    case 'EMPLOYEE': return 'Team member'
    default: return role || 'Team member'
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

const FEATURES: Array<{ icon: string; title: string; body: string }> = [
  { icon: '🎯', title: 'Objectives & Key Results', body: 'Set ambitious goals and measure them with concrete, numeric key results.' },
  { icon: '🌳', title: 'Alignment Map', body: 'See how every team and individual goal rolls up to company strategy.' },
  { icon: '📈', title: 'Weekly Check-ins', body: 'Update progress and confidence on a cadence that works for your team.' },
  { icon: '✅', title: 'Initiatives & To-dos', body: 'Break work into actionable items and contribute to KR progress automatically.' },
  { icon: '🔔', title: 'Smart Notifications', body: 'In-app and email alerts you control per category, with daily/weekly digests.' },
  { icon: '📊', title: 'Reports & Insights', body: 'Track at-risk goals, missed check-ins, and team health at a glance.' },
]

const FIRST_STEPS: Array<{ num: number; title: string; body: string }> = [
  { num: 1, title: 'Set your password', body: 'Click the button below to choose a secure password. The link expires in 7 days.' },
  { num: 2, title: 'Sign in & explore', body: 'Visit the dashboard, look at the alignment map, and read your team\u2019s objectives.' },
  { num: 3, title: 'Create your first OKR', body: 'Add an individual objective for the current quarter and link it to a parent goal.' },
]

export function renderInvitationEmail(data: InvitationEmailData): RenderedInvitationEmail {
  const name = data.name || 'there'
  const role = roleLabel(data.role)
  const url = data.activationUrl
  const hours = data.expiresInHours ?? 168
  const expiresLabel = hours >= 24 ? `${Math.round(hours / 24)} days` : `${hours} hours`

  const subject = `Welcome to the OKR Management System — set up your account`

  const text = [
    `Hi ${name},`,
    '',
    `You've been invited to the OKR Management System as a ${role}. We use it to set goals, align across teams, and track progress every week.`,
    '',
    'WHAT TO DO ON YOUR FIRST LOGIN',
    ...FIRST_STEPS.map((s) => `${s.num}. ${s.title} — ${s.body}`),
    '',
    'Set your password here:',
    url,
    '',
    `(This link is valid for ${expiresLabel}.)`,
    '',
    'WHAT YOU CAN DO IN THE SYSTEM',
    ...FEATURES.map((f) => `• ${f.title} — ${f.body}`),
    '',
    'Once you\u2019re in, head to Settings → Notifications to choose how (and how often) you want to be notified.',
    '',
    'If you have questions, just reply to this email or contact your administrator.',
    '',
    '— The OKR Management System',
  ].join('\n')

  // Inline-styled HTML — table-based layout for maximum email-client compatibility.
  const featureCards = FEATURES.map((f) => `
    <td valign="top" width="50%" style="padding:8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SOFT_BG};border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:16px;">
          <div style="font-size:22px;line-height:1;margin-bottom:8px;">${f.icon}</div>
          <div style="font-size:14px;font-weight:600;color:${INK};margin-bottom:4px;">${escapeHtml(f.title)}</div>
          <div style="font-size:13px;color:${MUTED};line-height:1.5;">${escapeHtml(f.body)}</div>
        </td></tr>
      </table>
    </td>`).join('')

  // Render features in 2-column grid (3 rows of 2).
  const featureRows: string[] = []
  for (let i = 0; i < FEATURES.length; i += 2) {
    const a = FEATURES[i]
    const b = FEATURES[i + 1]
    const cell = (f: typeof FEATURES[number] | undefined) => f ? `
      <td valign="top" width="50%" style="padding:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SOFT_BG};border:1px solid ${BORDER};border-radius:12px;">
          <tr><td style="padding:16px;">
            <div style="font-size:22px;line-height:1;margin-bottom:8px;">${f.icon}</div>
            <div style="font-size:14px;font-weight:600;color:${INK};margin-bottom:4px;">${escapeHtml(f.title)}</div>
            <div style="font-size:13px;color:${MUTED};line-height:1.5;">${escapeHtml(f.body)}</div>
          </td></tr>
        </table>
      </td>` : `<td width="50%" style="padding:8px;">&nbsp;</td>`
    featureRows.push(`<tr>${cell(a)}${cell(b)}</tr>`)
  }
  void featureCards

  const stepsHtml = FIRST_STEPS.map((s) => `
    <tr>
      <td valign="top" width="40" style="padding:8px 0;">
        <div style="width:32px;height:32px;border-radius:9999px;background:${PRIMARY};color:#fff;font-weight:700;font-size:14px;line-height:32px;text-align:center;">${s.num}</div>
      </td>
      <td valign="top" style="padding:8px 0 8px 12px;">
        <div style="font-size:14px;font-weight:600;color:${INK};margin-bottom:2px;">${escapeHtml(s.title)}</div>
        <div style="font-size:13px;color:${MUTED};line-height:1.5;">${escapeHtml(s.body)}</div>
      </td>
    </tr>`).join('')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F2F7;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06),0 8px 24px rgba(15,23,42,0.06);">

          <!-- Header / hero -->
          <tr>
            <td style="background:linear-gradient(135deg,${PRIMARY} 0%,${PRIMARY_DARK} 100%);padding:32px 32px 28px;text-align:left;">
              <div style="display:inline-block;width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.18);text-align:center;line-height:44px;font-size:22px;">🎯</div>
              <div style="margin-top:16px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.01em;">Welcome to the OKR Management System</div>
              <div style="margin-top:6px;color:rgba(255,255,255,0.85);font-size:14px;">You're invited as a <strong>${escapeHtml(role)}</strong></div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:28px 32px 8px;">
              <div style="font-size:16px;color:${INK};line-height:1.6;">Hi <strong>${escapeHtml(name)}</strong>,</div>
              <div style="font-size:15px;color:${MUTED};line-height:1.7;margin-top:12px;">
                We use this system to set goals, align teams, and track progress on a regular cadence. Your account has been created — here's how to get started.
              </div>
            </td>
          </tr>

          <!-- First steps -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:${MUTED};text-transform:uppercase;margin-bottom:12px;">On your first login</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stepsHtml}
              </table>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td align="center" style="padding:24px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${PRIMARY}" style="border-radius:10px;">
                    <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;background:${PRIMARY};">
                      Set up your password →
                    </a>
                  </td>
                </tr>
              </table>
              <div style="margin-top:12px;font-size:12px;color:${MUTED};">This secure link expires in <strong>${expiresLabel}</strong>.</div>
            </td>
          </tr>

          <!-- Plain URL fallback -->
          <tr>
            <td style="padding:8px 32px 24px;">
              <div style="font-size:12px;color:${MUTED};">Button not working? Copy and paste this URL:</div>
              <div style="font-size:12px;color:${PRIMARY};word-break:break-all;margin-top:4px;">${escapeHtml(url)}</div>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 32px;"><div style="height:1px;background:${BORDER};"></div></td></tr>

          <!-- Features -->
          <tr>
            <td style="padding:28px 24px 8px;">
              <div style="padding:0 8px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:${MUTED};text-transform:uppercase;margin-bottom:4px;">What you can do</div>
                <div style="font-size:18px;font-weight:700;color:${INK};margin-bottom:16px;">Built for teams that ship goals, not just talk about them</div>
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${featureRows.join('')}
              </table>
            </td>
          </tr>

          <!-- Tips -->
          <tr>
            <td style="padding:8px 32px 28px;">
              <div style="background:${SOFT_BG};border:1px solid ${BORDER};border-radius:12px;padding:16px;">
                <div style="font-size:13px;font-weight:600;color:${INK};margin-bottom:6px;">A couple of tips before you dive in</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:${MUTED};line-height:1.7;">
                  <li>Tune notification cadence in <strong>Settings → Notifications</strong> (immediate / daily digest / weekly).</li>
                  <li>Add yourself as a watcher on key OKRs to follow progress without owning them.</li>
                  <li>Use <strong>@mentions</strong> in comments to loop teammates in.</li>
                </ul>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;background:${SOFT_BG};border-top:1px solid ${BORDER};">
              <div style="font-size:12px;color:${MUTED};line-height:1.6;">
                Sent to ${escapeHtml(data.email ?? '')}. If you weren't expecting this email, you can ignore it — no account changes have been made.
                <br />Questions? Reply to this email or contact your administrator.
              </div>
              <div style="font-size:11px;color:${MUTED};margin-top:10px;">© OKR Management System</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}
