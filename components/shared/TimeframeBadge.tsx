'use client'

interface TimeframeBadgeProps {
  type?: string | null
  className?: string
}

export default function TimeframeBadge({ type, className = '' }: TimeframeBadgeProps) {
  if (!type) return null

  const typeLabel = type === 'MONTHLY' ? 'Monthly' :
                    type === 'QUARTERLY' ? 'Quarterly' :
                    type === 'SIX_MONTH' ? '6-Month' :
                    type === 'YEARLY' ? 'Yearly' : ''

  if (!typeLabel) return null

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 ${className}`}>
      {typeLabel}
    </span>
  )
}

