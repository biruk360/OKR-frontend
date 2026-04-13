'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { ModuleRegistry } from 'ag-grid-community'
import { ClientSideRowModelModule } from 'ag-grid-community'
import SideDrawer from '@/components/ui/SideDrawer'

ModuleRegistry.registerModules([ClientSideRowModelModule])

interface Node {
  path: string[]
  id: string
  kind: 'OBJ' | 'KR' | 'INIT'
  title: string
  progress: number | null
  status: string | null
  owner: string | null
  href: string | null
}

const STATUS_COLOUR: Record<string, string> = {
  ON_TRACK: 'bg-emerald-100 text-emerald-800',
  AT_RISK: 'bg-amber-100 text-amber-800',
  OFF_TRACK: 'bg-red-100 text-red-800',
  CLOSED: 'bg-slate-100 text-slate-800',
  PENDING: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-100 text-slate-500',
}

export default function OkrHierarchyGrid({ rows }: { rows: Node[] }) {
  const [selected, setSelected] = useState<Node | null>(null)

  const columnDefs = useMemo(
    () => [
      {
        headerName: 'OKR',
        field: 'title' as const,
        minWidth: 360,
        flex: 2,
        cellRenderer: (p: any) => {
          const depth = Math.max(0, ((p.data as Node).path.length ?? 1) - 1)
          return (
            <span style={{ paddingLeft: depth * 16 }} className="block text-sm text-gray-800">
              {p.value}
            </span>
          )
        },
      },
      {
        headerName: 'Kind',
        field: 'kind' as const,
        width: 90,
        cellRenderer: (p: any) => {
          const kind = p.value as Node['kind']
          const cls =
            kind === 'OBJ'
              ? 'bg-violet-100 text-violet-700'
              : kind === 'KR'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
          return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>{kind}</span>
        },
      },
      {
        headerName: 'Progress',
        field: 'progress' as const,
        width: 120,
        cellRenderer: (p: any) => {
          const v = p.value as number | null
          if (v == null) return <span className="text-gray-400">—</span>
          return (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[40px]">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, v)}%` }} />
              </div>
              <span className="tabular-nums text-xs text-gray-700">{Math.round(v)}%</span>
            </div>
          )
        },
      },
      {
        headerName: 'Status',
        field: 'status' as const,
        width: 140,
        cellRenderer: (p: any) => {
          if (!p.value) return null
          const cls = STATUS_COLOUR[p.value as string] ?? 'bg-slate-100 text-slate-700'
          return (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
              {String(p.value).replace(/_/g, ' ')}
            </span>
          )
        },
      },
      { headerName: 'Owner', field: 'owner' as const, width: 160 },
    ],
    [],
  )

  return (
    <>
      <div className="ag-theme-quartz" style={{ width: '100%', height: 600 }}>
        <AgGridReact<Node>
          rowData={rows}
          columnDefs={columnDefs as any}
          animateRows
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          onRowClicked={(e) => e.data && setSelected(e.data)}
        />
      </div>

      <SideDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        width="lg"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Kind</p>
              <p className="font-medium text-gray-900">{selected.kind}</p>
            </div>
            {selected.progress != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Progress</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(100, selected.progress)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-gray-700">{Math.round(selected.progress)}%</span>
                </div>
              </div>
            )}
            {selected.status && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Status</p>
                <p className="font-medium text-gray-900">{selected.status.replace(/_/g, ' ')}</p>
              </div>
            )}
            {selected.owner && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Owner</p>
                <p className="font-medium text-gray-900">{selected.owner}</p>
              </div>
            )}
            {selected.href && (
              <Link
                href={selected.href}
                className="inline-block mt-2 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Open full page
              </Link>
            )}
            <div className="pt-3 border-t border-gray-100 text-xs text-gray-500">
              Path: {selected.path.join(' › ')}
            </div>
          </div>
        )}
      </SideDrawer>
    </>
  )
}
