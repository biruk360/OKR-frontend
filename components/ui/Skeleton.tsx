import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-gradient-to-r bg-[length:200%_100%]',
        'from-[var(--ap-bg-sunken)] via-[var(--ap-bg-hover)] to-[var(--ap-bg-sunken)]',
        className,
      )}
      {...rest}
    />
  )
}

export function SkeletonAvatar({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Skeleton
      className={cn('rounded-full', className)}
      style={{ width: size, height: size }}
    />
  )
}

export function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 rounded-[14px] border bg-[var(--ap-bg-raised)] px-4 py-3"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <Skeleton className="h-2 w-2 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <SkeletonAvatar size={22} />
      <Skeleton className="h-2 w-24" />
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-[16px] border bg-[var(--ap-bg-raised)] p-5', className)}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="grid grid-cols-3 gap-3 pt-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div
      className="rounded-[16px] border bg-[var(--ap-bg-raised)] p-5"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  )
}
