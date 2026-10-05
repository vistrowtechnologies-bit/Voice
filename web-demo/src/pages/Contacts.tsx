import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { PhoneNumberField } from '../components/PhoneNumberField'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import {
  callContactNow,
  contactsExportUrl,
  createContact,
  deleteAllContacts,
  deleteContact,
  fetchContacts,
  fetchPhoneNumbers,
  formatRelativeTime,
  importContactsMapped,
  previewContactsImport,
  updateContact,
} from '../lib/api'
import type { Contact, CsvPreview, PhoneNumber } from '../lib/types'
import { composeE164, isE164, useAccountDialCode } from '../lib/phone'
import { leadSearchText, leadSummary } from '../lib/leadDetails'
import { CustomFieldsEditor } from '../components/CustomFieldsEditor'
import {
  CONTACT_TARGETS,
  LEAD_DETAIL_TARGETS,
  downloadSampleSheet,
  guessMapping,
  parseRows,
} from '../lib/contactImport'
import { Tooltip } from '../components/ui/Tooltip'

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-muted/20 text-text-muted border-muted/30',
  qualified: 'bg-cyan/20 text-cyan border-cyan/30',
  site_visit: 'bg-primary/20 text-primary border-primary/30',
  customer: 'bg-amber/20 text-amber border-amber/30',
}

const PLACEHOLDER_VALUES = new Set(['', '-', 'unknown', 'na', 'n/a', 'not applicable', 'not provided', 'not provided yet', 'pending'])
const CONTACTS_TABLE_WIDTHS_KEY = 'contacts-table-column-widths-v2'

function needsContactReview(contact: Contact) {
  const name = contact.name.trim().toLowerCase()
  const phone = contact.phone.trim().toLowerCase()
  const email = contact.email.trim().toLowerCase()
  return PLACEHOLDER_VALUES.has(name) || (PLACEHOLDER_VALUES.has(phone) && PLACEHOLDER_VALUES.has(email))
}

