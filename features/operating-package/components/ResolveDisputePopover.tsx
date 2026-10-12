'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { CheckCircle2 } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { useResolvePackageDispute } from '../hooks/queries'
import { resolveReviewSchema, type ResolveReviewInput } from '../services/schemas'
import { zodFormResolver } from '../services/zod-resolver'

/** Manager chain / HR / Exec / Admin: close a dispute with a resolution note (PKG-1). */
export function ResolveDisputePopover({ packageId, reviewId }: { packageId: string; reviewId: string }) {
  const [open, setOpen] = useState(false)
  const resolve = useResolvePackageDispute()
  const form = useForm<ResolveReviewInput>({
    resolver: zodFormResolver<ResolveReviewInput>(resolveReviewSchema),
    defaultValues: { resolution: '' },
  })
  const { register, handleSubmit, reset, formState } = form

  const onSubmit = handleSubmit(async (values) => {
    try {
      await resolve.mutateAsync({ packageId, reviewId, resolution: values.resolution.trim() })
      reset({ resolution: '' })
      setOpen(false)
    } catch {
      // Toast shown by the hook.
    }
  })

  return (
    <Popover open={open} onOpenChange={(next) => !resolve.isPending && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs">
          <CheckCircle2 aria-hidden />
          Resolve
        </Button>
      </PopoverTrigger>
      <PopoverContent width={290} label="Resolve dispute" heading="Resolve dispute" align="end">
        <form onSubmit={onSubmit} className="space-y-2">
          <label htmlFor={`resolve-${reviewId}`} className="block text-caption text-[var(--ap-fg-muted)]">
            How was it resolved? The employee and the package history will show this note.
          </label>
          <textarea id={`resolve-${reviewId}`} rows={3} className="input h-auto" autoFocus {...register('resolution')} />
          {formState.errors.resolution?.message && (
            <p className="text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
              {formState.errors.resolution.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={resolve.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={resolve.isPending}>
              {resolve.isPending ? 'Saving…' : 'Mark resolved'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
