'use client'

import { type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Trash2, Archive } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './button'
import { cn } from '@/lib/utils'

export type ConfirmVariant = 'danger' | 'warning' | 'info'

interface VariantConfig {
  icon: LucideIcon
  iconClassName: string
  alertIconClassName: string
  alertBoxClassName: string
  alertTitleClassName: string
  alertTextClassName: string
  confirmVariant: 'destructive' | 'default'
}

const variants: Record<ConfirmVariant, VariantConfig> = {
  danger: {
    icon: Trash2,
    iconClassName: 'text-destructive',
    alertIconClassName: 'text-destructive',
    alertBoxClassName: 'bg-destructive/5 border border-destructive/20 rounded-lg',
    alertTitleClassName: 'text-destructive',
    alertTextClassName: 'text-destructive/80',
    confirmVariant: 'destructive',
  },
  warning: {
    icon: Archive,
    iconClassName: 'text-orange-600',
    alertIconClassName: 'text-orange-500',
    alertBoxClassName: 'bg-orange-50 border border-orange-200 rounded-lg',
    alertTitleClassName: 'text-orange-800',
    alertTextClassName: 'text-orange-700',
    confirmVariant: 'default',
  },
  info: {
    icon: AlertCircle,
    iconClassName: 'text-primary',
    alertIconClassName: 'text-primary',
    alertBoxClassName: 'bg-primary/5 border border-primary/20 rounded-lg',
    alertTitleClassName: 'text-primary',
    alertTextClassName: 'text-primary/80',
    confirmVariant: 'default',
  },
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: string
  description?: string
  variant?: ConfirmVariant
  icon?: LucideIcon
  confirmLabel?: string
  cancelLabel?: string
  isLoading?: boolean
  loadingLabel?: string
  disabled?: boolean
  bullets?: string[]
  bulletsTitle?: string
  details?: ReactNode
  extraContent?: ReactNode
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  description,
  variant = 'danger',
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  loadingLabel,
  disabled = false,
  bullets,
  bulletsTitle = 'What will happen:',
  details,
  extraContent,
}: ConfirmDialogProps) {
  const v = variants[variant]
  const Icon = icon ?? v.icon

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={Icon}
      iconClassName={v.iconClassName}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={v.confirmVariant}
            onClick={onConfirm}
            disabled={isLoading || disabled}
          >
            {isLoading ? (
              <span className="flex items-center">
                <span className="animate-spin rounded-full size-4 border-b-2 border-current mr-2" />
                {loadingLabel ?? `${confirmLabel}...`}
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 mb-4">
        <AlertCircle className={cn('size-5 mt-0.5 shrink-0', v.alertIconClassName)} />
        <div>
          <h3 className="text-sm font-medium mb-2">{message}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>

      {bullets && bullets.length > 0 && (
        <div className={cn('p-4 mb-4', v.alertBoxClassName)}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={cn('size-5 mt-0.5 shrink-0', v.alertIconClassName)} />
            <div>
              <h4 className={cn('text-sm font-medium mb-2', v.alertTitleClassName)}>{bulletsTitle}</h4>
              <ul className={cn('text-sm space-y-1', v.alertTextClassName)}>
                {bullets.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {details && (
        <div className="bg-muted rounded-lg p-4 mb-4">{details}</div>
      )}

      {extraContent}
    </Modal>
  )
}

export default ConfirmDialog
