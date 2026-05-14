'use client'

import { useContext, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Archive,
  Save,
  Printer,
} from 'lucide-react'
import { Button, Input, Label, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import { type LetterStatus, type UpdateLetterForm, LETTER_TYPE_LABEL } from '@/types'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import LetterStatusBadge from './LetterStatusBadge'
import LetterStatusBar from './LetterStatusBar'
import CustomerLookup from './CustomerLookup'
import PdfPreviewPanel from './PdfPreviewPanel'
import MarkAsSentModal from './MarkAsSentModal'
import RejectLetterModal from './RejectLetterModal'
import SuperDocEditorClient from './SuperDocEditorClient'
import LetterDatePicker, { type CalendarMode } from './LetterDatePicker'
import { LetterLangContext, useT, type LetterLang } from '../i18n'
import type { LetterDetail, LetterEnclosureWithUploader } from '../types'
import {
  approveLetter,
  archiveLetter,
  submitLetter,
  markLetterSent,
  rejectLetter,
  unarchiveLetter,
  updateLetter,
} from '../services/lettersApi'

interface Props {
  initial: LetterDetail
  viewer: { id: string; role: string }
}

function canEditDraft(viewer: Props['viewer'], letter: LetterDetail): boolean {
  if (viewer.role === 'ADMIN') return true
  return letter.preparedById === viewer.id && letter.status === 'DRAFT'
}

function canApprove(role: string) {
  return role === 'ADMIN' || role === 'EXECUTIVE'
}

export default function LetterFormClient(props: Props) {
  const [lang, setLang] = useState<LetterLang>('en')
  return (
    <LetterLangContext.Provider value={{ lang, setLang }}>
      <LetterFormInner {...props} />
    </LetterLangContext.Provider>
  )
}

function LetterFormInner({ initial, viewer }: Props) {
  const t = useT()
  const { lang, setLang } = useContext(LetterLangContext)
  const [letter, setLetter] = useState<LetterDetail>(initial)
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('GC')
  const [subject, setSubject] = useState(letter.subject)
  const [signatoryId, setSignatoryId] = useState<string | null>(letter.signatoryId)
  const [signatoryTitle, setSignatoryTitle] = useState<string>((letter as any).signatoryTitle || '')
  const [customerName, setCustomerName] = useState(letter.customerName)
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(letter.odooPartnerId)
  const [date, setDate] = useState(() => new Date(letter.date).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [enclosures, setEnclosures] = useState<LetterEnclosureWithUploader[]>(letter.enclosures)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)

  const editable = canEditDraft(viewer, letter)
  const status = letter.status as LetterStatus
  const { users } = useUsersForSelection()

  const typeName =
    letter.letterTypeDef?.name ??
    LETTER_TYPE_LABEL[letter.letterType as keyof typeof LETTER_TYPE_LABEL] ??
    letter.letterType

  async function save(opts?: { silent?: boolean }): Promise<void> {
    if (!editable) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload: UpdateLetterForm = {
        subject,
        date,
        customerName,
        odooPartnerId,
        signatoryId,
        signatoryTitle: signatoryTitle || null,
      }
      const updated = await updateLetter(letter.id, payload)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      if (!opts?.silent) setSaveError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    try {
      await save()
      const updated = await submitLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) { setSaveError(e?.message || 'Submit failed') }
  }
  async function handleApprove() {
    try {
      const updated = await approveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) { setSaveError(e?.message || 'Approval failed') }
  }
  async function handleArchive() {
    try {
      const updated = await archiveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) { setSaveError(e?.message || 'Archive failed') }
  }
  async function handleUnarchive() {
    try {
      const updated = await unarchiveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) { setSaveError(e?.message || 'Unarchive failed') }
  }

  const transitionButtons = useMemo(() => {
    const buttons: React.ReactNode[] = []
    if (status === 'DRAFT' && editable) {
      buttons.push(
        <Button key="submit" onClick={handleSubmit} className="h-10">
          <Send className="mr-1.5 size-3.5" /> {t('action.submitForApproval')}
        </Button>
      )
    }
    if (status === 'SUBMITTED' && canApprove(viewer.role)) {
      buttons.push(
        <Button key="approve" onClick={handleApprove} className="h-10">
          <CheckCircle2 className="mr-1.5 size-3.5" /> {t('action.approve')}
        </Button>
      )
      buttons.push(
        <Button key="reject" variant="outline" className="h-10" onClick={() => setShowRejectModal(true)}>
          <XCircle className="mr-1.5 size-3.5" /> {t('action.returnToDraft')}
        </Button>
      )
    }
    if (status === 'APPROVED') {
      buttons.push(
        <Button key="send" onClick={() => setShowSendModal(true)} className="h-10">
          <PackageCheck className="mr-1.5 size-3.5" /> {t('action.markAsSent')}
        </Button>
      )
    }
    if (status === 'SENT') {
      buttons.push(
        <Button key="archive" variant="outline" className="h-10" onClick={handleArchive}>
          <Archive className="mr-1.5 size-3.5" /> {t('action.archive')}
        </Button>
      )
    }
    if (status === 'ARCHIVED' && viewer.role === 'ADMIN') {
      buttons.push(
        <Button key="unarchive" variant="outline" className="h-10" onClick={handleUnarchive}>
          {t('action.unarchive')}
        </Button>
      )
    }
    return buttons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, editable, viewer.role, lang])

  return (
    <div className={cn('space-y-4 p-6', lang === 'am' && 'font-amharic')}>
      <PageHeader
        title={letter.referenceNumber || 'Draft Letter'}
        description={`${typeName} · ${t('form.preparedBy')} ${letter.preparedBy.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/letters">
              <Button variant="outline" className="h-10">
                <ArrowLeft className="mr-1.5 size-3.5" /> {t('form.back')}
              </Button>
            </Link>
            {editable && (
              <Button variant="outline" className="h-10" onClick={() => save()} disabled={saving}>
                <Save className="mr-1.5 size-3.5" /> {saving ? t('form.saving') : t('form.save')}
              </Button>
            )}
            <Button
              variant="outline"
              className="h-10"
              onClick={() => {
                const url = `/api/letters/${letter.id}/pdf?lang=${lang}`
                const win = window.open(url, '_blank')
                if (win) win.addEventListener('load', () => { try { win.print() } catch {} })
                else window.location.href = url
              }}
              title={t('pdf.print')}
            >
              <Printer className="mr-1.5 size-3.5" /> {t('pdf.print')}
            </Button>
            {transitionButtons}
          </div>
        }
      />

      {/* Status strip */}
      <ApCard padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LetterStatusBar status={status} />
          <LetterStatusBadge status={status} />
        </div>
      </ApCard>

      {saveError && (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900/30 dark:bg-red-900/15 dark:text-red-300">
          {saveError}
        </div>
      )}

      {/* Details card — single column, compact */}
      <ApCard
        padding="lg"
        header={
          <div className="flex items-center justify-between">
            <SectionLabel>Details</SectionLabel>
            <LangSwitch lang={lang} onChange={setLang} />
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('create.subject')} htmlFor="lf-subject" className="md:col-span-2">
            <Input
              id="lf-subject"
              value={subject}
              disabled={!editable}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={255}
              className={cn('h-10', lang === 'am' && 'font-amharic')}
            />
          </Field>

          <Field
            label={
              <>
                {t('create.customer')}{' '}
                <span className="text-[11px] font-normal text-muted-foreground">{t('create.customer.optional')}</span>
              </>
            }
          >
            <CustomerLookup
              value={{ odooPartnerId, customerName }}
              onChange={(v) => {
                setCustomerName(v.customerName)
                setOdooPartnerId(v.odooPartnerId)
              }}
              disabled={!editable}
            />
          </Field>

          <Field label={t('form.date')}>
            <LetterDatePicker
              value={date}
              onChange={setDate}
              mode={calendarMode}
              onModeChange={setCalendarMode}
              disabled={!editable}
              lang={lang}
              modeLabel={{ gc: t('form.calendar.gc'), ec: t('form.calendar.ec'), toggle: t('form.calendar.label') }}
            />
          </Field>

          <Field label={t('form.letterType')}>
            <Input value={typeName} disabled className="h-10" />
          </Field>

          <Field label={t('form.signatory')} htmlFor="lf-signatory">
            <select
              id="lf-signatory"
              value={signatoryId || ''}
              disabled={!editable && status !== 'SUBMITTED'}
              onChange={(e) => setSignatoryId(e.target.value || null)}
              className="flex h-10 w-full rounded-[14px] border bg-card px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)] focus:ring-offset-1 disabled:opacity-60"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <option value="">{t('form.signatory.empty')}</option>
              {(users || []).map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </Field>

          <Field label={t('form.signatoryTitle')} htmlFor="lf-signatory-title">
            <Input
              id="lf-signatory-title"
              value={signatoryTitle}
              disabled={!editable && status !== 'SUBMITTED'}
              onChange={(e) => setSignatoryTitle(e.target.value)}
              placeholder={t('form.signatoryTitle.placeholder')}
              className="h-10"
            />
          </Field>
        </div>
      </ApCard>

      {/* Body / Preview tabs */}
      <Tabs defaultValue="body" className="w-full">
        <TabsList
          className="rounded-[12px] border bg-card p-1 shadow-sm"
          style={{ borderColor: 'var(--ap-border)' } as any}
        >
          <TabsTrigger value="body">{t('form.tabs.body')}</TabsTrigger>
          <TabsTrigger value="preview">{t('form.tabs.preview')}</TabsTrigger>
        </TabsList>

        <TabsContent value="body" className="mt-3">
          <ApCard padding="md">
            <p className="mb-2 text-[12px] text-muted-foreground">{t('form.body.help')}</p>
            <SuperDocEditorClient
              letterId={letter.id}
              docxUrl={`/api/letters/${letter.id}/docx`}
              editable={editable}
              user={{ id: viewer.id, name: letter.preparedBy.name, email: letter.preparedBy.email }}
            />
          </ApCard>
        </TabsContent>

        <TabsContent value="preview" className="mt-3">
          <ApCard padding="lg">
            <PdfPreviewPanel letterId={letter.id} />
          </ApCard>
        </TabsContent>
      </Tabs>

      {/* Activity log */}
      <ApCard padding="lg" header={<SectionLabel>{t('form.activityLog')}</SectionLabel>}>
        <ActivityLogPanel entityType="letter" entityId={letter.id} embedded />
      </ApCard>

      <RejectLetterModal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onSubmit={async (reason) => {
          const updated = await rejectLetter(letter.id, reason)
          setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
        }}
      />
      <MarkAsSentModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSubmit={async (payload) => {
          const updated = await markLetterSent(letter.id, payload)
          setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
        }}
      />
    </div>
  )
}

// ---------- Local building blocks (kept inside this file so they can lean on
// the form's specific spacing / status colours without polluting the shared
// component catalog) ----------

function ApCard({
  children,
  padding = 'md',
  header,
}: {
  children: React.ReactNode
  padding?: 'sm' | 'md' | 'lg'
  header?: React.ReactNode
}) {
  const pad = padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-5' : 'p-4'
  return (
    <div
      className="rounded-[16px] border bg-card shadow-card"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      {header && (
        <div className="border-b px-5 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          {header}
        </div>
      )}
      <div className={pad}>{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{children}</h3>
  )
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor} className="text-[12px]">{label}</Label>
      {children}
    </div>
  )
}

function LangSwitch({ lang, onChange }: { lang: LetterLang; onChange: (l: LetterLang) => void }) {
  return (
    <div
      className="inline-flex h-10 overflow-hidden rounded-[10px] border bg-card text-[12px] shadow-sm"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      {(['en', 'am'] as LetterLang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={cn(
            'px-3 font-medium transition-colors',
            lang === l ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {l === 'en' ? 'EN' : 'አማ'}
        </button>
      ))}
    </div>
  )
}
