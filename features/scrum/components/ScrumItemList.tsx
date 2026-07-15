'use client'

import { Check, CornerDownRight, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { ScrumItem, ScrumItemStatus } from '../services/items'

interface LinkableOption {
  id: string
  title: string
  type: 'OBJECTIVE' | 'KEY_RESULT'
  subtitle?: string
}

interface Props {
  items: ScrumItem[]
  onChange: (items: ScrumItem[]) => void
  mode: 'yesterday' | 'today' | 'blocker' | 'win'
  label: string
  placeholder?: string
  linkableOptions?: LinkableOption[]
  linkHeader?: string
}

export function ScrumItemList({
  items,
  onChange,
  mode,
  label,
  placeholder = 'Add an item…',
  linkableOptions = [],
  linkHeader,
}: Props) {
  const [draft, setDraft] = useState('')

  function add() {
    const text = draft.trim()
    if (!text) return
    onChange([...items, { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text }])
    setDraft('')
  }

  function update(index: number, patch: Partial<ScrumItem>) {
    const next = [...items]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  function remove(index: number) {
    const next = [...items]
    next.splice(index, 1)
    onChange(next)
  }

  function setStatus(index: number, status: ScrumItemStatus) {
    update(index, { status })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-medium">{label}</span>
        {mode === 'today' && linkHeader && <span className="text-body-xs text-ink-secondary">{linkHeader}</span>}
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-2 rounded-md border bg-surface-card px-2 py-2',
              item.status === 'DONE' && 'opacity-70',
            )}
          >
            {mode === 'yesterday' && (
              <div className="mt-0.5 flex gap-1">
                <button
                  type="button"
                  onClick={() => setStatus(index, 'DONE')}
                  title="Done"
                  className={cn(
                    'rounded p-1',
                    item.status === 'DONE' ? 'bg-success-100 text-success-700' : 'text-ink-tertiary hover:bg-surface-hover',
                  )}
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(index, 'CARRIED')}
                  title="Carry to today"
                  className={cn(
                    'rounded p-1',
                    item.status === 'CARRIED' ? 'bg-primary-100 text-primary-700' : 'text-ink-tertiary hover:bg-surface-hover',
                  )}
                >
                  <CornerDownRight className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(index, 'NOT_DONE')}
                  title="Not done"
                  className={cn(
                    'rounded p-1',
                    item.status === 'NOT_DONE' ? 'bg-danger-100 text-danger-700' : 'text-ink-tertiary hover:bg-surface-hover',
                  )}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Input
                value={item.text}
                onChange={(e) => update(index, { text: e.target.value })}
                className={cn(
                  'h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0',
                  item.status === 'DONE' && 'line-through',
                )}
                placeholder={placeholder}
              />
              {(mode === 'today' || mode === 'blocker') && linkableOptions.length > 0 && (
                <LinkSelector value={item} onChange={(patch) => update(index, patch)} options={linkableOptions} />
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-ink-tertiary" onClick={() => remove(index)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder={placeholder}
            className="h-9"
          />
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="mr-1 size-4" />Add
          </Button>
        </div>
      </div>
    </div>
  )
}

function LinkSelector({
  value,
  onChange,
  options,
}: {
  value: ScrumItem
  onChange: (patch: Partial<ScrumItem>) => void
  options: LinkableOption[]
}) {
  const selected = value.objectiveId ? `o:${value.objectiveId}` : value.keyResultId ? `k:${value.keyResultId}` : ''
  return (
    <select
      value={selected}
      onChange={(e) => {
        const [type, id] = e.target.value.split(':')
        onChange({
          objectiveId: type === 'o' ? id : undefined,
          keyResultId: type === 'k' ? id : undefined,
        })
      }}
      className="mt-1 max-w-xs rounded-md border border-border bg-card px-2 py-1 text-body-xs"
    >
      <option value="">Link OKR (optional)</option>
      {options.map((opt) => (
        <option key={`${opt.type}:${opt.id}`} value={`${opt.type === 'OBJECTIVE' ? 'o' : 'k'}:${opt.id}`}>
          {opt.type === 'OBJECTIVE' ? 'Objective' : 'Key Result'}: {opt.title}
        </option>
      ))}
    </select>
  )
}