export function Contacts() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [tableLayoutVersion, setTableLayoutVersion] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', tags: '' })
  const [addCustomFields, setAddCustomFields] = useState<Record<string, string>>({})
  // Remount the editor after a save so its rows reset.
  const [addFieldsKey, setAddFieldsKey] = useState(0)
  const accountDialCode = useAccountDialCode()
  const [addDialCode, setAddDialCode] = useState(accountDialCode)
  const [formError, setFormError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Column-mapping import flow: pick a file -> preview headers/sample rows
  // -> map each column to a target field -> confirm.
  const [importCsv, setImportCsv] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<CsvPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const [importRows, setImportRows] = useState<string[][]>([])
  const [autoMapped, setAutoMapped] = useState<Set<string>>(new Set())
  const [importError, setImportError] = useState('')
  const [importSheetNote, setImportSheetNote] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skippedMissingPhone: number; skippedInvalidPhone: number } | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkUpdate, setShowBulkUpdate] = useState(false)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkUpdateError, setBulkUpdateError] = useState('')
  const [bulkForm, setBulkForm] = useState({ status: '', tags: '' })
  const [loading, setLoading] = useState(true)
  const [callingContact, setCallingContact] = useState<Contact | null>(null)
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [fromNumber, setFromNumber] = useState('')
  const [placingCall, setPlacingCall] = useState(false)
  const [callError, setCallError] = useState('')
  const [showMoreActions, setShowMoreActions] = useState(false)
  const moreActionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMoreActions) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!moreActionsRef.current?.contains(event.target as Node)) setShowMoreActions(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMoreActions(false)
    }
    window.addEventListener('pointerdown', closeOnOutsidePress)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePress)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [showMoreActions])

  // XLSX/XLS reuse the same CSV column-mapping pipeline: convert the first
  // sheet to CSV text client-side so the backend never has to parse
  // spreadsheet formats itself.
  const spreadsheetToCsv = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer()
    const workbook = XLSX.read(buf, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    // Only the first sheet is imported; say so when there are others.
    setImportSheetNote(
      workbook.SheetNames.length > 1
        ? `Only the first sheet, "${workbook.SheetNames[0]}", is imported. This file has ${workbook.SheetNames.length - 1} more; upload them separately.`
        : '',
    )
    return XLSX.utils.sheet_to_csv(sheet)
  }

  // The command menu links here with ?add=1 or ?import=1. Open the matching
  // dialog once, then drop the parameter so a refresh does not reopen it.
  useEffect(() => {
    const add = searchParams.get('add') === '1'
    const imp = searchParams.get('import') === '1'
    if (!add && !imp) return
    if (add) setShowAdd(true)
    if (imp) { setImportError(''); setShowImport(true) }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const reload = () => fetchContacts().then(setContacts).catch(() => setContacts([]))

  useEffect(() => {
    fetchContacts().then(setContacts).catch(() => setContacts([])).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return contacts.filter((contact) => {
      if (reviewOnly && !needsContactReview(contact)) return false
      if (!s) return true
      return (
        contact.name.toLowerCase().includes(s) ||
        contact.phone.includes(s) ||
        contact.email.toLowerCase().includes(s) ||
        contact.company.toLowerCase().includes(s) ||
        leadSearchText(contact.customFields).includes(s)
      )
    })
  }, [contacts, reviewOnly, search])

  const reviewCount = useMemo(() => contacts.filter(needsContactReview).length, [contacts])

  const downloadImportTemplate = () => {
    const csv = 'First Name,Last Name,Phone,Email,Company,Tags\nAarav,Sharma,+919876543210,aarav@example.com,Example Pvt Ltd,"lead,follow-up"\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'vistrow-contacts-import-template.csv'
    link.click()
    URL.revokeObjectURL(url)
    setShowMoreActions(false)
  }

  const resetColumnLayout = () => {
    localStorage.removeItem(CONTACTS_TABLE_WIDTHS_KEY)
    setTableLayoutVersion((version) => version + 1)
    setShowMoreActions(false)
  }

  const closeAdd = () => {
    setShowAdd(false)
    setForm({ name: '', phone: '', email: '', company: '', tags: '' })
    setAddCustomFields({})
    setAddFieldsKey((k) => k + 1)
    setAddDialCode(accountDialCode)
    setFormError('')
  }

  useEffect(() => {
    if (!showAdd) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAdd() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // closeAdd only touches setters and the stable dial code
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd])

  const handleAdd = async () => {
    if (!form.name && !form.phone) return
    const phone = form.phone.trim() ? composeE164(addDialCode, form.phone) : ''
    if (phone && !isE164(phone)) {
      setFormError('Enter a valid phone number.')
      return
    }
    setFormError('')
    try {
      await createContact({ ...form, phone, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), customFields: addCustomFields })
      setForm({ name: '', phone: '', email: '', company: '', tags: '' })
      setAddCustomFields({})
      setAddFieldsKey((k) => k + 1)
      setAddDialCode(accountDialCode)
      setShowAdd(false)
      reload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this contact.')
    }
  }

  const handlePickFile = async (file: File) => {
    setImportError('')
    try {
      const isSpreadsheet = /\.xlsx?$/i.test(file.name)
      if (!isSpreadsheet && !/\.csv$/i.test(file.name)) {
        setImportError('Choose a CSV or Excel file (.csv, .xlsx or .xls).')
        return
      }
      if (!isSpreadsheet) setImportSheetNote('')
      const text = isSpreadsheet ? await spreadsheetToCsv(file) : await file.text()
      const preview = await previewContactsImport(text)
      if (!preview.headers.length) {
        setImportError('That file looks empty. Add a header row and at least one contact.')
        return
      }
      // Auto-match columns by name (and phone/email by what the values look like);
      // the person reviews and can change any of them before importing.
      const guessed = guessMapping(preview.headers, preview.sampleRows)
      const initialMapping: Record<string, string> = {}
      const auto = new Set<string>()
      for (const header of preview.headers) {
        initialMapping[header] = guessed[header].target
        if (guessed[header].auto) auto.add(header)
      }
      setImportCsv(text)
      setImportPreview(preview)
      setImportRows(parseRows(text))
      setImportFileName(file.name)
      setAutoMapped(auto)
      setMapping(initialMapping)
      setCustomLabels({})
      setImportResult(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const cancelImport = () => {
    setImportCsv(null)
    setImportPreview(null)
    setImportRows([])
    setImportFileName('')
    setAutoMapped(new Set())
    setMapping({})
    setCustomLabels({})
    setImportError('')
    setImportSheetNote('')
    setImportResult(null)
    setShowImport(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Back from the mapping screen to the file chooser, keeping the dialog open.
  const chooseAnotherFile = () => {
    setImportCsv(null)
    setImportPreview(null)
    setImportRows([])
    setImportFileName('')
    setAutoMapped(new Set())
    setMapping({})
    setCustomLabels({})
    setImportError('')
  }

  const confirmImport = async () => {
    if (!importCsv) return
    setImporting(true)
    setImportError('')
    try {
      const finalMapping: Record<string, string> = {}
      for (const [header, target] of Object.entries(mapping)) {
        if (target === '__custom__') {
          const label = (customLabels[header] || '').trim()
          if (label) finalMapping[header] = label
        } else if (target) {
          finalMapping[header] = target
        }
      }
      const result = await importContactsMapped(importCsv, finalMapping)
      setImportResult(result)
      reload()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The import failed. Nothing was imported.')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (!showImport) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelImport() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // cancelImport only calls setters and clears the file input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImport])

  // Which column feeds Phone, and how many rows have a value there: the one
  // thing an import cannot do without.
  const phoneHeader = importPreview?.headers.find((h) => mapping[h] === 'phone')
  const phoneIndex = phoneHeader && importPreview ? importPreview.headers.indexOf(phoneHeader) : -1
  const rowsMissingPhone = phoneIndex >= 0 ? importRows.filter((r) => !(r[phoneIndex] || '').trim()).length : 0
  const importableRows = phoneIndex >= 0 ? importRows.length - rowsMissingPhone : 0
  const duplicateTargets = (() => {
    const seen: Record<string, number> = {}
    for (const h of importPreview?.headers ?? []) {
      const t = mapping[h]
      if (t && t !== '__custom__') seen[t] = (seen[t] || 0) + 1
    }
    return Object.entries(seen).filter(([, n]) => n > 1).map(([t]) => t)
  })()
  const targetLabel = (t: string) =>
    [...CONTACT_TARGETS, ...LEAD_DETAIL_TARGETS].find((x) => x.value === t)?.label ?? t

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL contacts? Pending campaign calls for these contacts will be blocked. Call records remain available in All Calls History.')) return
    await deleteAllContacts()
    setSelected(new Set())
    setShowMoreActions(false)
    reload()
  }

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id))
  const toggleAllFiltered = () => {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev)
        filtered.forEach((c) => next.delete(c.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((c) => next.add(c.id))
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} selected contact${selected.size === 1 ? '' : 's'}?`)) return
    setBulkDeleting(true)
    try {
      await Promise.all([...selected].map((id) => deleteContact(id)))
      setSelected(new Set())
      reload()
    } finally {
      setBulkDeleting(false)
    }
  }

  const selectedContacts = contacts.filter((contact) => selected.has(contact.id))

  const downloadSelectedContacts = () => {
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const rows = [
      ['Name', 'Phone', 'Email', 'Company', 'Status', 'Tags', 'Source'],
      ...selectedContacts.map((contact) => [
        contact.name,
        contact.phone,
        contact.email,
        contact.company,
        contact.status,
        contact.tags.join(', '),
        contact.source,
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => escapeCell(String(cell ?? ''))).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `vistrow-selected-contacts-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const applyBulkUpdate = async () => {
    const tagsToAdd = bulkForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    if (!bulkForm.status && tagsToAdd.length === 0) {
      setBulkUpdateError('Choose a status or enter at least one tag.')
      return
    }
    setBulkUpdating(true)
    setBulkUpdateError('')
    try {
      for (let index = 0; index < selectedContacts.length; index += 10) {
        await Promise.all(selectedContacts.slice(index, index + 10).map((contact) => updateContact(contact.id, {
          ...(bulkForm.status ? { status: bulkForm.status } : {}),
          ...(tagsToAdd.length > 0 ? { tags: [...new Set([...contact.tags, ...tagsToAdd])] } : {}),
        })))
      }
      setShowBulkUpdate(false)
      setBulkForm({ status: '', tags: '' })
      setSelected(new Set())
      await reload()
    } catch (error) {
      setBulkUpdateError(error instanceof Error ? error.message : 'Could not update the selected contacts.')
    } finally {
      setBulkUpdating(false)
    }
  }

  const openCall = async (contact: Contact) => {
    setCallError('')
    setCallingContact(contact)
    try {
      const available = (await fetchPhoneNumbers()).filter((number) => number.status === 'active' && number.agentId)
      setPhoneNumbers(available)
      setFromNumber(available[0]?.number || '')
    } catch {
      setPhoneNumbers([])
      setFromNumber('')
      setCallError('Could not load an assigned phone number.')
    }
  }

  const placeCall = async () => {
    if (!callingContact || !fromNumber) return
    setPlacingCall(true)
    setCallError('')
    try {
      const result = await callContactNow(callingContact.id, fromNumber)
      if (!result.ok) {
        setCallError(result.error || 'The call could not be placed.')
        return
      }
      setCallingContact(null)
      await reload()
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'The call could not be placed.')
    } finally {
      setPlacingCall(false)
    }
  }

  const columns: DataTableColumn<Contact>[] = [
    {
      key: 'select',
      header: (
        <Tooltip content="Select all visible contacts"><input
          type="checkbox"
          checked={allFilteredSelected}
          onChange={toggleAllFiltered}
          onClick={(event) => event.stopPropagation()}
          aria-label="Select all visible contacts"
          className="h-4 w-4 accent-primary"
        /></Tooltip>
      ),
      headerLabel: 'selection',
      hideOnCard: true,
      width: 52,
      minWidth: 52,
      maxWidth: 52,
      sticky: 'left',
      render: (c) => (
        <input
          type="checkbox"
          checked={selected.has(c.id)}
          onChange={() => toggleOne(c.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 accent-primary"
        />
      ),
    },
    {
      key: 'name',
      header: 'Contact Name',
      primary: true,
      width: 250,
      minWidth: 120,
      maxWidth: 460,
      sticky: 'left',
      resizable: true,
      sortValue: (c) => c.name,
      render: (c) => (
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {c.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold text-text">{c.name}</span>
            {needsContactReview(c) && <span className="ml-2 rounded bg-amber/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber">Needs review</span>}
            {c.company && <p className="text-[11px] text-text-muted">{c.company}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'info',
      header: 'Contact Info',
      width: 210,
      minWidth: 115,
      maxWidth: 380,
      resizable: true,
      render: (c) => (
        <div className="min-w-0 overflow-hidden text-sm">
          <p className="truncate font-semibold text-text">{c.phone || '-'}</p>
          {c.email && <p className="truncate text-[11px] font-medium text-text-muted">{c.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 115,
      minWidth: 82,
      maxWidth: 180,
      resizable: true,
      sortValue: (c) => c.status,
      render: (c) => (
        <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[c.status] ?? STATUS_STYLES.new}`}>
          {c.status.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      width: 220,
      minWidth: 110,
      maxWidth: 480,
      resizable: true,
      render: (c) => (
        <Tooltip content={c.tags.join(', ')}><div className="flex min-w-0 flex-nowrap gap-1 overflow-hidden">
          {c.tags.length === 0 && <span className="text-sm text-text-muted">-</span>}
          {c.tags.slice(0, 2).map((t) => (
            <span key={t} className="shrink-0 rounded bg-surface-high px-1.5 py-0.5 text-[11px] text-text-muted">
              {t}
            </span>
          ))}
          {c.tags.length > 2 && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">+{c.tags.length - 2} more</span>}
        </div></Tooltip>
      ),
    },
    {
      key: 'lead',
      header: 'Lead details',
      width: 380,
      minWidth: 220,
      maxWidth: 640,
      resizable: true,
      sortValue: (c) => leadSummary(c.customFields).headline,
      render: (c) => {
        const l = leadSummary(c.customFields)
        if (!l.hasAny) return <span className="text-sm text-text-muted">-</span>
        return (
          <div className="min-w-0 space-y-1 py-0.5">
            {l.headline && <p className="truncate text-sm font-semibold text-text">{l.headline}</p>}
            {l.chips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {l.chips.map((chip) => (
                  <Tooltip key={chip.label} content={chip.label}>
                    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted">{chip.value}</span>
                  </Tooltip>
                ))}
              </div>
            )}
            {l.words && (
              <Tooltip content={l.words}>
                <p className="line-clamp-2 text-[12px] italic leading-snug text-text-muted">“{l.words}”</p>
              </Tooltip>
            )}
          </div>
        )
      },
    },
    {
      key: 'source',
      header: 'Lead source',
      width: 150,
      minWidth: 90,
      maxWidth: 260,
      resizable: true,
      sortValue: (c) => leadSummary(c.customFields).source || c.source,
      render: (c) => <span className="block truncate text-sm text-text-muted">{leadSummary(c.customFields).source || c.source || '-'}</span>,
    },
    {
      key: 'lastCalled',
      header: 'Last Called',
      width: 120,
      minWidth: 82,
      maxWidth: 200,
      resizable: true,
      sortValue: (c) => c.lastCalledAt ? Date.parse(c.lastCalledAt) : null,
      render: (c) => <span className="text-sm text-text-muted">{c.lastCalledAt ? formatRelativeTime(c.lastCalledAt) : 'never'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 100,
      minWidth: 100,
      maxWidth: 100,
      sticky: 'right',
      className: 'text-center',
      render: (c) => (
        <div className="flex justify-center gap-1">
          <Tooltip content={c.phone ? 'Call now' : 'No phone number'}><button
            type="button"
            onClick={() => openCall(c)}
            disabled={!c.phone}
            aria-label={`Call ${c.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 text-primary transition-colors hover:bg-primary hover:text-bg disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Icon name="call" className="text-[17px]" />
          </button></Tooltip>
          <button
            onClick={() => window.confirm(`Delete ${c.name}?`) && deleteContact(c.id).then(reload)}
            aria-label={`Delete ${c.name}`}
            className="flex h-8 w-8 items-center justify-center rounded bg-surface-high text-destructive transition-opacity hover:bg-destructive hover:text-bg lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <PageHeader title="Contacts" subtitle="Global contact list - auto-synced from every qualified call" />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <Card padding="sm" className={`relative flex min-h-[66px] flex-wrap items-center gap-3 ${showMoreActions ? 'z-[19]' : 'z-10'}`}>
          {selected.size > 0 ? (
            <>
              <span className="text-sm font-bold">{selected.size} selected</span>
              <button
                onClick={() => setSelected(new Set())}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => { setBulkUpdateError(''); setShowBulkUpdate(true) }}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text hover:border-primary hover:text-primary"
              >
                <Icon name="edit_note" className="text-[16px]" />
                Bulk update
              </button>
              <button
                type="button"
                onClick={downloadSelectedContacts}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text hover:border-primary hover:text-primary"
              >
                <Icon name="download" className="text-[16px]" />
                Export selected
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Icon name="delete" className="text-[15px]" />
                {bulkDeleting ? 'Deleting…' : 'Delete selected'}
              </button>
              <span className="ml-auto hidden text-xs text-text-muted xl:inline">Status and tags can be updated without starting a campaign</span>
            </>
          ) : (
            <>
          <div className="relative min-w-[220px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email, city, business, what they asked for..."
              className="w-full rounded-lg border border-border bg-surface-high py-2 pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePickFile(e.target.files[0])}
          />
          <button
            onClick={() => { setImportError(''); setShowImport(true) }}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary"
          >
            <Icon name="upload" className="text-[18px]" />
            Import contacts
          </button>
          <a
            href={contactsExportUrl}
            download
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary"
          >
            <Icon name="download" className="text-[18px]" />
            Export CSV
          </a>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            <Icon name="add" className="text-[18px]" />
            Add Contact
          </button>
          <div ref={moreActionsRef} className="relative">
            <button
              type="button"
              onClick={() => setShowMoreActions((visible) => !visible)}
              aria-label="More contact actions"
              aria-expanded={showMoreActions}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-surface-high transition-colors hover:border-primary hover:text-primary ${showMoreActions || reviewOnly ? 'border-primary text-primary' : 'border-border text-text-muted'}`}
            >
              <Icon name="more_horiz" className="text-[20px]" />
            </button>
            {showMoreActions && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-[70] w-72 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-2xl">
                <button
                  type="button"
                  onClick={() => { setReviewOnly((active) => !active); setShowMoreActions(false) }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-text hover:bg-surface-high"
                >
                  <Icon name={reviewOnly ? 'check' : 'filter_alt'} className="text-[18px] text-primary" />
                  <span className="min-w-0 flex-1">{reviewOnly ? 'Show all contacts' : 'Needs review only'}</span>
                  {!reviewOnly && <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[11px] font-bold text-amber">{reviewCount}</span>}
                </button>
                <button
                  type="button"
                  onClick={downloadImportTemplate}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-text hover:bg-surface-high"
                >
                  <Icon name="description" className="text-[18px] text-text-muted" />
                  Download import template
                </button>
                <button
                  type="button"
                  onClick={resetColumnLayout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-text hover:bg-surface-high"
                >
                  <Icon name="view_column" className="text-[18px] text-text-muted" />
                  Reset column widths
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/compliance')}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-text hover:bg-surface-high"
                >
                  <Icon name="block" className="text-[18px] text-text-muted" />
                  Manage do-not-call list
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
                >
                  <Icon name="delete" className="text-[17px]" />
                  Delete all contacts
                </button>
              </div>
            )}
          </div>
            </>
          )}
        </Card>

        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Add contact">
            <Card padding="sm" className="flex max-h-[92vh] w-full max-w-2xl flex-col bg-surface shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Add contact</h2>
                  <p className="text-xs text-text-muted">Add one person you want an agent to call. Name or phone is enough to start.</p>
                </div>
                <button onClick={closeAdd} aria-label="Close add contact" className="rounded p-2 text-text-muted hover:bg-surface-high hover:text-text">
                  <Icon name="close" />
                </button>
              </div>
              <div className="-mx-2 flex-1 overflow-y-auto px-2 py-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['name', 'Name', 'text', 'Full name'],
                      ['company', 'Company', 'text', 'Business name'],
                      ['email', 'Email', 'email', 'name@example.com'],
                    ] as const
                  ).map(([key, label, type, placeholder]) => (
                    <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
                      {label}
                      <input
                        autoFocus={key === 'name'}
                        type={type}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        placeholder={placeholder}
                        className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm font-normal text-text outline-none focus:border-primary"
                      />
                    </label>
                  ))}
                  <PhoneNumberField
                    dialCode={addDialCode}
                    number={form.phone}
                    onDialCodeChange={setAddDialCode}
                    onNumberChange={(phone) => { setForm({ ...form, phone }); setFormError('') }}
                    error={formError}
                  />
                  <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted sm:col-span-2">
                    Tags
                    <input
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      placeholder="meta-lead, vistrow-outbound-ready"
                      className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm font-normal text-text outline-none focus:border-primary"
                    />
                    <span className="text-[11px] font-normal">Comma-separated. Routing tags are used when a campaign queue is created.</span>
                  </label>
                </div>
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Lead details (optional)</p>
                    <p className="text-[11px] text-text-muted">
                      Lead source, budget, what they asked for and so on. An agent can use each one on the call as{' '}
                      <code className="rounded bg-surface-high px-1 py-0.5">{'{{custom.field_name}}'}</code>.
                    </p>
                  </div>
                  <CustomFieldsEditor key={addFieldsKey} initial={{}} onChange={setAddCustomFields} />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
                <button onClick={closeAdd} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">Cancel</button>
                <button onClick={handleAdd} disabled={!form.name.trim() && !form.phone.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50">
                  Save contact
                </button>
              </div>
            </Card>
          </div>
        )}

        {showImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Import contacts">
            <Card padding="sm" className="flex max-h-[92vh] w-full max-w-4xl flex-col bg-surface shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Import contacts</h2>
                  <p className="text-xs text-text-muted">
                    {importResult
                      ? 'Import finished.'
                      : importPreview
                        ? 'Check how your columns were matched, fix anything that looks wrong, then import.'
                        : 'Upload a sheet of contacts. We match your columns for you, and you can change any match before importing.'}
                  </p>
                </div>
                <button onClick={cancelImport} aria-label="Close import" className="rounded p-2 text-text-muted hover:bg-surface-high hover:text-text">
                  <Icon name="close" />
                </button>
              </div>

              <div className="-mx-2 flex-1 overflow-y-auto px-2 py-1">
                {importResult ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Icon name="check_circle" className="text-[44px] text-success" />
                    <p className="text-lg font-bold">Imported {importResult.imported} contact{importResult.imported === 1 ? '' : 's'}</p>
                    {importResult.skippedMissingPhone + importResult.skippedInvalidPhone > 0 && (
                      <p className="text-sm text-text-muted">
                        Skipped {importResult.skippedMissingPhone + importResult.skippedInvalidPhone}:{' '}
                        {importResult.skippedMissingPhone} with no phone number, {importResult.skippedInvalidPhone} with an invalid number.
                      </p>
                    )}
                  </div>
                ) : !importPreview ? (
                  <div className="flex flex-col gap-5">
                    <ol className="grid gap-3 text-sm sm:grid-cols-3">
                      {[
                        ['Download the sample sheet', 'It has the columns we recognise, with three example rows.'],
                        ['Fill in your contacts', 'One row per person. Only Phone is required. Delete the example rows.'],
                        ['Upload it here', 'We match the columns for you, and you check them before anything is imported.'],
                      ].map(([title, body], i) => (
                        <li key={title} className="flex gap-3 rounded-xl border border-border bg-surface-high p-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
                          <span>
                            <span className="block font-semibold">{title}</span>
                            <span className="text-xs text-text-muted">{body}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadSampleSheet('xlsx')}
                        className="flex items-center gap-2 rounded-lg border border-border bg-surface-high px-4 py-2 text-sm font-semibold hover:border-primary"
                      >
                        <Icon name="download" className="text-[18px]" /> Sample sheet (Excel)
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadSampleSheet('csv')}
                        className="flex items-center gap-2 rounded-lg border border-border bg-surface-high px-4 py-2 text-sm font-semibold hover:border-primary"
                      >
                        <Icon name="download" className="text-[18px]" /> Sample sheet (CSV)
                      </button>
                    </div>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                        const f = e.dataTransfer.files?.[0]
                        if (f) void handlePickFile(f)
                      }}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors sm:py-10 ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
                    >
                      <Icon name="upload_file" className="text-[36px] text-text-muted" />
                      <p className="text-sm font-semibold">Drop your file here</p>
                      <p className="text-xs text-text-muted">CSV or Excel, up to 5,000 contacts</p>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
                      >
                        Choose file
                      </button>
                    </div>
                    {importError && <p className="text-sm text-destructive">{importError}</p>}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-high px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-semibold">
                        {importFileName} <span className="font-normal text-text-muted">· {importRows.length} row{importRows.length === 1 ? '' : 's'}</span>
                      </span>
                      <span className="text-xs text-text-muted">
                        Matched {autoMapped.size} of {importPreview.headers.length} columns automatically
                      </span>
                    </div>
                    <div className="sm:overflow-x-auto">
                      {/* Phone: each column is its own block (name, example, then the dropdown).
                          From sm up it is a normal three-column table. */}
                      <table className="block w-full border-collapse text-sm sm:table">
                        <thead className="hidden sm:table-header-group">
                          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                            <th className="py-2 pr-3">Your column</th>
                            <th className="py-2 pr-3">Example data</th>
                            <th className="py-2">Imports as</th>
                          </tr>
                        </thead>
                        <tbody className="block sm:table-row-group">
                          {importPreview.headers.map((header, i) => {
                            const target = mapping[header] ?? ''
                            return (
                              <tr key={`${header}-${i}`} className="block border-b border-border/60 py-3 align-top sm:table-row sm:py-0">
                                <td className="block break-all pb-1 font-semibold sm:table-cell sm:py-2 sm:pr-3 sm:pb-2">{header || <span className="text-text-muted">(no name)</span>}</td>
                                <td className="block pb-2 text-text-muted sm:table-cell sm:max-w-[16rem] sm:py-2 sm:pr-3">
                                  <span className="block truncate">{importPreview.sampleRows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(', ') || '-'}</span>
                                </td>
                                <td className="block sm:table-cell sm:py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      value={target}
                                      onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                                      aria-label={`Import ${header} as`}
                                      className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm outline-none focus:border-primary"
                                    >
                                      <option value="">Skip this column</option>
                                      <optgroup label="Contact">
                                        {CONTACT_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                      </optgroup>
                                      <optgroup label="Lead details">
                                        {LEAD_DETAIL_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                      </optgroup>
                                      <optgroup label="Other">
                                        <option value="__custom__">Custom field…</option>
                                      </optgroup>
                                    </select>
                                    {target === '__custom__' && (
                                      <input
                                        value={customLabels[header] || ''}
                                        onChange={(e) => setCustomLabels({ ...customLabels, [header]: e.target.value })}
                                        placeholder="field_name"
                                        aria-label={`Custom field name for ${header}`}
                                        className="w-36 rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm outline-none focus:border-primary"
                                      />
                                    )}
                                    {autoMapped.has(header) && target === (mapping[header] ?? '') && target ? (
                                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">Auto-matched</span>
                                    ) : !target ? (
                                      <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber">Not imported</span>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {importSheetNote && <p className="text-sm text-amber">{importSheetNote}</p>}
                    {!phoneHeader && (
                      <p className="text-sm font-semibold text-destructive">Choose which column is the Phone number. It is required.</p>
                    )}
                    {duplicateTargets.length > 0 && (
                      <p className="text-sm text-amber">
                        More than one column is set to {duplicateTargets.map(targetLabel).join(', ')}. Only the last one is kept.
                      </p>
                    )}
                    {phoneHeader && rowsMissingPhone > 0 && (
                      <p className="text-sm text-amber">{rowsMissingPhone} row{rowsMissingPhone === 1 ? ' has' : 's have'} no phone number and will be skipped.</p>
                    )}
                    {importRows.length > 5000 && (
                      <p className="text-sm font-semibold text-destructive">This file has {importRows.length} rows. Imports are limited to 5,000 contacts at a time, so split the file.</p>
                    )}
                    {importError && <p className="text-sm text-destructive">{importError}</p>}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                {importResult ? (
                  <button onClick={cancelImport} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90">Done</button>
                ) : importPreview ? (
                  <>
                    <button onClick={chooseAnotherFile} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">Choose another file</button>
                    <button
                      onClick={confirmImport}
                      disabled={importing || !phoneHeader || importableRows === 0 || importRows.length > 5000}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
                    >
                      {importing ? 'Importing…' : phoneHeader ? `Import ${importableRows} contact${importableRows === 1 ? '' : 's'}` : 'Import contacts'}
                    </button>
                  </>
                ) : (
                  <button onClick={cancelImport} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">Cancel</button>
                )}
              </div>
            </Card>
          </div>
        )}

        {showBulkUpdate && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Bulk update contacts">
            <Card padding="sm" className="w-full max-w-lg bg-surface shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Update {selected.size} contacts</h2>
                  <p className="mt-1 text-xs text-text-muted">Change their CRM status or add tags used for filtering and campaign segments. This will not start a campaign.</p>
                </div>
                <button type="button" onClick={() => setShowBulkUpdate(false)} aria-label="Close bulk update" className="rounded-md p-2 text-text-muted hover:bg-surface-high hover:text-text">
                  <Icon name="close" />
                </button>
              </div>
              <div className="mt-5 grid gap-4">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
                  Change status
                  <select value={bulkForm.status} onChange={(event) => { setBulkForm({ ...bulkForm, status: event.target.value }); setBulkUpdateError('') }} className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm text-text outline-none focus:border-primary">
                    <option value="">Keep current status</option>
                    <option value="new">New</option>
                    <option value="qualified">Qualified</option>
                    <option value="site_visit">Site visit</option>
                    <option value="customer">Customer</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
                  Add tags
                  <input
                    value={bulkForm.tags}
                    onChange={(event) => { setBulkForm({ ...bulkForm, tags: event.target.value }); setBulkUpdateError('') }}
                    placeholder="e.g. website-lead, follow-up-september"
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
                  />
                  <span className="font-normal">Existing tags are preserved. Separate new tags with commas.</span>
                </label>
              </div>
              {bulkUpdateError && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs font-semibold text-destructive">{bulkUpdateError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setShowBulkUpdate(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">Cancel</button>
                <button type="button" onClick={applyBulkUpdate} disabled={bulkUpdating} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50">{bulkUpdating ? 'Updating…' : 'Apply update'}</button>
              </div>
            </Card>
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" aria-label="Loading contacts" />
        ) : (
          <DataTable
            key={tableLayoutVersion}
            columns={columns}
            rows={filtered}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/dashboard/contacts/${c.id}`)}
            rowAriaLabel={(c) => `Open ${c.name}`}
            columnDividers
            columnWidthStorageKey={CONTACTS_TABLE_WIDTHS_KEY}
            isRowSelected={(c) => selected.has(c.id)}
            emptyMessage="No contacts yet. They appear here automatically when the agent qualifies a caller, or add/import them manually."
            footer={`Showing ${filtered.length} of ${contacts.length} contacts · ${contacts.filter(needsContactReview).length} need review`}
          />
        )}

        {callingContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Confirm real call">
            <Card padding="sm" className="w-full max-w-md bg-surface shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold">Call {callingContact.name} now?</h2><p className="mt-1 text-xs text-text-muted">This will place one real call to {callingContact.phone}. It does not resume the campaign.</p></div>
                <button type="button" onClick={() => setCallingContact(null)} aria-label="Close call confirmation" className="rounded-md p-2 text-text-muted hover:bg-surface-high hover:text-text"><Icon name="close" /></button>
              </div>
              <label className="mt-4 flex flex-col gap-1 text-xs font-semibold text-text-muted">Call from
                <select value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text outline-none focus:border-primary">
                  {phoneNumbers.map((number) => <option key={number.id} value={number.number}>{number.label ? `${number.label} · ` : ''}{number.number}</option>)}
                </select>
              </label>
              {phoneNumbers.length === 0 && <p className="mt-3 rounded-lg bg-amber/10 p-3 text-xs text-amber">No active phone number is assigned to an agent.</p>}
              {callError && <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{callError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setCallingContact(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">Cancel</button>
                <button type="button" onClick={placeCall} disabled={placingCall || !fromNumber} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"><Icon name="call" className="text-[17px]" />{placingCall ? 'Placing call…' : 'Confirm real call'}</button>
              </div>
            </Card>
          </div>
        )}
      </section>
    </DashboardLayout>
  )
}
