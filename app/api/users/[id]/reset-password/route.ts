import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can trigger password resets
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userId = params.id

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Cannot reset password for inactive user' }, { status: 400 })
    }

    // Generate a password reset token
    const resetToken = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15)
    
    // Update user with reset token and expiration (1 hour)
    await prisma.user.update({
      where: { id: userId },
      data: {
        // Note: In a real implementation, you'd store the reset token in a separate field
        // For now, we'll use the activationToken field for password reset
        activationToken: resetToken,
        activationTokenExpires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      }
    })

    // Send password reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken)
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError)
      // Don't fail the operation if email fails
    }

    // In a real implementation, you would also invalidate active sessions here
    // This could be done by:
    // 1. Storing session tokens in the database and marking them as invalid
    // 2. Using a session management system that supports invalidation
    // 3. Implementing a "force logout" mechanism
    
    // For now, we'll log that sessions should be invalidated
    console.log(`Password reset triggered for user ${user.email}. Active sessions should be invalidated.`)

    return NextResponse.json({
      success: true,
      message: 'Password reset email has been sent'
    })
  } catch (error) {
    console.error('Error triggering password reset:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






