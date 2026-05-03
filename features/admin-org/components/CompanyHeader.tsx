'use client'

import { useState } from 'react'
import { Crown, Pencil, Check, X } from 'lucide-react'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useUpdateOrgSettings } from '../hooks/useOrgData'
import type { OrgSettings } from '../types'
import { Avatar } from './shared/Avatar'

export function CompanyHeader({ settings, loading }: { settings?: OrgSettings; loading?: boolean }) {
  const [editingName, setEditingName] = useState(false)
  const [editingCeo, setEditingCeo] = useState(false)
  const [name, setName] = useState('')
  const [ceoId, setCeoId] = useState<string | null>(null)
  const update = useUpdateOrgSettings()
  const { users } = useUsersForSelection({ enabled: editingCeo })

  const eligible = users.filter((u) => u.role === 'ADMIN' || u.role === 'EXECUTIVE')

  if (loading) {
    return (
      <div
        className="flex h-20 items-center justify-center rounded-[var(--ap-radius-md)]"
        style={{ background: 'var(--ap-bg-raised)', border: '1px solid var(--ap-border)' }}
      >
        <div className="size-5 animate-spin rounded-full border-2 border-[var(--ap-accent)] border-t-transparent" />
      </div>
    )
  }
  if (!settings) return null

  return (
    <div
      className="flex items-center gap-4 rounded-[var(--ap-radius-md)] p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(0,122,255,0.06), rgba(0,122,255,0.02))',
        border: '1px solid rgba(0,122,255,0.18)',
        boxShadow: 'var(--ap-shadow-sm)',
      }}
    >
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'var(--ap-accent)', color: '#fff' }}
      >
        <Crown className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-accent)' }}>
          Company
        </p>
        {editingName ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              autoFocus
              defaultValue={settings.companyName}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: 'var(--ap-border-strong)' }}
            />
            <IconBtn onClick={() => { update.mutate({ companyName: name || settings.companyName }); setEditingName(false) }}><Check className="size-3.5" /></IconBtn>
            <IconBtn onClick={() => setEditingName(false)}><X className="size-3.5" /></IconBtn>
          </div>
        ) : (
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="text-[18px] font-semibold leading-tight" style={{ color: 'var(--ap-fg)' }}>
              {settings.companyName}
            </h2>
            <button type="button" onClick={() => { setName(settings.companyName); setEditingName(true) }}
              className="rounded p-1 hover:bg-black/5">
              <Pencil className="size-3" style={{ color: 'var(--ap-fg-subtle)' }} />
            </button>
          </div>
        )}
      </div>

      {/* CEO slot */}
      <div className="flex shrink-0 items-center gap-3 rounded-[var(--ap-radius-sm)] px-3 py-2"
        style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid var(--ap-border)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
          CEO
        </p>
        {editingCeo ? (
          <div className="flex items-center gap-2">
            <select
              autoFocus
              defaultValue={settings.companyCeoUserId ?? ''}
              onChange={(e) => setCeoId(e.target.value || null)}
              className="rounded-md border bg-white px-2 py-1 text-sm"
              style={{ borderColor: 'var(--ap-border-strong)' }}
            >
              <option value="">— None —</option>
              {eligible.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email} ({u.role})</option>
              ))}
            </select>
            <IconBtn onClick={() => { update.mutate({ companyCeoUserId: ceoId }); setEditingCeo(false) }}><Check className="size-3.5" /></IconBtn>
            <IconBtn onClick={() => setEditingCeo(false)}><X className="size-3.5" /></IconBtn>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {settings.ceo ? (
              <>
                <Avatar name={settings.ceo.name ?? settings.ceo.email} />
                <span className="text-sm font-medium" style={{ color: 'var(--ap-fg)' }}>{settings.ceo.name ?? settings.ceo.email}</span>
              </>
            ) : (
              <span className="text-sm italic" style={{ color: 'var(--ap-fg-subtle)' }}>Not set</span>
            )}
            <button type="button" onClick={() => { setCeoId(settings.companyCeoUserId); setEditingCeo(true) }}
              className="rounded p-1 hover:bg-black/5">
              <Pencil className="size-3" style={{ color: 'var(--ap-fg-subtle)' }} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded p-1 transition-colors hover:bg-black/5"
      style={{ color: 'var(--ap-fg-muted)' }}>
      {children}
    </button>
  )
}
