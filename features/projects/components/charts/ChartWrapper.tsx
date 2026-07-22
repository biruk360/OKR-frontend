'use client'

import { useId, type ReactNode } from 'react'
import { Download } from 'lucide-react'

interface ChartWrapperProps {
  id: string
  title: string
  description?: string
  height?: number
  children: ReactNode
}

export function ChartWrapper({ id, title, description, height = 220, children }: ChartWrapperProps) {
  const autoId = useId().replace(/:/g, '')
  const domId = `project-chart-${id}-${autoId}`

  return (
    <section
      id={domId}
      className="rounded-lg border bg-surface-card p-3 shadow-sm"
      style={{ borderColor: 'var(--ap-border)' }}
      data-chart-id={id}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-body-sm font-semibold text-ink-primary">{title}</div>
          {description && <div className="mt-0.5 text-body-xs text-ink-tertiary">{description}</div>}
        </div>
        <button
          type="button"
          onClick={() => exportChartPng(domId, `${id.toLowerCase()}-${slug(title)}.png`)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-ink-secondary hover:bg-surface-hover"
          title="Export PNG"
          aria-label={`Export ${title} as PNG`}
        >
          <Download className="size-3.5" />
        </button>
      </div>
      <div style={{ height }} className="min-w-0">
        {children}
      </div>
    </section>
  )
}

export const chartColors = {
  blue: 'var(--ap-accent)',
  green: 'var(--ap-green)',
  orange: 'var(--ap-orange)',
  red: 'var(--ap-red)',
  purple: 'var(--ap-ahead)',
  muted: 'var(--ap-fg-faint)',
  border: 'var(--ap-border)',
  text: 'var(--ap-fg-muted)',
}

export const chartTooltip = {
  borderColor: 'var(--ap-border)',
  borderRadius: 10,
  background: 'var(--ap-bg-raised)',
  color: 'var(--ap-fg)',
  fontSize: 12,
}

export function HeatmapGrid({
  xLabels,
  yLabels,
  value,
}: {
  xLabels: string[]
  yLabels: string[]
  value: (yIndex: number, xIndex: number) => number
}) {
  return (
    <div className="h-full overflow-auto">
      <div className="min-w-max">
        <div className="grid gap-1" style={{ gridTemplateColumns: `120px repeat(${xLabels.length}, 34px)` }}>
          <div />
          {xLabels.map((label) => <div key={label} className="text-center text-[10px] text-ink-tertiary">{label}</div>)}
          {yLabels.map((label, y) => (
            <HeatmapRow key={label} label={label} xLabels={xLabels} y={y} value={value} />
          ))}
        </div>
      </div>
    </div>
  )
}

function HeatmapRow({ label, xLabels, y, value }: { label: string; xLabels: string[]; y: number; value: (yIndex: number, xIndex: number) => number }) {
  return (
    <>
      <div className="truncate py-1 pr-2 text-body-xs text-ink-secondary">{label}</div>
      {xLabels.map((x, i) => {
        const v = value(y, i)
        return <div key={`${label}-${x}`} title={`${label} · ${x} · ${v}`} className="h-6 rounded" style={{ background: heatColor(v) }} />
      })}
    </>
  )
}

function heatColor(value: number) {
  if (value >= 100) return 'var(--ap-red)'
  if (value >= 70) return 'var(--ap-orange)'
  if (value > 0) return 'var(--ap-green)'
  return 'var(--ap-bg-sunken)'
}

async function exportChartPng(elementId: string, filename: string) {
  const root = document.getElementById(elementId)
  const svg = root?.querySelector('svg')
  if (!root) return
  const serializer = new XMLSerializer()
  const source = svg ? serializer.serializeToString(svg) : htmlFallbackSvg(root)
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, image.width)
    canvas.height = Math.max(1, image.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ap-bg-raised') || '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
    URL.revokeObjectURL(url)
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = filename
    link.click()
  }
  image.src = url
}

function htmlFallbackSvg(root: HTMLElement) {
  const rect = root.getBoundingClientRect()
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll('button').forEach((button) => button.remove())
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  const xhtml = new XMLSerializer().serializeToString(clone)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(rect.width)}" height="${Math.ceil(rect.height)}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
