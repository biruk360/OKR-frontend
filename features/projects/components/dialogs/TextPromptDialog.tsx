'use client'

import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The project module's replacement for `window.prompt`: one text field in the
 * shared Modal, validated with react-hook-form, submit-on-Enter, disabled while
 * the caller's async `onSubmit` runs. The dialog closes only when `onSubmit`
 * resolves; if it throws (e.g. the mutation already toasted an error) the value
 * stays so the user can retry.
 */
export interface TextPromptDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (value: string) => Promise<void> | void
  title: string
  label: string
  /** Context shown above the field (e.g. the server's gate-block message). */
  message?: string
  placeholder?: string
  confirmLabel?: string
  icon?: LucideIcon
  multiline?: boolean
  minLength?: number
  maxLength?: number
  initialValue?: string
}

interface FormValues { value: string }

export function TextPromptDialog({
  open,
  onClose,
  onSubmit,
  title,
  label,
  message,
  placeholder,
  confirmLabel = 'Save',
  icon,
  multiline = false,
  minLength = 1,
  maxLength = 2000,
  initialValue = '',
}: TextPromptDialogProps) {
  const formId = useId()
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { value: initialValue },
  })

  useEffect(() => {
    if (open) reset({ value: initialValue })
  }, [open, initialValue, reset])

  const length = (watch('value') ?? '').trim().length

  const submit = handleSubmit(async ({ value }) => {
    setSubmitting(true)
    try {
      await onSubmit(value.trim())
      onClose()
    } catch {
      // The caller surfaced the error (mutation toast); keep the dialog open.
    } finally {
      setSubmitting(false)
    }
  })

  const field = register('value', {
    validate: (value) => {
      const trimmed = (value ?? '').trim()
      if (trimmed.length < minLength) return minLength > 1 ? `Enter at least ${minLength} characters` : 'This field is required'
      if (trimmed.length > maxLength) return `Keep it under ${maxLength} characters`
      return true
    },
  })
  const inputClass = cn('input mt-1 w-full', errors.value && 'border-danger-500')

  return (
    <Modal
      open={open}
      onClose={() => { if (!submitting) onClose() }}
      title={title}
      icon={icon}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form={formId} disabled={submitting || length < minLength}>
            {submitting ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-2">
        {message && <p className="whitespace-pre-line text-body-sm text-ink-secondary">{message}</p>}
        <label className="block">
          <span className="text-body-sm font-medium text-ink-primary">{label}</span>
          {multiline ? (
            <textarea {...field} rows={3} maxLength={maxLength} placeholder={placeholder} className={inputClass} autoFocus />
          ) : (
            <input {...field} maxLength={maxLength} placeholder={placeholder} className={inputClass} autoFocus />
          )}
        </label>
        <div className="flex items-center justify-between text-xs">
          <span className="text-danger-600">{errors.value?.message}</span>
          {minLength > 1 && (
            <span className={length >= minLength ? 'text-ink-tertiary' : 'text-warning-600'}>{length}/{minLength} minimum</span>
          )}
        </div>
      </form>
    </Modal>
  )
}
