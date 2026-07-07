import { useEffect, useRef, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import {
  addKnowledgeSource,
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeSource,
  fetchKnowledgeBases,
} from '../lib/api'
import type { KnowledgeBase } from '../lib/types'

export function KnowledgeBasePage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [newName, setNewName] = useState('')
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [sourceText, setSourceText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = () => fetchKnowledgeBases().then(setKbs).catch(() => setKbs([]))

  useEffect(() => {
    reload()
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createKnowledgeBase(newName.trim())
    setNewName('')
    reload()
  }

  const handleAddSource = async () => {
    if (addingTo === null || !sourceText.trim()) return
    await addKnowledgeSource(addingTo, sourceName.trim() || 'Untitled source', sourceText)
    setSourceName('')
    setSourceText('')
    setAddingTo(null)
    reload()
  }

  const handleFile = async (file: File) => {
    const text = await file.text()
    setSourceText(text)
    if (!sourceName) setSourceName(file.name)
  }

  return (
    <DashboardLayout>
      <PageHeader title="Knowledge Base" subtitle={`${kbs.length} knowledge bases`} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-muted">
          <Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-cyan" />
          Sources attached here (project brochures, price sheets, FAQs) are injected into the agent's
          context, so it answers project-specific questions with real facts instead of declining.
          Attach a knowledge base to an agent from the Agents page.
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New knowledge base name (e.g. Skyline Residences — Pune)"
            className="min-w-[240px] flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="add" className="text-[18px]" />
            Create Knowledge Base
          </button>
        </div>

        {kbs.length === 0 && (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-text-muted">
            <Icon name="menu_book" className="text-[36px]" />
            <p className="text-sm font-bold">No knowledge bases yet</p>
            <p className="text-xs">Create one above, then add brochures, price sheets, and FAQs as sources.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {kbs.map((kb) => (
            <div key={kb.id} className="flex flex-col rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/20 text-cyan">
                    <Icon name="menu_book" className="text-[20px]" />
                  </div>
                  <div>
                    <p className="font-semibold">{kb.name}</p>
                    <p className="text-[11px] text-text-muted">{kb.sources.length} sources</p>
                  </div>
                </div>
                <button
                  onClick={() => confirm(`Delete "${kb.name}" and all its sources?`) && deleteKnowledgeBase(kb.id).then(reload)}
                  aria-label={`Delete ${kb.name}`}
                  className="text-text-muted hover:text-destructive"
                >
                  <Icon name="delete" className="text-[18px]" />
                </button>
              </div>

              <div className="mb-3 flex flex-col divide-y divide-border rounded-lg border border-border">
                {kb.sources.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-text-muted">No sources yet — add one below.</p>
                )}
                {kb.sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                    <Icon name="description" className="text-[16px] text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    <span className="text-[11px] text-text-muted">{(s.sizeChars / 1000).toFixed(1)}k chars</span>
                    <button
                      onClick={() => deleteKnowledgeSource(s.id).then(reload)}
                      aria-label={`Remove ${s.name}`}
                      className="text-text-muted hover:text-destructive"
                    >
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </div>
                ))}
              </div>

              {addingTo === kb.id ? (
                <div className="flex flex-col gap-2 rounded-lg border border-primary/40 p-3">
                  <input
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="Source name (e.g. Price sheet — Tower A)"
                    className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder="Paste the content here, or upload a .txt file…"
                    className="h-28 resize-none rounded-lg border border-border bg-surface-high p-2 text-xs outline-none focus:border-primary"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.csv"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary"
                    >
                      <Icon name="upload_file" className="text-[15px]" />
                      Upload .txt
                    </button>
                    <div className="flex-1" />
                    <button onClick={() => setAddingTo(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold">
                      Cancel
                    </button>
                    <button onClick={handleAddSource} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-bg">
                      Add source
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTo(kb.id)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-bold text-text-muted hover:border-primary hover:text-primary"
                >
                  <Icon name="add" className="text-[16px]" />
                  Add source
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </DashboardLayout>
  )
}
