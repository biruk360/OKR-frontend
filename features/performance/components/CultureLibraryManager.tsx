'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Library, Plus, Save, Sparkles } from 'lucide-react'
import { Button, EmptyState, Input, Label, Textarea } from '@/components/ui'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import {
  useCreateCultureLibraryEntry,
  useCultureLibrary,
  useUpdateCultureLibraryEntry,
} from '../hooks/queries'
import { anchorAm, anchorEn, buildAnchorValue } from './anchor-helpers'
import type { CultureLibraryEntry } from '../types'

const ANCHOR_KEYS = ['0', '4', '7', '10'] as const

type LibraryEntryDraft = Omit<CultureLibraryEntry, 'id' | 'createdAt' | 'updatedAt'>

function emptyEntry(): LibraryEntryDraft {
  return {
    code: '',
    name: '',
    version: 1,
    type: 'RUBRIC',
    definitionJson: { title: '', anchors: { '0': '', '4': '', '7': '', '10': '' } },
    isActive: true,
  }
}

function entryTitle(entry: CultureLibraryEntry): string {
  return entry.definitionJson?.title ?? entry.name
}

function entryAnchors(entry: CultureLibraryEntry): Record<string, string | { en?: string; am?: string }> {
  return entry.definitionJson?.anchors ?? {}
}

export function CultureLibraryManager() {
  const query = useCultureLibrary()
  const update = useUpdateCultureLibraryEntry()
  const create = useCreateCultureLibraryEntry()
  const [openId, setOpenId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [draft, setDraft] = useState<LibraryEntryDraft>(emptyEntry)

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-[14px]" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const entries = query.data ?? []

  function saveDraft() {
    const code = draft.code.trim().toUpperCase()
    const title = draft.definitionJson?.title?.trim() ?? ''
    if (!code || !title) return
    create.mutate({
      code,
      name: draft.name.trim() || title,
      version: draft.version,
      type: draft.type,
      definitionJson: draft.definitionJson ?? undefined,
      isActive: draft.isActive,
    }, {
      onSuccess: () => {
        setIsCreating(false)
        setDraft(emptyEntry())
      },
    })
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border bg-card px-4 py-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div>
          <h2 className="text-lg font-semibold" style={{ letterSpacing: '-0.01em' }}>Culture Library</h2>
          <p className="text-[13px] text-muted-foreground">
            {entries.length} reusable criterion{entries.length === 1 ? '' : 's'} available for scorecard templates.
          </p>
        </div>
        <Button onClick={() => setIsCreating((current) => !current)} variant={isCreating ? 'secondary' : 'default'}>
          {isCreating ? 'Cancel' : <><Plus className="mr-2 size-4" /> Add criterion</>}
        </Button>
      </div>

      {isCreating && (
        <EntryEditor
          entry={draft}
          isNew
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => { setIsCreating(false); setDraft(emptyEntry()) }}
          isSaving={create.isPending}
        />
      )}

      {entries.length === 0 && !isCreating && (
        <EmptyState
          icon={Library}
          title="No library entries"
          description="Create a criterion or run the culture-library seed to add the canonical C1-C6 blocks."
        />
      )}

      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          isOpen={openId === entry.id}
          onToggle={() => setOpenId((current) => current === entry.id ? null : entry.id)}
          onUpdate={(body) => update.mutate({ id: entry.id, body })}
          isSaving={update.isPending}
        />
      ))}
    </div>
  )
}

function EntryCard({
  entry,
  isOpen,
  onToggle,
  onUpdate,
  isSaving,
}: {
  entry: CultureLibraryEntry
  isOpen: boolean
  onToggle: () => void
  onUpdate: (body: { name?: string; definitionJson?: Record<string, unknown>; isActive?: boolean }) => void
  isSaving: boolean
}) {
  const [draft, setDraft] = useState<LibraryEntryDraft>(entry)

  function save() {
    onUpdate({
      name: draft.name,
      definitionJson: draft.definitionJson as Record<string, unknown>,
      isActive: draft.isActive,
    })
  }

  return (
    <div className="rounded-[14px] border bg-card" style={{ borderColor: 'var(--ap-border)' }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {entry.code}
          </span>
          <div>
            <div className="font-medium">{entryTitle(entry)}</div>
            <div className="text-xs text-muted-foreground">{entry.type} · v{entry.version}{entry.isActive ? '' : ' · inactive'}</div>
          </div>
        </div>
        {isOpen ? <ChevronUp className="size-5 text-muted-foreground" /> : <ChevronDown className="size-5 text-muted-foreground" />}
      </button>
      {isOpen && (
        <div className="space-y-4 border-t px-4 py-4" style={{ borderColor: 'var(--ap-border)' }}>
          <EntryEditor
            entry={draft}
            onChange={setDraft}
            onSave={save}
            onCancel={onToggle}
            isSaving={isSaving}
          />
        </div>
      )}
    </div>
  )
}

function EntryEditor({
  entry,
  isNew,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: {
  entry: LibraryEntryDraft
  isNew?: boolean
  onChange: (entry: LibraryEntryDraft) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
}) {
  const title = entry.definitionJson?.title ?? ''
  const anchors = entry.definitionJson?.anchors ?? {}

  function updateTitle(value: string) {
    onChange({
      ...entry,
      name: isNew ? value : entry.name,
      definitionJson: { ...entry.definitionJson, title: value },
    })
  }

  function updateAnchor(key: string, en: string, am: string) {
    onChange({
      ...entry,
      definitionJson: {
        ...entry.definitionJson,
        anchors: { ...anchors, [key]: buildAnchorValue(en, am) },
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <Label>{isNew ? 'Criterion title' : 'Title'}</Label>
          <Input value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="e.g. Judgment" />
        </div>
        <div>
          <Label>Code</Label>
          <Input
            value={entry.code}
            disabled={!isNew}
            onChange={(event) => onChange({ ...entry, code: event.target.value.toUpperCase() })}
            placeholder={isNew ? 'C7' : entry.code}
          />
        </div>
      </div>

      <div className="space-y-3">
        {ANCHOR_KEYS.map((key) => (
          <div key={key} className="rounded-lg border p-3" style={{ borderColor: 'var(--ap-border)' }}>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-muted-foreground" />
              {key} points
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">English</Label>
                <Textarea
                  value={anchorEn(anchors[key])}
                  onChange={(event) => updateAnchor(key, event.target.value, anchorAm(anchors[key]))}
                  rows={2}
                  placeholder={`Behavior at ${key} points`}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Amharic</Label>
                <Textarea
                  value={anchorAm(anchors[key])}
                  onChange={(event) => updateAnchor(key, anchorEn(anchors[key]), event.target.value)}
                  rows={2}
                  placeholder={`ባህሪ በ${key} ነጥብ`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={entry.isActive}
            onChange={(event) => onChange({ ...entry, isActive: event.target.checked })}
            className="size-4 rounded border"
          />
          Active
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
          <Button onClick={onSave} disabled={isSaving || !title.trim() || (isNew && !entry.code.trim())}>
            <Save className="mr-2 size-4" /> {isNew ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
