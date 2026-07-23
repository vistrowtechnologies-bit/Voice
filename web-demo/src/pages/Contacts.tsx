import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import {
  contactsExportUrl,
  createContact,
  deleteAllContacts,
  deleteContact,
  fetchContacts,
  formatRelativeTime,
  importContactsMapped,
  previewContactsImport,
} from '../lib/api'
import type { Contact, CsvPreview } from '../lib/types'

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

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', tags: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  // Column-mapping import flow: pick a file -> preview headers/sample rows
  // -> map each column to a target field -> confirm.
  const [importCsv, setImportCsv] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<CsvPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)

  const reload = () => fetchContacts().then(setContacts).catch(() => setContacts([]))

  useEffect(() => {
    reload()
  }, [])

  const filtered = useMemo(() => {
    if (!search) return contacts
    const s = search.toLowerCase()
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(s) || c.phone.includes(s) || c.email.toLowerCase().includes(s),
    )
  }, [contacts, search])

  const handleAdd = async () => {
    if (!form.name && !form.phone) return
    await createContact({ ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) })
    setForm({ name: '', phone: '', email: '', tags: '' })
    setShowAdd(false)
    reload()
  }

  const handlePickFile = async (file: File) => {
    const text = await file.text()
    const preview = await previewContactsImport(text)
    // Best-effort auto-guess so the operator usually just confirms rather
    // than mapping every column by hand — exact matches on common header
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
      alert(`Imported ${result.imported} contacts`)
      cancelImport()
      reload()
    } finally {
      setImporting(false)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL contacts? Contacts captured from calls will re-sync on next load.')) return
    await deleteAllContacts()
    reload()
  }

  const columns: DataTableColumn<Contact>[] = [
    {
      key: 'name',
      header: 'Contact Name',
      primary: true,
      render: (c) => (
        <Link to={`/dashboard/contacts/${c.id}`} className="flex items-center gap-2 hover:underline">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {c.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="text-sm font-semibold">{c.name}</span>
            {c.company && <p className="text-[11px] text-text-muted">{c.company}</p>}
          </div>
        </Link>
      ),
    },
    {
      key: 'info',
      header: 'Contact Info',
      render: (c) => (
        <div className="text-sm text-text-muted">
          <p>{c.phone || '—'}</p>
          {c.email && <p className="text-[11px]">{c.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[c.status] ?? STATUS_STYLES.new}`}>
          {c.status.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.tags.length === 0 && <span className="text-sm text-text-muted">—</span>}
          {c.tags.map((t) => (
            <span key={t} className="rounded bg-surface-high px-1.5 py-0.5 text-[11px] text-text-muted">
              {t}
            </span>
          ))}
        </div>
      ),
    },
    { key: 'source', header: 'Source', render: (c) => <span className="text-sm capitalize text-text-muted">{c.source}</span> },
    {
      key: 'lastCalled',
      header: 'Last Called',
      render: (c) => <span className="text-sm text-text-muted">{c.lastCalledAt ? formatRelativeTime(c.lastCalledAt) : 'never'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-center',
      render: (c) => (
        <div className="flex justify-center opacity-60 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => deleteContact(c.id).then(reload)}
            aria-label={`Delete ${c.name}`}
            className="flex h-8 w-8 items-center justify-center rounded bg-surface-high text-destructive hover:bg-destructive hover:text-bg"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <PageHeader title="Contacts" subtitle="Global contact list — auto-synced from every qualified call" />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <Card padding="sm" className="flex flex-wrap items-center gap-3">
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
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePickFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary"
          >
            <Icon name="upload" className="text-[18px]" />
            Import CSV
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
            onClick={handleDeleteAll}
            className="flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10"
          >
            <Icon name="delete" className="text-[18px]" />
            Delete All
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            <Icon name="add" className="text-[18px]" />
            Add Contact
          </button>
        </Card>

        {showAdd && (
          <Card variant="flat" padding="sm" className="grid grid-cols-1 gap-3 !border-primary/40 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['name', 'Name'],
                ['phone', 'Phone'],
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
                Tell us what each column in your file means — anything not mapped to a field below is saved as a
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
                        {importPreview.sampleRows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(', ') || '—'}
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

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(c) => c.id}
          emptyMessage="No contacts yet. They appear here automatically when the agent qualifies a caller, or add/import them manually."
          footer={`Showing ${filtered.length} of ${contacts.length} contacts`}
        />
      </section>
    </DashboardLayout>
  )
}
