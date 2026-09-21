'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { Download, Trash2, Key } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

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
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setError('currentPassword', { message: data?.error || 'Could not change password' })
        return
      }
      toast.success('Password changed')
      reset()
      setChangePasswordOpen(false)
    } catch {
      setError('currentPassword', { message: 'Could not reach the server' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/me/export')
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      // Read the server-chosen filename rather than duplicating the naming rule.
      const disposition = res.headers.get('content-disposition') || ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = match?.[1] || 'okr-export.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch {
      toast.error('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-foreground mb-4">
            Account Actions
          </h3>
          <div className="space-y-3">
            <button
              onClick={() => setChangePasswordOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-border rounded-md shadow-sm text-sm font-medium text-muted-foreground bg-card hover:bg-muted"
            >
              <Key className="mr-2 h-4 w-4" />
              Change Password
            </button>
            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="inline-flex items-center px-4 py-2 border border-border rounded-md shadow-sm text-sm font-medium text-muted-foreground bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Exporting…' : 'Export Data'}
            </button>
            {/* Self-service deletion is not built: the owner of an objective
                cannot simply be removed without deciding what happens to the
                OKRs, check-ins and audit rows that reference them, which is an
                org policy call rather than a missing handler. Shown disabled and
                labelled rather than firing a toast that implies it happened. */}
            <div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Ask an administrator to deactivate your account"
                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-card opacity-50 cursor-not-allowed"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Self-service deletion is not available. An administrator can deactivate your
                account from Settings → Users.
              </p>
            </div>
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
