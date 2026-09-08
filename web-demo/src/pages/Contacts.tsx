import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from '../lib/api'
import type { Contact, CsvPreview, PhoneNumber } from '../lib/types'
import { composeE164, isE164 } from '../lib/phone'

const MAPPING_TARGETS = [
  { value: '', label: 'Skip this column' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'name', label: 'Full Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'tags', label: 'Tags' },
  { value: '__custom__', label: 'Custom field…' },
] as const

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
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [tableLayoutVersion, setTableLayoutVersion] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', tags: '' })
  const [addDialCode, setAddDialCode] = useState('+91')
  const [formError, setFormError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Column-mapping import flow: pick a file -> preview headers/sample rows
  // -> map each column to a target field -> confirm.
  const [importCsv, setImportCsv] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<CsvPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
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
    return XLSX.utils.sheet_to_csv(sheet)
  }

  const reload = () => fetchContacts().then(setContacts).catch(() => setContacts([]))

  useEffect(() => {
    fetchContacts().then(setContacts).catch(() => setContacts([])).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return contacts.filter((contact) => {
      if (reviewOnly && !needsContactReview(contact)) return false
      if (!s) return true
      return contact.name.toLowerCase().includes(s) || contact.phone.includes(s) || contact.email.toLowerCase().includes(s)
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

  const handleAdd = async () => {
    if (!form.name && !form.phone) return
    const phone = form.phone.trim() ? composeE164(addDialCode, form.phone) : ''
    if (phone && !isE164(phone)) {
      setFormError('Enter a valid phone number.')
      return
    }
    setFormError('')
    try {
      await createContact({ ...form, phone, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) })
      setForm({ name: '', phone: '', email: '', tags: '' })
      setAddDialCode('+91')
      setShowAdd(false)
      reload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this contact.')
    }
  }

  const handlePickFile = async (file: File) => {
    const isSpreadsheet = /\.xlsx?$/i.test(file.name)
    const text = isSpreadsheet ? await spreadsheetToCsv(file) : await file.text()
    const preview = await previewContactsImport(text)
    // Best-effort auto-guess so the operator usually just confirms rather
    // than mapping every column by hand - exact matches on common header
    // spellings only; anything unrecognized defaults to "Skip".
    const guesses: Record<string, string> = {
      name: 'name', 'full name': 'name', fullname: 'name',
      'first name': 'first_name', first: 'first_name', firstname: 'first_name',
      'last name': 'last_name', last: 'last_name', lastname: 'last_name',
      phone: 'phone', 'phone number': 'phone', mobile: 'phone', cell: 'phone', number: 'phone',
      email: 'email', 'email address': 'email',
      company: 'company', organization: 'company', org: 'company',
      tags: 'tags', tag: 'tags',
    }
    const initialMapping: Record<string, string> = {}
    for (const header of preview.headers) {
      initialMapping[header] = guesses[header.trim().toLowerCase()] || ''
    }
    setImportCsv(text)
    setImportPreview(preview)
    setMapping(initialMapping)
    setCustomLabels({})
  }

  const cancelImport = () => {
    setImportCsv(null)
    setImportPreview(null)
    setMapping({})
    setCustomLabels({})
    if (fileRef.current) fileRef.current.value = ''
  }

  const confirmImport = async () => {
    if (!importCsv) return
    setImporting(true)
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
      const skipped = result.skippedMissingPhone + result.skippedInvalidPhone
      alert(`Imported ${result.imported} contacts${skipped ? ` · skipped ${skipped} (${result.skippedMissingPhone} missing phone, ${result.skippedInvalidPhone} invalid phone)` : ''}`)
      cancelImport()
      reload()
    } finally {
      setImporting(false)
    }
  }

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
        <input
          type="checkbox"
          checked={allFilteredSelected}
          onChange={toggleAllFiltered}
          onClick={(event) => event.stopPropagation()}
          aria-label="Select all visible contacts"
          title="Select all visible contacts"
          className="h-4 w-4 accent-primary"
        />
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
      width: 400,
      minWidth: 120,
      maxWidth: 720,
      resizable: true,
      render: (c) => (
        <div className="flex min-w-0 flex-nowrap gap-1 overflow-hidden" title={c.tags.join(', ')}>
          {c.tags.length === 0 && <span className="text-sm text-text-muted">-</span>}
          {c.tags.slice(0, 2).map((t) => (
            <span key={t} className="shrink-0 rounded bg-surface-high px-1.5 py-0.5 text-[11px] text-text-muted">
              {t}
            </span>
          ))}
          {c.tags.length > 2 && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">+{c.tags.length - 2} more</span>}
        </div>
      ),
    },
    { key: 'source', header: 'Source', width: 125, minWidth: 78, maxWidth: 240, resizable: true, sortValue: (c) => c.source, render: (c) => <span className="block truncate text-sm capitalize text-text-muted">{c.source}</span> },
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
          <button
            type="button"
            onClick={() => openCall(c)}
            disabled={!c.phone}
            aria-label={`Call ${c.name}`}
            title={c.phone ? 'Call now' : 'No phone number'}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 text-primary transition-colors hover:bg-primary hover:text-bg disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Icon name="call" className="text-[17px]" />
          </button>
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
        <Card padding="sm" className={`relative flex min-h-[66px] flex-wrap items-center gap-3 ${showMoreActions ? 'z-50' : 'z-20'}`}>
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
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Icon name="delete" className="text-[15px]" />
                {bulkDeleting ? 'Deleting…' : 'Delete selected'}
              </button>
              <span className="ml-auto text-xs text-text-muted">Select rows below to update this group</span>
            </>
          ) : (
            <>
          <div className="relative min-w-[220px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or email..."
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
            onClick={() => fileRef.current?.click()}
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
          <Card variant="flat" padding="sm" className="grid grid-cols-1 gap-3 !border-primary/40 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['name', 'Name'],
                ['email', 'Email'],
                ['tags', 'Tags (comma separated)'],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={label}
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            ))}
            <PhoneNumberField
              label=""
              dialCode={addDialCode}
              number={form.phone}
              onDialCodeChange={setAddDialCode}
              onNumberChange={(phone) => { setForm({ ...form, phone }); setFormError('') }}
              error={formError}
            />
            <button onClick={handleAdd} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90">
              Save contact
            </button>
          </Card>
        )}

        {importPreview && (
          <Card variant="flat" padding="sm" className="flex flex-col gap-3 !border-primary/40">
            <div>
              <p className="text-sm font-bold">Map your columns</p>
              <p className="text-xs text-text-muted">
                Tell us what each column in your file means - anything not mapped to a field below is saved as a
                custom field, so a campaign call can reference it (e.g. an "appointment_date" column becomes{' '}
                <code className="rounded bg-surface-high px-1 py-0.5">{'{{custom.appointment_date}}'}</code>).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-3">Your column</th>
                    <th className="py-2 pr-3">Sample data</th>
                    <th className="py-2">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.headers.map((header, i) => (
                    <tr key={header} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-semibold">{header}</td>
                      <td className="py-2 pr-3 text-text-muted">
                        {importPreview.sampleRows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(', ') || '-'}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={mapping[header] ?? ''}
                            onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                            className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm outline-none focus:border-primary"
                          >
                            {MAPPING_TARGETS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          {mapping[header] === '__custom__' && (
                            <input
                              value={customLabels[header] || ''}
                              onChange={(e) => setCustomLabels({ ...customLabels, [header]: e.target.value })}
                              placeholder="field_name"
                              className="w-36 rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm outline-none focus:border-primary"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmImport}
                disabled={importing}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import contacts'}
              </button>
              <button
                onClick={cancelImport}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </Card>
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
