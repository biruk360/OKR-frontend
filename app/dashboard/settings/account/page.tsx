'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { Download, Key } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccountActions } from '@/hooks/useAccountActions'

/**
 * Every control here used to `setTimeout(…, 1000)` to fake latency and then
 * fire a *success* toast without making any request — including for a password
 * change whose endpoint (POST /api/auth/change-password) was already built and
 * already wired into the header. They now do what they say, or say they cannot.
 */

interface ChangePasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export default function AccountSettingsPage() {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const { isSubmitting, isExporting, changePassword, exportData } = useAccountActions()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordForm>()

  const onChangePassword = async (values: ChangePasswordForm) => {
    if (values.newPassword !== values.confirmPassword) {
      setError('confirmPassword', { message: 'Passwords do not match' })
      return
    }
    const result = await changePassword(values)
    if (!result.ok) {
      setError('currentPassword', { message: result.error })
      return
    }
    toast.success('Password changed')
    reset()
    setChangePasswordOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-card shadow-card">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="mb-4 text-section-title text-foreground">
            Account actions
          </h3>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setChangePasswordOpen(true)}>
                <Key className="size-4" />
                Change password
              </Button>
              <Button variant="outline" onClick={exportData} disabled={isExporting}>
                <Download className="size-4" />
                {isExporting ? 'Exporting…' : 'Export data'}
              </Button>
            </div>
            {/* No self-service deletion (decision 2026-09-25): only an ADMIN
                can delete an account, from Settings → Users. */}
            <p className="text-xs text-muted-foreground">
              To close your account, ask an administrator.
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={changePasswordOpen}
        onClose={() => { setChangePasswordOpen(false); reset() }}
        title="Change password"
        icon={Key}
        size="sm"
      >
        <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4">
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword', { required: 'Current password is required' })}
            />
            {errors.currentPassword && (
              <p className="mt-1 text-xs text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword', {
                required: 'New password is required',
                minLength: { value: 8, message: 'Must be at least 8 characters' },
              })}
            />
            {errors.newPassword && (
              <p className="mt-1 text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword', { required: 'Please confirm the new password' })}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setChangePasswordOpen(false); reset() }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
