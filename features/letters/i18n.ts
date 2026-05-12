'use client'

import { createContext, useContext } from 'react'

export type LetterLang = 'en' | 'am'

const STRINGS = {
  en: {
    // List view
    'page.title': 'Letters',
    'page.description': 'Cover, offer, and guarantee letters — drafted, approved, and dispatched.',
    'list.new': 'New Letter',
    'list.search': 'Search reference, subject, or customer…',
    'list.tab.all': 'All',
    'list.tab.mine': 'My Letters',
    'list.tab.draft': 'Draft',
    'list.tab.submitted': 'Submitted',
    'list.tab.approved': 'Approved',
    'list.tab.sent': 'Sent',
    'list.tab.archived': 'Archived',
    'list.type.all': 'All types',
    'list.type.cover': 'Cover',
    'list.type.offer': 'Offer',
    'list.type.guarantee': 'Guarantee',
    'list.col.reference': 'Reference',
    'list.col.subject': 'Subject',
    'list.col.customer': 'Customer',
    'list.col.preparedBy': 'Prepared By',
    'list.col.signatory': 'Signatory',
    'list.col.type': 'Type',
    'list.col.date': 'Date',
    'list.col.status': 'Status',
    'list.empty.title': 'No letters yet',
    'list.empty.description': 'Create your first letter to get started.',

    // Create modal
    'create.title': 'New Letter',
    'create.subject': 'Subject',
    'create.subject.placeholder': 'e.g. Offer for 2026 Cloud Hosting',
    'create.type': 'Letter Type',
    'create.customer': 'Customer',
    'create.customer.optional': '(optional)',
    'create.cancel': 'Cancel',
    'create.submit': 'Create Draft',
    'create.submitting': 'Creating…',

    // Form / sections
    'form.back': 'Back',
    'form.save': 'Save',
    'form.saving': 'Saving…',
    'form.preparedBy': 'prepared by',
    'form.recipientDetails': 'Recipient Details',
    'form.senderInfo': 'Sender Info',
    'form.recipientAddress': 'Recipient Address',
    'form.salutation': 'Salutation',
    'form.closing': 'Closing',
    'form.date': 'Date',
    'form.letterType': 'Letter Type',
    'form.signatory': 'Signatory',
    'form.signatory.empty': '— Select signatory —',
    'form.senderDepartment': 'Sender Department',
    'form.tabs.body': 'Body Content',
    'form.tabs.enclosures': 'Enclosures',
    'form.tabs.preview': 'PDF Preview',
    'form.body.help': 'Placeholders like {{customer_name}}, {{date}}, {{reference_number}} resolve at PDF generation.',
    'form.activityLog': 'Activity Log',
    'form.lang.label': 'Letter language',
    'form.lang.en': 'English',
    'form.lang.am': 'አማርኛ',
    'form.calendar.label': 'Calendar',
    'form.calendar.gc': 'Gregorian',
    'form.calendar.ec': 'Ethiopian',

    // Transitions
    'action.submitForApproval': 'Submit for Approval',
    'action.approve': 'Approve',
    'action.returnToDraft': 'Return to Draft',
    'action.markAsSent': 'Mark as Sent',
    'action.archive': 'Archive',
    'action.unarchive': 'Unarchive',

    // Status labels
    'status.DRAFT': 'Draft',
    'status.SUBMITTED': 'Submitted',
    'status.APPROVED': 'Approved',
    'status.SENT': 'Sent',
    'status.ARCHIVED': 'Archived',

    // Reject modal
    'reject.title': 'Return to Draft',
    'reject.reason': 'Reason',
    'reject.reason.placeholder': 'Explain what needs to change before this letter can be approved…',
    'reject.cancel': 'Cancel',
    'reject.confirm': 'Return to Draft',
    'reject.confirming': 'Returning…',

    // Dispatch modal
    'send.title': 'Mark as Sent',
    'send.method': 'Dispatch Method',
    'send.method.EMAIL': 'Email',
    'send.method.PRINTED': 'Printed',
    'send.method.COURIER': 'Courier',
    'send.date': 'Dispatch Date',
    'send.tracking': 'Tracking Reference (optional)',
    'send.tracking.placeholder': 'e.g. DHL-AWB 8421 0091',
    'send.cancel': 'Cancel',
    'send.confirm': 'Mark as Sent',
    'send.confirming': 'Marking…',

    // PDF
    'pdf.generate': 'Generate PDF Preview',
    'pdf.regenerate': 'Regenerate Preview',
    'pdf.print': 'Print',
    'pdf.missing': 'Unresolved placeholders:',
    'pdf.empty': 'Click Generate PDF Preview to render the letter.',
    'pdf.failed': 'PDF generation failed',
    'pdf.retry': 'Retry',

    // Enclosures
    'enc.add': 'Add files',
    'enc.uploading': 'Uploading…',
    'enc.empty': 'No enclosures attached yet.',
    'enc.count': 'file(s)',
  },
  am: {
    // List view
    'page.title': 'ደብዳቤዎች',
    'page.description': 'መሸኛ፣ የቅናሽ እና የዋስትና ደብዳቤዎች — ረቂቅ፣ ጸድቀዋል፣ ተልከዋል።',
    'list.new': 'አዲስ ደብዳቤ',
    'list.search': 'ቁጥር፣ ርዕስ ወይም ደንበኛ ይፈልጉ…',
    'list.tab.all': 'ሁሉም',
    'list.tab.mine': 'የእኔ ደብዳቤዎች',
    'list.tab.draft': 'ረቂቅ',
    'list.tab.submitted': 'ቀርቧል',
    'list.tab.approved': 'ጸድቋል',
    'list.tab.sent': 'ተልኳል',
    'list.tab.archived': 'ተመዝግቧል',
    'list.type.all': 'ሁሉም ዓይነቶች',
    'list.type.cover': 'መሸኛ',
    'list.type.offer': 'ቅናሽ',
    'list.type.guarantee': 'ዋስትና',
    'list.col.reference': 'መለያ ቁጥር',
    'list.col.subject': 'ርዕስ',
    'list.col.customer': 'ደንበኛ',
    'list.col.preparedBy': 'አዘጋጅ',
    'list.col.signatory': 'ፈራሚ',
    'list.col.type': 'ዓይነት',
    'list.col.date': 'ቀን',
    'list.col.status': 'ሁኔታ',
    'list.empty.title': 'እስካሁን ምንም ደብዳቤዎች የሉም',
    'list.empty.description': 'ለመጀመር የመጀመሪያውን ደብዳቤዎ ይፍጠሩ።',

    // Create modal
    'create.title': 'አዲስ ደብዳቤ',
    'create.subject': 'ርዕስ',
    'create.subject.placeholder': 'ለምሳሌ፡ ለ2026 የክላውድ ሆስቲንግ ቅናሽ',
    'create.type': 'የደብዳቤ ዓይነት',
    'create.customer': 'ደንበኛ',
    'create.customer.optional': '(አስፈላጊ አይደለም)',
    'create.cancel': 'ሰርዝ',
    'create.submit': 'ረቂቅ ፍጠር',
    'create.submitting': 'በመፍጠር ላይ…',

    // Form / sections
    'form.back': 'ተመለስ',
    'form.save': 'አስቀምጥ',
    'form.saving': 'በማስቀመጥ ላይ…',
    'form.preparedBy': 'አዘጋጅ',
    'form.recipientDetails': 'የተቀባይ ዝርዝሮች',
    'form.senderInfo': 'የላኪ መረጃ',
    'form.recipientAddress': 'የተቀባይ አድራሻ',
    'form.salutation': 'ሰላምታ',
    'form.closing': 'መዝጊያ',
    'form.date': 'ቀን',
    'form.letterType': 'የደብዳቤ ዓይነት',
    'form.signatory': 'ፈራሚ',
    'form.signatory.empty': '— ፈራሚ ይምረጡ —',
    'form.senderDepartment': 'የላኪ መምሪያ',
    'form.tabs.body': 'የደብዳቤው ይዘት',
    'form.tabs.enclosures': 'ተያይዘዋል',
    'form.tabs.preview': 'PDF ቅድመ እይታ',
    'form.body.help': 'እንደ {{customer_name}}, {{date}}, {{reference_number}} ያሉ ቦታ ያዢዎች PDF በሚፈጠርበት ጊዜ ይተካሉ።',
    'form.activityLog': 'የተግባር ምዝገባ',
    'form.lang.label': 'የደብዳቤ ቋንቋ',
    'form.lang.en': 'English',
    'form.lang.am': 'አማርኛ',
    'form.calendar.label': 'ዘመን አቆጣጠር',
    'form.calendar.gc': 'ግሪጎሪያን',
    'form.calendar.ec': 'ኢትዮጵያ',

    // Transitions
    'action.submitForApproval': 'ለማጽደቅ አቅርብ',
    'action.approve': 'አጽድቅ',
    'action.returnToDraft': 'ወደ ረቂቅ መልስ',
    'action.markAsSent': 'እንደተላከ ምልክት አድርግ',
    'action.archive': 'መዝግብ',
    'action.unarchive': 'ከመዝገብ አውጣ',

    // Status labels
    'status.DRAFT': 'ረቂቅ',
    'status.SUBMITTED': 'ቀርቧል',
    'status.APPROVED': 'ጸድቋል',
    'status.SENT': 'ተልኳል',
    'status.ARCHIVED': 'ተመዝግቧል',

    // Reject modal
    'reject.title': 'ወደ ረቂቅ መልስ',
    'reject.reason': 'ምክንያት',
    'reject.reason.placeholder': 'ደብዳቤው ከመጽደቁ በፊት ምን መለወጥ እንዳለበት ያብራሩ…',
    'reject.cancel': 'ሰርዝ',
    'reject.confirm': 'ወደ ረቂቅ መልስ',
    'reject.confirming': 'በመመለስ ላይ…',

    // Dispatch modal
    'send.title': 'እንደተላከ ምልክት አድርግ',
    'send.method': 'የመላኪያ ዘዴ',
    'send.method.EMAIL': 'ኢሜል',
    'send.method.PRINTED': 'በህትመት',
    'send.method.COURIER': 'በፖስታ',
    'send.date': 'የተላከበት ቀን',
    'send.tracking': 'መከታተያ ቁጥር (አስፈላጊ አይደለም)',
    'send.tracking.placeholder': 'ለምሳሌ፡ DHL-AWB 8421 0091',
    'send.cancel': 'ሰርዝ',
    'send.confirm': 'እንደተላከ ምልክት አድርግ',
    'send.confirming': 'በምልክት ላይ…',

    // PDF
    'pdf.generate': 'PDF ቅድመ እይታ ፍጠር',
    'pdf.regenerate': 'ቅድመ እይታ እንደገና ፍጠር',
    'pdf.print': 'አትም',
    'pdf.missing': 'ያልተተኩ ቦታ ያዢዎች፡',
    'pdf.empty': 'ደብዳቤውን ለማስመር PDF ቅድመ እይታ ፍጠር የሚለውን ይጫኑ።',
    'pdf.failed': 'PDF ማስመር አልተሳካም',
    'pdf.retry': 'እንደገና ሞክር',

    // Enclosures
    'enc.add': 'ፋይሎች ጨምር',
    'enc.uploading': 'በመስቀል ላይ…',
    'enc.empty': 'እስካሁን ምንም ተያያዥ ፋይል የለም።',
    'enc.count': 'ፋይል',
  },
} as const

export type StringKey = keyof typeof STRINGS['en']

export const LetterLangContext = createContext<{
  lang: LetterLang
  setLang: (l: LetterLang) => void
}>({ lang: 'en', setLang: () => {} })

export function useLetterLang() {
  return useContext(LetterLangContext)
}

export function t(lang: LetterLang, key: StringKey): string {
  return STRINGS[lang][key] ?? STRINGS.en[key]
}

export function useT() {
  const { lang } = useLetterLang()
  return (key: StringKey) => t(lang, key)
}
