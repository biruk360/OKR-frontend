'use client'

import { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Trash2, Archive } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from './Modal'
import { cn } from '@/lib/utils'

export type ConfirmVariant = 'danger' | 'warning' | 'info'

interface VariantConfig {
  icon: LucideIcon
  iconClassName: string
  alertIconClassName: string
  alertBoxClassName: string
  alertTitleClassName: string
  alertTextClassName: string
  confirmButtonClassName: string
}

const variants: Record<ConfirmVariant, VariantConfig> = {
  danger: {
    icon: Trash2,
    iconClassName: 'text-red-600',
    alertIconClassName: 'text-red-500',
    alertBoxClassName: 'bg-red-50 border border-red-200',
    alertTitleClassName: 'text-red-800',
    alertTextClassName: 'text-red-700',
    confirmButtonClassName:
      'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
  warning: {
    icon: Archive,
    iconClassName: 'text-orange-600',
    alertIconClassName: 'text-orange-500',
    alertBoxClassName: 'bg-orange-50 border border-orange-200',
    alertTitleClassName: 'text-orange-800',
    alertTextClassName: 'text-orange-700',
    confirmButtonClassName:
      'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500',
  },
  info: {
    icon: AlertCircle,
    iconClassName: 'text-blue-600',
    alertIconClassName: 'text-blue-500',
    alertBoxClassName: 'bg-blue-50 border border-blue-200',
    alertTitleClassName: 'text-blue-800',
    alertTextClassName: 'text-blue-700',
    confirmButtonClassName:
      'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
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
          <button
            type="button"
            onClick={onClose}
            className="btn-outline"
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || disabled}
            className={cn(
              'text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50',
              v.confirmButtonClassName
            )}
          >
            {isLoading ? (
              <span className="flex items-center">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                {loadingLabel ?? `${confirmLabel}...`}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </>
      }
    >
      <div className="flex items-start space-x-3 mb-4">
        <AlertCircle className={cn('h-6 w-6 mt-0.5 flex-shrink-0', v.alertIconClassName)} />
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">{message}</h3>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>
      </div>

      {bullets && bullets.length > 0 && (
        <div className={cn('rounded-lg p-4 mb-4', v.alertBoxClassName)}>
          <div className="flex items-start space-x-2">
            <AlertTriangle className={cn('h-5 w-5 mt-0.5 flex-shrink-0', v.alertIconClassName)} />
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
        <div className="bg-gray-50 rounded-lg p-4 mb-4">{details}</div>
      )}

      {extraContent}
    </Modal>
  )
}

export default ConfirmDialog
