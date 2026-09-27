'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { Archive, ArrowLeft, FileText, Pencil, Plus, RotateCcw } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FilterSelect,
  Input,
  Label,
  MiniBadge,
  Modal,
  PageHeader,
  Textarea,
} from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { LetterTypeRecord } from '@/types'
import type { LetterTemplateDraft, LetterTemplateRecord } from '../types'
import {
  createLetterTemplate,
  listLetterTemplatesApi,
  listLetterTypes,
  updateLetterTemplate,
} from '../services/lettersApi'

const PLACEHOLDERS = [
  'customer_name', 'date', 'reference_number', 'signatory_name',
  'sender_department', 'salutation', 'closing',
]

const LANG_LABEL: Record<string, string> = { en: 'English', am: 'Amharic' }

/**
 * Letter template management (letter:admin). Templates are the default body a
 * new letter starts with (FR-4). Bodies are sanitized on save by the server
 * with the letter-body allowlist, so the preview shows exactly what will be
 * stored. Archive hides a template from the create flow; letters already
 * created keep their own copy of the body.
 */
export default function LetterTemplatesClient() {
  const [templates, setTemplates] = useState<LetterTemplateRecord[] | null>(null)
  const [types, setTypes] = useState<LetterTypeRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<LetterTemplateRecord | 'new' | null>(null)
  const [archiving, setArchiving] = useState<LetterTemplateRecord | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setError(null)
    listLetterTemplatesApi({ includeArchived: true })
      .then(setTemplates)
      .catch((e) => { setTemplates([]); setError(e instanceof Error ? e.message : 'Could not load templates') })
  }, [])

  useEffect(() => {
    load()
    listLetterTypes().then(setTypes).catch(() => setTypes([]))
  }, [load])

  const typeName = useCallback(
    (code: string) => types.find((t) => t.code === code)?.name ?? code,
    [types],
  )

  const visible = useMemo(
    () => (templates ?? []).filter((t) =>
      (showArchived || t.isActive) && (!typeFilter || t.letterType === typeFilter)),
    [templates, showArchived, typeFilter],
  )

  async function setActive(tpl: LetterTemplateRecord, isActive: boolean) {
    setBusy(true)
    setError(null)
    try {
      await updateLetterTemplate(tpl.id, { isActive })
      setArchiving(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Letter templates"
        description="Default body content a new letter starts with, per letter type and language."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/letters">
              <Button variant="outline" className="h-10">
                <ArrowLeft className="mr-1.5 size-3.5" /> Letters
              </Button>
            </Link>
            <Button className="h-10" onClick={() => setEditing('new')}>
              <Plus className="mr-1.5 size-4" /> New template
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Type"
          value={typeFilter}
          onValueChange={setTypeFilter}
          placeholder="All types"
          options={types.map((t) => ({ value: t.code, label: t.name, hint: t.code }))}
        />
        <label className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="size-4 rounded border-border"
          />
          Show archived
        </label>
      </div>

      {error && (
        <div className="rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-body-sm text-danger-700" role="alert">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-card border bg-card shadow-card" style={{ borderColor: 'var(--ap-border)' }}>
        {templates === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates"
            description={showArchived ? 'Nothing matches this filter.' : 'Create one, or show archived templates.'}
            action={{ label: 'New template', onClick: () => setEditing('new') }}
          />
        ) : (
          <table className="w-full min-w-[640px] text-body-sm">
            <thead>
              <tr className="border-b text-left text-caption uppercase tracking-wide text-muted-foreground" style={{ borderColor: 'var(--ap-border)' }}>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Language</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last updated</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((tpl) => (
                <tr key={tpl.id} className={cn('border-b last:border-0', !tpl.isActive && 'opacity-70')} style={{ borderColor: 'var(--ap-border)' }}>
                  <td className="px-4 py-2 font-medium text-foreground">
                    {tpl.name}
                    {tpl.isBuiltIn && <span className="ml-2 text-caption text-muted-foreground">built-in</span>}
                  </td>
                  <td className="px-4 py-2">{typeName(tpl.letterType)} <span className="text-muted-foreground">({tpl.letterType})</span></td>
                  <td className="px-4 py-2">{LANG_LABEL[tpl.language] ?? tpl.language}</td>
                  <td className="px-4 py-2">
                    <MiniBadge tone={tpl.isActive ? 'ok' : 'neutral'}>{tpl.isActive ? 'Active' : 'Archived'}</MiniBadge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(tpl.updatedAt).toLocaleDateString()}
                    {tpl.updatedBy ? ` · ${tpl.updatedBy.name}` : ''}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(tpl)} aria-label={`Edit ${tpl.name}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      {tpl.isActive ? (
                        <Button variant="ghost" size="sm" onClick={() => setArchiving(tpl)} aria-label={`Archive ${tpl.name}`}>
                          <Archive className="size-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setActive(tpl, true)} aria-label={`Restore ${tpl.name}`}>
                          <RotateCcw className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <TemplateEditorModal
          template={editing === 'new' ? null : editing}
          types={types}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => (archiving ? setActive(archiving, false) : undefined)}
        variant="warning"
        title="Archive template"
        message={archiving ? `Archive “${archiving.name}”? It will no longer be offered when creating letters. Existing letters are not affected.` : ''}
        confirmLabel="Archive"
        isLoading={busy}
      />
    </div>
  )
}

function TemplateEditorModal({
  template,
  types,
  onClose,
  onSaved,
}: {
  template: LetterTemplateRecord | null
  types: LetterTypeRecord[]
  onClose: () => void
  onSaved: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LetterTemplateDraft>({
    defaultValues: {
      name: template?.name ?? '',
      letterType: template?.letterType ?? types[0]?.code ?? 'CL',
      language: (template?.language === 'am' ? 'am' : 'en'),
      bodyHtml: template?.bodyHtml ?? '<p>{{salutation}}</p>\n<p></p>\n<p>{{closing}}</p>',
    },
  })
  const body = watch('bodyHtml')

  async function onSubmit(values: LetterTemplateDraft) {
    setServerError(null)
    try {
      if (template) await updateLetterTemplate(template.id, values)
      else await createLetterTemplate(values)
      onSaved()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const typeOptions = types.some((t) => t.code === template?.letterType) || !template
    ? types
    : [...types, { id: template.letterType, code: template.letterType, name: template.letterType, description: null, isBuiltIn: false }]

  return (
    <Modal open onClose={onClose} title={template ? 'Edit template' : 'New template'} size="xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1 md:col-span-3">
            <Label htmlFor="tpl-name" className="text-xs">Name</Label>
            <Input
              id="tpl-name"
              className="h-10"
              maxLength={120}
              {...register('name', {
                required: 'Name is required',
                validate: (v) => (v.trim().length >= 2 ? true : 'Name must be at least 2 characters'),
              })}
            />
            {errors.name && <p className="text-xs text-danger-600">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-type" className="text-xs">Letter type</Label>
            <select
              id="tpl-type"
              className="flex h-10 w-full rounded-[var(--ap-radius-md)] border bg-card px-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]"
              style={{ borderColor: 'var(--ap-border)' }}
              {...register('letterType', { required: true })}
            >
              {typeOptions.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-lang" className="text-xs">Language</Label>
            <select
              id="tpl-lang"
              className="flex h-10 w-full rounded-[var(--ap-radius-md)] border bg-card px-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]"
              style={{ borderColor: 'var(--ap-border)' }}
              {...register('language')}
            >
              <option value="en">English</option>
              <option value="am">Amharic</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tpl-body" className="text-xs">Body (HTML)</Label>
            <Textarea
              id="tpl-body"
              rows={14}
              dir="auto"
              className="font-mono text-xs"
              {...register('bodyHtml', {
                validate: (v) => (v.replace(/<[^>]*>/g, '').trim() ? true : 'Body is required'),
              })}
            />
            {errors.bodyHtml && <p className="text-xs text-danger-600">{errors.bodyHtml.message}</p>}
            <p className="text-caption text-muted-foreground">
              Placeholders: {PLACEHOLDERS.map((p) => `{{${p}}}`).join(' ')}. Scripts, event handlers and
              external resources are stripped on save.
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">Preview</span>
            {/* sandbox="" — no scripts, no same-origin: the draft is untrusted until the server sanitizes it. */}
            <iframe
              title="Template preview"
              sandbox=""
              srcDoc={`<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;margin:12px">${body}</body></html>`}
              className="h-[300px] w-full rounded-card border bg-card"
              style={{ borderColor: 'var(--ap-border)' }}
            />
          </div>
        </div>

        {serverError && (
          <div className="rounded-card bg-danger-50 px-3 py-2 text-xs text-danger-700" role="alert">{serverError}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" className="h-10" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : template ? 'Save changes' : 'Create template'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
