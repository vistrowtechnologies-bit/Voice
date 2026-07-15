import { useEffect, useMemo, useRef, useState } from 'react'
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
  importContactsCsv,
} from '../lib/api'
import type { Contact } from '../lib/types'

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

  const handleImport = async (file: File) => {
    const text = await file.text()
    const result = await importContactsCsv(text)
    alert(`Imported ${result.imported} contacts`)
    reload()
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
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {c.name.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-sm font-semibold">{c.name}</span>
        </div>
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
            onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
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
