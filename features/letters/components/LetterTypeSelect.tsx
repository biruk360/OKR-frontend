'use client'

import { useEffect, useState } from 'react'
import { Check, Plus, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Input, Modal, Label } from '@/components/ui'
import type { LetterTypeRecord } from '@/types'
import { listLetterTypes, createLetterType } from '../services/lettersApi'

interface Props {
  /** Selected LetterTypeDef id, or null when nothing chosen yet. */
  value: string | null
  onChange: (id: string, record: LetterTypeRecord) => void
  disabled?: boolean
  /** Optional label shown above the trigger. */
  label?: string
  /** Allow users to create a new letter type from this control. */
  allowCreate?: boolean
}

/**
 * Combobox-style picker for letter types.
 *
 * Behaviour:
 *  - lists all LetterTypeDef rows on open (cached for the session)
 *  - shows built-ins first, then user-defined types
 *  - inline "+ Create new type" button opens a small modal
 *  - new types are appended to the cached list and auto-selected
 *
 * Visual conforms to the app's Apple-style tokens: native `<button>` trigger
 * with `--ap-radius-md` rounding, frosted dropdown panel.
 */
export default function LetterTypeSelect({ value, onChange, disabled, label, allowCreate = true }: Props) {
  const [open, setOpen] = useState(false)
  const [types, setTypes] = useState<LetterTypeRecord[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (types !== null) return
    setLoading(true)
    listLetterTypes()
      .then(setTypes)
      .catch(() => setTypes([]))
      .finally(() => setLoading(false))
  }, [types])

  const selected = (types || []).find((t) => t.id === value)
  const builtIns = (types || []).filter((t) => t.isBuiltIn)
  const custom = (types || []).filter((t) => !t.isBuiltIn)

  function pick(t: LetterTypeRecord) {
    onChange(t.id, t)
    setOpen(false)
  }

  return (
    <div className="space-y-1">
      {label && <Label className="text-[12px]">{label}</Label>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-[14px] border bg-card px-3 text-left text-[13px] transition-colors',
            'hover:border-[color:var(--ap-fg-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)] focus:ring-offset-1',
            disabled && 'cursor-not-allowed opacity-60',
            !selected && 'text-muted-foreground'
          )}
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <span className="truncate">
            {selected ? (
              <>
                <span className="font-medium">{selected.name}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">{selected.code}</span>
              </>
            ) : loading ? (
              <span className="inline-flex items-center gap-1"><Loader2 className="size-3.5 animate-spin" /> Loading…</span>
            ) : (
              'Select letter type…'
            )}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && !disabled && (
          <div
            className="absolute z-30 mt-1 w-full overflow-hidden rounded-[14px] border bg-card shadow-md"
            style={{ borderColor: 'var(--ap-border)' }}
            onMouseLeave={() => setOpen(false)}
          >
            <ul className="max-h-72 overflow-auto py-1">
              {builtIns.map((t) => (
                <TypeRow key={t.id} t={t} selected={t.id === value} onPick={pick} />
              ))}
              {custom.length > 0 && (
                <li className="my-1 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Custom
                </li>
              )}
              {custom.map((t) => (
                <TypeRow key={t.id} t={t} selected={t.id === value} onPick={pick} />
              ))}
              {(types?.length ?? 0) === 0 && !loading && (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">No letter types found.</li>
              )}
            </ul>
            {allowCreate && (
              <button
                type="button"
                onClick={() => { setCreateOpen(true); setOpen(false) }}
                className="flex w-full items-center gap-2 border-t px-3 py-2 text-[13px] text-[color:var(--ap-accent)] transition-colors hover:bg-[color:var(--ap-bg-sunken)]"
                style={{ borderColor: 'var(--ap-border)' }}
              >
                <Plus className="size-3.5" /> Create new letter type
              </button>
            )}
          </div>
        )}
      </div>

      <CreateLetterTypeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(t) => {
          setTypes((prev) => [...(prev || []), t])
          onChange(t.id, t)
        }}
      />
    </div>
  )
}

function TypeRow({
  t,
  selected,
  onPick,
}: {
  t: LetterTypeRecord
  selected: boolean
  onPick: (t: LetterTypeRecord) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(t)}
        className={cn(
          'flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors',
          'hover:bg-[color:var(--ap-bg-sunken)]',
          selected && 'bg-[color:var(--ap-bg-sunken)]'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{t.name}</span>
            <span className="rounded bg-[color:var(--ap-bg-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {t.code}
            </span>
          </div>
          {t.description && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.description}</p>
          )}
        </div>
        {selected && <Check className="mt-0.5 size-4 text-[color:var(--ap-accent)]" />}
      </button>
    </li>
  )
}

function CreateLetterTypeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (t: LetterTypeRecord) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-derive a code from the name as the user types — but don't
  // overwrite a code the user typed manually.
  const [codeTouched, setCodeTouched] = useState(false)
  useEffect(() => {
    if (codeTouched) return
    const caps = (name.match(/[A-Z]/g) || []).slice(0, 4).join('')
    if (caps.length >= 2) setCode(caps)
    else {
      const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 4).join('').toUpperCase()
      if (initials.length >= 2) setCode(initials)
      else setCode(name.slice(0, 2).toUpperCase())
    }
  }, [name, codeTouched])

  function reset() {
    setName(''); setCode(''); setDescription(''); setCodeTouched(false); setError(null)
  }

  async function submit() {
    setError(null)
    if (name.trim().length < 2) { setError('Name is required'); return }
    setSubmitting(true)
    try {
      const created = await createLetterType({
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || undefined,
      })
      onCreated(created)
      reset()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Could not create letter type')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create letter type" size="sm">
      <div className="space-y-3 p-4">
        <div>
          <Label htmlFor="lt-name" className="text-[12px]">Name</Label>
          <Input
            id="lt-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Notice Letter"
            maxLength={60}
          />
        </div>
        <div>
          <Label htmlFor="lt-code" className="text-[12px]">Code (2–4 letters)</Label>
          <Input
            id="lt-code"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true) }}
            placeholder="NC"
            maxLength={4}
            className="font-mono uppercase"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Used in reference numbers, e.g. <code className="text-[10px]">360G/LT/{code || 'NC'}/001/2026</code>
          </p>
        </div>
        <div>
          <Label htmlFor="lt-desc" className="text-[12px]">Description (optional)</Label>
          <Input
            id="lt-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When to use this letter type"
            maxLength={200}
          />
        </div>
        {error && <p className="text-[12px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => { reset(); onClose() }} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || name.trim().length < 2}>
            {submitting ? 'Creating…' : 'Create type'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
