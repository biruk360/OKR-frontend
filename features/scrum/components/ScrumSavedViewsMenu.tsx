'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Bookmark, Check, Trash2 } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Modal,
} from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCreateScrumSavedView, useDeleteScrumSavedView, useScrumSavedViews } from '../hooks/queries'
import { normalizeSavedViewFilters, type ScrumSavedViewFilters } from '../services/view-state'

export interface ScrumSavedViewsMenuProps {
  /** Current filters + active view — what "Save current view" stores. */
  current: ScrumSavedViewFilters
  onApply: (filters: ScrumSavedViewFilters) => void
}

/** Per-user saved filter views (spec S4.1). Stored via /api/scrum/saved-views; owner-only on the server. */
export function ScrumSavedViewsMenu({ current, onApply }: ScrumSavedViewsMenuProps) {
  const views = useScrumSavedViews()
  const [manageOpen, setManageOpen] = useState(false)
  const list = views.data ?? []

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm"><Bookmark className="mr-2 size-4" aria-hidden="true" />Views</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {views.isLoading ? (
            <div className="space-y-2 p-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
          ) : list.length === 0 ? (
            <p className="px-2 py-1.5 text-body-sm text-ink-secondary">No saved views yet</p>
          ) : (
            list.map((view: any) => (
              <DropdownMenuItem key={view.id} onSelect={() => onApply(normalizeSavedViewFilters(view.filtersJson))}>
                <span className="truncate">{view.name}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>Save or manage views…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ManageViewsModal open={manageOpen} onClose={() => setManageOpen(false)} current={current} views={list} onApply={onApply} />
    </>
  )
}

function ManageViewsModal({ open, onClose, current, views, onApply }: {
  open: boolean
  onClose: () => void
  current: ScrumSavedViewFilters
  views: any[]
  onApply: (filters: ScrumSavedViewFilters) => void
}) {
  const create = useCreateScrumSavedView()
  const remove = useDeleteScrumSavedView()
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const { register, handleSubmit, reset, formState } = useForm<{ name: string }>({ defaultValues: { name: '' } })
  useEffect(() => { if (open) reset({ name: '' }) }, [open, reset])

  function save(values: { name: string }) {
    create.mutate({ name: values.name.trim(), filtersJson: { ...current } }, { onSuccess: () => reset({ name: '' }) })
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Saved views" icon={Bookmark} size="md">
        <form onSubmit={handleSubmit(save)} className="space-y-2">
          <Label htmlFor="scrum-view-name">Save current filters as</Label>
          <div className="flex gap-2">
            <Input
              id="scrum-view-name"
              placeholder="e.g. Blockers this month"
              aria-invalid={!!formState.errors.name}
              {...register('name', { validate: (value) => value.trim().length >= 2 || 'Name needs at least 2 characters' })}
            />
            <Button type="submit" disabled={create.isPending}>Save</Button>
          </div>
          {formState.errors.name && <p className="text-body-sm text-danger-700">{formState.errors.name.message}</p>}
          <p className="text-body-sm text-ink-secondary">{describe(current)}</p>
        </form>
        <div className="mt-4 space-y-2">
          {views.length === 0 ? (
            <p className="text-body-sm text-ink-secondary">You have no saved views.</p>
          ) : views.map((view) => (
            <div key={view.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-body-sm font-medium">{view.name}</div>
                <div className="truncate text-body-sm text-ink-secondary">{describe(normalizeSavedViewFilters(view.filtersJson))}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => { onApply(normalizeSavedViewFilters(view.filtersJson)); onClose() }}>
                  <Check className="mr-1 size-4" aria-hidden="true" />Apply
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Delete view ${view.name}`} onClick={() => setPendingDelete({ id: view.id, name: view.name })}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          remove.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) })
        }}
        title="Delete saved view"
        message={`Delete "${pendingDelete?.name ?? ''}"?`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={remove.isPending}
      />
    </>
  )
}

function describe(filters: ScrumSavedViewFilters): string {
  const parts = [
    filters.view ? `${filters.view} view` : null,
    filters.hasBlocker ? 'blockers' : null,
    filters.hasWin ? 'wins' : null,
    filters.state ? `${filters.state} only` : null,
  ].filter(Boolean)
  return parts.length ? `Filters: ${parts.join(' · ')}` : 'No filters (all updates)'
}
