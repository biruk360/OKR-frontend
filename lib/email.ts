// Simple email service for user invitations
// In a production environment, you would integrate with services like:
// - SendGrid, Mailgun, AWS SES, or similar

interface UserInvitationEmailData {
  email: string
  name: string
  activationToken: string
  role: string
}

export async function sendUserInvitationEmail(data: UserInvitationEmailData) {
  const { email, name, activationToken, role } = data
  
  // In a real application, you would send an actual email here
  // For now, we'll just log the email content
  console.log('=== USER INVITATION EMAIL ===')
  console.log(`To: ${email}`)
  console.log(`Subject: Welcome to OKR System - Set up your account`)
  console.log(`
Dear ${name},

Welcome to the OKR Management System! You have been invited to join as a ${role.replace(/_/g, ' ').toLowerCase()}.

To activate your account and set up your password, please click the link below:

${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/activate?token=${activationToken}

This link will expire in 24 hours.

If you have any questions, please contact your administrator.

Best regards,
The OKR System Team
  `)
  console.log('=== END EMAIL ===')

  // Simulate email sending delay
  await new Promise(resolve => setTimeout(resolve, 100))

  // In production, you would use a real email service:
  /*
  const sgMail = require('@sendgrid/mail')
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  
  const msg = {
    to: email,
    from: process.env.FROM_EMAIL,
    subject: 'Welcome to OKR System - Set up your account',
    html: `
      <h2>Welcome to the OKR Management System!</h2>
      <p>Dear ${name},</p>
      <p>You have been invited to join as a ${role.replace(/_/g, ' ').toLowerCase()}.</p>
      <p>To activate your account and set up your password, please click the link below:</p>
      <a href="${process.env.NEXTAUTH_URL}/auth/activate?token=${activationToken}">
        Activate Account
      </a>
      <p>This link will expire in 24 hours.</p>
      <p>Best regards,<br>The OKR System Team</p>
    `
  }
  
  await sgMail.send(msg)
  */

  return { success: true }
}

// Email templates for other notifications
export async function sendPasswordResetEmail(email: string, resetToken: string) {
  console.log('=== PASSWORD RESET EMAIL ===')
  console.log(`To: ${email}`)
  console.log(`Subject: Password Reset Request - OKR System`)
  console.log(`
A password reset has been requested for your OKR System account.

To reset your password, please click the link below:

${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}

This link will expire in 1 hour.

If you did not request this password reset, please contact your administrator immediately.

For security reasons, any active sessions for your account have been invalidated and you will need to log in again after resetting your password.

Best regards,
The OKR System Team
  `)
  console.log('=== END EMAIL ===')

  await new Promise(resolve => setTimeout(resolve, 100))
  return { success: true }
}

export async function sendWelcomeEmail(email: string, name: string) {
  console.log('=== WELCOME EMAIL ===')
  console.log(`To: ${email}`)
  console.log(`Subject: Welcome to OKR System!`)
  console.log(`
Dear ${name},

Your account has been successfully activated! Welcome to the OKR Management System.

You can now log in and start setting up your objectives and key results.

If you have any questions, please don't hesitate to contact your administrator.

Best regards,
The OKR System Team
  `)
  console.log('=== END EMAIL ===')

  await new Promise(resolve => setTimeout(resolve, 100))
  return { success: true }
}
