'use client'

import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button, Input, Label } from '@/components/ui'
import { useSaveTemplateSettings } from '../hooks/useTemplateSettings'
import { NativeSelect } from './NativeSelect'
import { SectionCard } from './SectionCard'

type BandDraft = { min: number; label: string }
type GatekeeperDraft = { tierName: string; threshold: number }

/**
 * Validation mirrors lib/performance/scoring.ts validateDecisionBands and the
 * gatekeeper checks in template-validation.ts: labels required, mins within
 * 0-100 strictly descending, final band min 0, gatekeeper tier must exist and
 * its threshold cannot exceed the tier max points.
 */
function validate(gatekeeper: GatekeeperDraft, bands: BandDraft[], tiers: Array<{ name: string; maxPoints: number }>): string[] {
  const errors: string[] = []
  if (bands.length === 0) errors.push('At least one decision band is required')
  for (const band of bands) {
    if (!band.label.trim()) errors.push('Every decision band requires a label')
    if (!Number.isFinite(band.min) || band.min < 0 || band.min > 100) {
      errors.push('Decision band minimums must be between 0 and 100')
    }
  }
  for (let index = 1; index < bands.length; index++) {
    if (bands[index - 1].min <= bands[index].min) {
      errors.push('Decision bands must be ordered from highest minimum to lowest minimum')
      break
    }
  }
  if (bands.length > 0 && bands[bands.length - 1].min !== 0) {
    errors.push('Decision bands must include a final band beginning at 0')
  }
  const tier = tiers.find((candidate) => candidate.name === gatekeeper.tierName)
  if (!tier) errors.push('Gatekeeper tier must be one of the template tiers')
  if (!Number.isFinite(gatekeeper.threshold) || gatekeeper.threshold < 0) {
    errors.push('Gatekeeper threshold must be a non-negative number')
  } else if (tier && gatekeeper.threshold > tier.maxPoints) {
    errors.push('Gatekeeper threshold cannot exceed the tier max points')
  }
  return Array.from(new Set(errors))
}

export function TemplateScoringSettings({ templateId, editable, tiers, gatekeeperJson, bandsJson }: {
  templateId: string
  editable: boolean
  tiers: Array<{ name: string; maxPoints: number }>
  gatekeeperJson: Record<string, unknown>
  bandsJson: Array<Record<string, unknown>>
}) {
  const saveSettings = useSaveTemplateSettings(templateId)
  const [gatekeeper, setGatekeeper] = useState<GatekeeperDraft>({ tierName: '', threshold: 0 })
  const [bands, setBands] = useState<BandDraft[]>([])

  useEffect(() => {
    setGatekeeper({
      tierName: typeof gatekeeperJson?.tierName === 'string' ? gatekeeperJson.tierName : '',
      threshold: Number(gatekeeperJson?.threshold ?? 0),
    })
    setBands((Array.isArray(bandsJson) ? bandsJson : []).map((band) => ({
      min: Number(band.min ?? 0),
      label: String(band.label ?? ''),
    })))
  }, [gatekeeperJson, bandsJson])

  const errors = validate(gatekeeper, bands, tiers)

  function updateBand(index: number, patch: Partial<BandDraft>) {
    setBands((current) => current.map((band, bandIndex) => bandIndex === index ? { ...band, ...patch } : band))
  }

  return (
    <SectionCard title="Gatekeeper & decision bands" contentClassName="space-y-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Gatekeeper tier</Label>
            <NativeSelect
              value={gatekeeper.tierName}
              disabled={!editable}
              onChange={(event) => setGatekeeper((current) => ({ ...current, tierName: event.target.value }))}
            >
              <option value="">Select a tier…</option>
              {tiers.map((tier, index) => <option key={index} value={tier.name}>{tier.name} (max {tier.maxPoints})</option>)}
            </NativeSelect>
          </div>
          <div>
            <Label>Threshold (points)</Label>
            <Input
              type="number"
              value={gatekeeper.threshold}
              disabled={!editable}
              onChange={(event) => setGatekeeper((current) => ({ ...current, threshold: Number(event.target.value) }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Decision bands (highest minimum first, final band at 0)</Label>
          {bands.map((band, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="number"
                className="w-24"
                value={band.min}
                disabled={!editable}
                onChange={(event) => updateBand(index, { min: Number(event.target.value) })}
              />
              <span className="text-xs text-muted-foreground">min %</span>
              <Input
                value={band.label}
                placeholder="Band label"
                disabled={!editable}
                onChange={(event) => updateBand(index, { label: event.target.value })}
              />
              {editable && (
                <Button variant="outline" size="sm" onClick={() => setBands((current) => current.filter((_, bandIndex) => bandIndex !== index))}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {editable && (
            <Button variant="outline" size="sm" onClick={() => setBands((current) => [...current, { min: 0, label: '' }])}>
              <Plus className="mr-2 size-4" /> Add band
            </Button>
          )}
        </div>
        {errors.length > 0 && (
          <ul className="space-y-1 text-xs text-danger-600">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        )}
        {editable && (
          <Button
            onClick={() => saveSettings.mutate({ gatekeeper, bands })}
            disabled={errors.length > 0 || saveSettings.isPending}
          >
            <Save className="mr-2 size-4" /> Save gatekeeper & bands
          </Button>
        )}
    </SectionCard>
  )
}
