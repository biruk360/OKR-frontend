'use client'

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Archive,
  Save,
} from 'lucide-react'
import {
  PageHeader,
  Button,
  Input,
  Textarea,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
} from '@/components/ui'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import {
  LETTER_TYPE_LABEL,
  type LetterStatus,
  type UpdateLetterForm,
  type LetterType,
} from '@/types'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import LetterStatusBadge from './LetterStatusBadge'
import LetterStatusBar from './LetterStatusBar'
import CustomerLookup from './CustomerLookup'
import EnclosuresPanel from './EnclosuresPanel'
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
  const router = useRouter()
  const [letter, setLetter] = useState<LetterDetail>(initial)
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('GC')
  const [subject, setSubject] = useState(letter.subject)
  const [salutation, setSalutation] = useState(letter.salutation || '')
  const [closing, setClosing] = useState(letter.closing || '')
  const [recipientAddress, setRecipientAddress] = useState(letter.recipientAddress || '')
  const [senderDepartment, setSenderDepartment] = useState(letter.senderDepartment || '')
  const [signatoryId, setSignatoryId] = useState<string | null>(letter.signatoryId)
  const [customerName, setCustomerName] = useState(letter.customerName)
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(letter.odooPartnerId)
  // Body content is now owned by SuperDocEditorClient — it saves the .docx
  // binary (and HTML mirror) directly via PUT /api/letters/[id]/docx. The
  // form only manages the structured fields (subject, customer, dates, etc.).
  const [date, setDate] = useState(() => new Date(letter.date).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [enclosures, setEnclosures] = useState<LetterEnclosureWithUploader[]>(letter.enclosures)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)

  const editable = canEditDraft(viewer, letter)
  const status = letter.status as LetterStatus
  const { users } = useUsersForSelection()

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
        recipientAddress,
        salutation,
        closing,
        senderDepartment,
        signatoryId,
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
      await save() // ensure latest fields persisted first
      const updated = await submitLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Submit failed')
    }
  }

  async function handleApprove() {
    try {
      const updated = await approveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Approval failed')
    }
  }

  async function handleArchive() {
    try {
      const updated = await archiveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Archive failed')
    }
  }

  async function handleUnarchive() {
    try {
      const updated = await unarchiveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Unarchive failed')
    }
  }

  const transitionButtons = useMemo(() => {
    const buttons: React.ReactNode[] = []
    if (status === 'DRAFT' && editable) {
      buttons.push(
        <Button key="submit" onClick={handleSubmit} size="sm">
          <Send className="mr-1.5 size-3.5" /> {t('action.submitForApproval')}
        </Button>
      )
    }
    if (status === 'SUBMITTED' && canApprove(viewer.role)) {
      buttons.push(
        <Button key="approve" onClick={handleApprove} size="sm">
          <CheckCircle2 className="mr-1.5 size-3.5" /> {t('action.approve')}
        </Button>
      )
      buttons.push(
        <Button key="reject" variant="outline" size="sm" onClick={() => setShowRejectModal(true)}>
          <XCircle className="mr-1.5 size-3.5" /> {t('action.returnToDraft')}
        </Button>
      )
    }
    if (status === 'APPROVED') {
      buttons.push(
        <Button key="send" onClick={() => setShowSendModal(true)} size="sm">
          <PackageCheck className="mr-1.5 size-3.5" /> {t('action.markAsSent')}
        </Button>
      )
    }
    if (status === 'SENT') {
      buttons.push(
        <Button key="archive" variant="outline" size="sm" onClick={handleArchive}>
          <Archive className="mr-1.5 size-3.5" /> {t('action.archive')}
        </Button>
      )
    }
    if (status === 'ARCHIVED' && viewer.role === 'ADMIN') {
      buttons.push(
        <Button key="unarchive" variant="outline" size="sm" onClick={handleUnarchive}>
          {t('action.unarchive')}
        </Button>
      )
    }
    return buttons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, editable, viewer.role, lang])

  return (
    <div className={`space-y-4 p-6 ${lang === 'am' ? 'font-amharic' : ''}`}>
      <PageHeader
        title={letter.referenceNumber || 'Draft Letter'}
        description={`${LETTER_TYPE_LABEL[letter.letterType as LetterType]} · ${t('form.preparedBy')} ${letter.preparedBy.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white text-xs" title={t('form.lang.label')}>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 ${lang === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >EN</button>
              <button
                type="button"
                onClick={() => setLang('am')}
                className={`px-2.5 py-1 ${lang === 'am' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >አማ</button>
            </div>
            <Link href="/dashboard/letters">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1.5 size-3.5" /> {t('form.back')}
              </Button>
            </Link>
            {editable && (
              <Button variant="outline" size="sm" onClick={() => save()} disabled={saving}>
                <Save className="mr-1.5 size-3.5" /> {saving ? t('form.saving') : t('form.save')}
              </Button>
            )}
            {transitionButtons}
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LetterStatusBar status={status} />
          <LetterStatusBadge status={status} />
        </div>
      </Card>

      {saveError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
      )}

      <Card className="space-y-4 p-4">
        <div>
          <Label htmlFor="lf-subject">{t('create.subject')}</Label>
          <Input
            id="lf-subject"
            value={subject}
            disabled={!editable}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={255}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('form.recipientDetails')}</h3>
            <div>
              <Label>{t('create.customer')} <span className="text-xs font-normal text-gray-400">{t('create.customer.optional')}</span></Label>
              <CustomerLookup
                value={{ odooPartnerId, customerName }}
                onChange={(v) => {
                  setCustomerName(v.customerName)
                  setOdooPartnerId(v.odooPartnerId)
                  if (v.address && !recipientAddress) setRecipientAddress(v.address)
                }}
                disabled={!editable}
              />
            </div>
            <div>
              <Label htmlFor="lf-address">{t('form.recipientAddress')}</Label>
              <Textarea
                id="lf-address"
                rows={3}
                value={recipientAddress}
                disabled={!editable}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className={lang === 'am' ? 'font-amharic' : ''}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lf-salutation">{t('form.salutation')}</Label>
                <Input id="lf-salutation" value={salutation} disabled={!editable}
                  onChange={(e) => setSalutation(e.target.value)}
                  className={lang === 'am' ? 'font-amharic' : ''} />
              </div>
              <div>
                <Label htmlFor="lf-closing">{t('form.closing')}</Label>
                <Input id="lf-closing" value={closing} disabled={!editable}
                  onChange={(e) => setClosing(e.target.value)}
                  className={lang === 'am' ? 'font-amharic' : ''} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('form.senderInfo')}</h3>
            <div>
              <LetterDatePicker
                value={date}
                onChange={setDate}
                mode={calendarMode}
                onModeChange={setCalendarMode}
                disabled={!editable}
                lang={lang}
                label={t('form.date')}
                modeLabel={{ gc: t('form.calendar.gc'), ec: t('form.calendar.ec'), toggle: t('form.calendar.label') }}
              />
            </div>
            <div>
              <Label>{t('form.letterType')}</Label>
              <Input value={LETTER_TYPE_LABEL[letter.letterType as LetterType]} disabled />
            </div>
            <div>
              <Label htmlFor="lf-signatory">{t('form.signatory')}</Label>
              <select
                id="lf-signatory"
                value={signatoryId || ''}
                disabled={!editable && status !== 'SUBMITTED'}
                onChange={(e) => setSignatoryId(e.target.value || null)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{t('form.signatory.empty')}</option>
                {(users || []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="lf-dept">{t('form.senderDepartment')}</Label>
              <Input id="lf-dept" value={senderDepartment} disabled={!editable}
                onChange={(e) => setSenderDepartment(e.target.value)}
                className={lang === 'am' ? 'font-amharic' : ''} />
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="body" className="w-full">
        <TabsList>
          <TabsTrigger value="body">{t('form.tabs.body')}</TabsTrigger>
          <TabsTrigger value="enclosures">{t('form.tabs.enclosures')} ({enclosures.length})</TabsTrigger>
          <TabsTrigger value="preview">{t('form.tabs.preview')}</TabsTrigger>
        </TabsList>
        <TabsContent value="body">
          <Card className="p-2">
            <p className="px-2 pb-2 pt-1 text-xs text-gray-500">{t('form.body.help')}</p>
            <SuperDocEditorClient
              letterId={letter.id}
              docxUrl={`/api/letters/${letter.id}/docx`}
              editable={editable}
              user={{
                id: viewer.id,
                name: letter.preparedBy.name,
                email: letter.preparedBy.email,
              }}
            />
          </Card>
        </TabsContent>
        <TabsContent value="enclosures">
          <Card className="p-4">
            <EnclosuresPanel
              letterId={letter.id}
              enclosures={enclosures}
              canEdit={editable}
              onChange={setEnclosures}
            />
          </Card>
        </TabsContent>
        <TabsContent value="preview">
          <Card className="p-4">
            <PdfPreviewPanel letterId={letter.id} canPrint={status !== 'DRAFT'} />
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('form.activityLog')}</h3>
        <ActivityLogPanel entityType="letter" entityId={letter.id} embedded />
      </Card>

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
