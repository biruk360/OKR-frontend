'use client'

import { useState, useRef, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Download, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import toast from 'react-hot-toast'

const ByRoleTab = lazy(() => import('@/components/settings/permissions/ByRoleTab'))
const ByDocTypeTab = lazy(() => import('@/components/settings/permissions/ByDocTypeTab'))
const FieldLevelsTab = lazy(() => import('@/components/settings/permissions/FieldLevelsTab'))
const RecordScopingTab = lazy(() => import('@/components/settings/permissions/RecordScopingTab'))
const FeaturesNavTab = lazy(() => import('@/components/settings/permissions/FeaturesNavTab'))
import ExplainPanel from './permissions/ExplainPanel'

type Tab = 'by-role' | 'by-doctype' | 'field-levels' | 'record-scoping' | 'features-nav' | 'permission-check'

const TABS: { id: Tab; label: string }[] = [
  { id: 'by-role', label: 'By Role' },
  { id: 'by-doctype', label: 'By DocType' },
  { id: 'field-levels', label: 'Field Levels' },
  { id: 'record-scoping', label: 'Record Scoping' },
  { id: 'features-nav', label: 'Features & Navigation' },
  { id: 'permission-check', label: 'Permission Check' },
]

interface ImportDiff {
  roles?: { added: number; modified: number; unchanged: number }
  docTypePerms?: { added: number; modified: number; unchanged: number }
  featurePerms?: { added: number; modified: number; unchanged: number }
  scopeRules?: { added: number; modified: number; unchanged: number }
}

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

export default function PermissionManager() {
  const [activeTab, setActiveTab] = useState<Tab>('by-role')
  const [preselectedDoctype, setPreselectedDoctype] = useState('')
  const [importData, setImportData] = useState<string>('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importDiff, setImportDiff] = useState<ImportDiff | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    try {
      const res = await fetch('/api/permissions/export', { method: 'POST' })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `permissions-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to export permissions')
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      setImportData(text)
      setImportError('')
      setImportLoading(true)
      try {
        const parsed = JSON.parse(text)
        const res = await fetch('/api/permissions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: parsed, dryRun: true }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Dry-run failed')
        setImportDiff(json.data ?? json.diff ?? null)
        setShowImportModal(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to preview import')
      } finally {
        setImportLoading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  async function handleConfirmImport() {
    setImportLoading(true)
    setImportError('')
    try {
      const parsed = JSON.parse(importData)
      const res = await fetch('/api/permissions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsed, dryRun: false }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')
      toast.success('Permissions imported successfully')
      setShowImportModal(false)
      setImportDiff(null)
      setImportData('')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportLoading(false)
    }
  }

  function handleCloseModal() {
    if (importLoading) return
    setShowImportModal(false)
    setImportDiff(null)
    setImportData('')
    setImportError('')
  }

  const diffRows: { label: string; key: keyof ImportDiff }[] = [
    { label: 'Roles', key: 'roles' },
    { label: 'DocType Perms', key: 'docTypePerms' },
    { label: 'Feature Perms', key: 'featurePerms' },
    { label: 'Scope Rules', key: 'scopeRules' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export Permissions
          </button>
          <button
            onClick={handleImportClick}
            disabled={importLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import Permissions
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <div className="border-b mb-6">
        <nav className="-mb-px flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'by-role' && (
            <ByRoleTab
              onConfigureFields={(key) => { setPreselectedDoctype(key); setActiveTab('field-levels') }}
            />
          )}
          {activeTab === 'by-doctype' && <ByDocTypeTab />}
          {activeTab === 'field-levels' && <FieldLevelsTab initialDoctype={preselectedDoctype} />}
          {activeTab === 'record-scoping' && <RecordScopingTab />}
          {activeTab === 'features-nav' && <FeaturesNavTab />}
          {activeTab === 'permission-check' && <ExplainPanel />}
        </Suspense>
      </div>

      <Modal
        open={showImportModal}
        onClose={handleCloseModal}
        title="Import Preview"
        size="md"
        footer={
          <>
            <button
              onClick={handleCloseModal}
              disabled={importLoading}
              className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={importLoading}
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {importLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Import
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-600">Table</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Added</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Modified</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Unchanged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diffRows.map(({ label, key }) => {
                  const row = importDiff?.[key]
                  return (
                    <tr key={key} className="bg-white">
                      <td className="px-4 py-2.5 text-gray-700">{label}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn('font-medium', (row?.added ?? 0) > 0 ? 'text-green-600' : 'text-gray-400')}>
                          {row?.added ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn('font-medium', (row?.modified ?? 0) > 0 ? 'text-amber-600' : 'text-gray-400')}>
                          {row?.modified ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-400">
                        {row?.unchanged ?? 0}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {importError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {importError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
