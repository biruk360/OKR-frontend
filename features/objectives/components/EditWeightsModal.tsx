'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui'

interface WeightRow {
  id: string
  title: string
  kind: 'KR' | 'OBJ'
  status: string
  weight: number
}

interface Props {
  open: boolean
  onClose: () => void
  objectiveId: string
  objectiveTitle: string
  onSaved?: () => void
}

/**
 * Bulk-edit weights for KRs + sub-objectives under a parent objective.
 * Users enter raw weight numbers (0 = auto). Contribution % is computed live
 * so the user sees how the parent's rollup will redistribute.
 */
export default function EditWeightsModal({
  open,
  onClose,
  objectiveId,
  objectiveTitle,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<WeightRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/objectives/${objectiveId}/weights`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to load weights')
        const next: WeightRow[] = [
          ...(res.data.keyResults || []).map((k: any) => ({
            id: k.id,
            title: k.title,
            kind: 'KR' as const,
            status: k.confidence,
            weight: k.weight ?? 0,
          })),
          ...(res.data.childObjectives || []).map((o: any) => ({
            id: o.id,
            title: o.title,
            kind: 'OBJ' as const,
            status: o.goalStatus,
            weight: o.weight ?? 0,
          })),
        ]
        setRows(next)
      })
      .catch((err) => toast.error(err.message || 'Failed to load weights'))
      .finally(() => setLoading(false))
  }, [open, objectiveId])

  const contributions = useMemo(() => computeContribution(rows), [rows])

  const updateRow = (id: string, weight: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, weight } : r)))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body = {
        keyResults: rows.filter((r) => r.kind === 'KR').map((r) => ({ id: r.id, weight: r.weight })),
        childObjectives: rows.filter((r) => r.kind === 'OBJ').map((r) => ({ id: r.id, weight: r.weight })),
      }
      const res = await fetch(`/api/objectives/${objectiveId}/weights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed')
      toast.success('Weights updated.')
      onSaved?.()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit weights of contributing KRs & sub-objectives" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Weight increases or decreases the significance of a key result or sub-objective when contributing
          to <span className="font-medium">{objectiveTitle}</span>&apos;s progress. Leave <code>0</code> to let the system
          split weight equally. Contribution % updates live.
        </p>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No key results or sub-objectives yet.</div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">OKR</th>
                  <th className="text-left px-3 py-2 w-28">Status</th>
                  <th className="text-left px-3 py-2 w-24">Weight</th>
                  <th className="text-left px-3 py-2 w-28">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block text-[10px] font-semibold mr-2 px-1.5 py-0.5 rounded ${row.kind === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
                      >
                        {row.kind}
                      </span>
                      <span className="text-foreground">{row.title}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.status}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={row.weight}
                        onChange={(e) => updateRow(row.id, Number(e.target.value))}
                        className="w-20 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {contributions[row.id]?.toFixed(0) ?? 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save weights'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function computeContribution(rows: WeightRow[]): Record<string, number> {
  if (rows.length === 0) return {}
  const explicit = rows.filter((r) => r.weight > 0)
  const avgExplicit =
    explicit.length > 0 ? explicit.reduce((s, r) => s + r.weight, 0) / explicit.length : 1
  const effective = rows.map((r) => ({ id: r.id, w: r.weight > 0 ? r.weight : avgExplicit }))
  const total = effective.reduce((s, r) => s + r.w, 0) || 1
  const out: Record<string, number> = {}
  for (const r of effective) out[r.id] = (r.w / total) * 100
  return out
}
