import { useEffect, useRef, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import {
  addKbQa,
  addKbQaBulk,
  addKnowledgeSource,
  createKnowledgeBase,
  deleteKbQa,
  deleteKnowledgeBase,
  deleteKnowledgeSource,
  extractQaFromSource,
  fetchKnowledgeBases,
  fetchEntitlements,
  fetchKnowledgeSource,
  fetchProjectListings,
  importKnowledgeSourceUrls,
  scanKnowledgeSourceUrl,
  setKnowledgeBaseStrict,
  setProjectFeed,
  syncProjectListings,
  updateKbQa,
  updateKnowledgeSource,
} from '../lib/api'
import { extractTextFromFile } from '../lib/fileExtract'
import type { KbQaPair, KnowledgeBase, ProjectListing, QaDraft } from '../lib/types'

// Must match agent/db.py get_kb_content's max_chars - everything past this
// is silently trimmed from the agent's prompt, so the budget bar warns the
// operator before that happens. Q&A pairs are emitted first and always fit.
const PROMPT_BUDGET_CHARS = 8000

// Prices and key numbers get an amber highlight inside answers so a wrong
// digit jumps out during review - ₹-amounts, lakh/crore/cr amounts, and
// percentages.
const PRICE_RE = /(₹\s?[\d,]+(?:\.\d+)?\s*(?:lakh|lakhs|crore|crores|cr|k)?\*?|\b[\d,]+(?:\.\d+)?\s*(?:lakh|lakhs|crore|crores)\*?|\b\d+(?:\.\d+)?\s*%)/gi

function HighlightedAnswer({ text }: { text: string }) {
  const parts = text.split(PRICE_RE)
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber/20 px-1 font-semibold text-amber">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  )
}

function kbCharsUsed(kb: KnowledgeBase): number {
  const qaChars = kb.qa.reduce((sum, q) => sum + q.question.length + q.answer.length + 8, 0)
  const sourceChars = kb.sources.reduce((sum, s) => sum + s.sizeChars, 0)
  return qaChars + sourceChars
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="group flex items-center gap-2"
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          on ? 'bg-success' : 'bg-surface-high border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-text shadow transition-all duration-200 ${
            on ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
      <span className={`text-xs font-semibold ${on ? 'text-text' : 'text-text-muted'}`}>{label}</span>
    </button>
  )
}

export function KnowledgeBasePage() {
  const [entitlements, setEntitlements] = useState<Awaited<ReturnType<typeof fetchEntitlements>> | null>(null)
  const [entitlementError, setEntitlementError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const canCreate = !!entitlements?.features.knowledge && (entitlements.knowledgeBaseLimit === null || kbs.length < entitlements.knowledgeBaseLimit)
  const canSyncCatalog = !!entitlements?.features.live_catalog
  useEffect(() => { fetchEntitlements().then(setEntitlements).catch(() => setEntitlementError(true)) }, [])
  // Optional live catalog synced from the tenant's own site. Kept out of the KB
  // on purpose: KB text goes into every system prompt under an 8k cap, so a
  // growing catalogue would silently truncate mid-call.
  const [listings, setListings] = useState<ProjectListing[]>([])
  const [feedUrl, setFeedUrl] = useState('')
  const [feedBusy, setFeedBusy] = useState(false)
  const [feedMsg, setFeedMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedQa, setExpandedQa] = useState<Set<number>>(new Set())
  const [newName, setNewName] = useState('')
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [sourceMode, setSourceMode] = useState<'text' | 'url'>('text')
  const [sourceName, setSourceName] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Website URL scan-and-import: scan finds same-domain pages linked from
  // one URL, the operator picks which to pull in, import fetches each one.
  const [scanUrl, setScanUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<{ url: string; title: string }[] | null>(null)
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; failed: { url: string; error: string }[] } | null>(
    null,
  )

  // Auto-extract review state: drafts stay client-side until the operator
  // accepts them - a misread price must never reach a live agent unreviewed.
  const [extractingSource, setExtractingSource] = useState<number | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [review, setReview] = useState<{ kbId: number; sourceName: string; drafts: QaDraft[] } | null>(null)

  // Inline Q&A editing
  const [editingQa, setEditingQa] = useState<number | null>(null)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')
  const [addingQaTo, setAddingQaTo] = useState<number | null>(null)
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')

  // Inline source editing - a source's full text isn't in the list
  // response (only its length), so opening the editor fetches it first.
  const [editingSource, setEditingSource] = useState<number | null>(null)
  const [editSourceName, setEditSourceName] = useState('')
  const [editSourceContent, setEditSourceContent] = useState('')
  const [loadingSource, setLoadingSource] = useState(false)
  const [savingSource, setSavingSource] = useState(false)

  const reload = () => fetchKnowledgeBases().then(setKbs).catch(() => setKbs([]))

  useEffect(() => {
    fetchKnowledgeBases().then(setKbs).catch(() => setKbs([])).finally(() => setLoading(false))
    fetchProjectListings()
      .then((r) => {
        setFeedUrl(r.feedUrl)
        setListings(r.listings)
      })
      .catch(() => setListings([]))
  }, [])

  // Saving the URL also syncs immediately, so a wrong URL surfaces as an
  // error here rather than silently importing nothing until the next
  // 6-hourly run.
  const applyFeedResult = (r: { ok?: boolean; error?: string; count?: number; listings: ProjectListing[] }) => {
    setListings(r.listings)
    setFeedMsg(
      r.ok === false
        ? { ok: false, text: r.error || 'Could not read that feed.' }
        : { ok: true, text: `Synced ${r.count ?? r.listings.length} catalog item${(r.count ?? r.listings.length) === 1 ? '' : 's'}.` },
    )
  }

  const handleSaveFeed = async () => {
    setFeedBusy(true)
    setFeedMsg(null)
    try {
      applyFeedResult(await setProjectFeed(feedUrl.trim()))
    } catch {
      setFeedMsg({ ok: false, text: 'Could not save the feed URL.' })
    } finally {
      setFeedBusy(false)
    }
  }

  const handleSyncNow = async () => {
    setFeedBusy(true)
    setFeedMsg(null)
    try {
      applyFeedResult(await syncProjectListings())
    } catch {
      setFeedMsg({ ok: false, text: 'Sync failed.' })
    } finally {
      setFeedBusy(false)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim() || !canCreate || creating || loading) return
    setCreating(true)
    setCreateError(null)
    try {
      await createKnowledgeBase(newName.trim())
      setNewName('')
      await reload()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the knowledge base.')
    } finally {
      setCreating(false)
    }
  }

  const closeAddSource = () => {
    setAddingTo(null)
    setSourceMode('text')
    setSourceName('')
    setSourceText('')
    setFileError(null)
    setScanUrl('')
    setScanError(null)
    setScanResult(null)
    setSelectedUrls(new Set())
    setImportResult(null)
  }

  const handleAddSource = async () => {
    if (addingTo === null || !sourceText.trim()) return
    await addKnowledgeSource(addingTo, sourceName.trim() || 'Untitled source', sourceText)
    reload()
    closeAddSource()
  }

  const handleScanUrl = async () => {
    if (addingTo === null || !scanUrl.trim()) return
    setScanError(null)
    setScanResult(null)
    setImportResult(null)
    setScanning(true)
    try {
      const { pages } = await scanKnowledgeSourceUrl(addingTo, scanUrl.trim())
      setScanResult(pages)
      setSelectedUrls(new Set(pages.map((p) => p.url)))
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not scan that URL.')
    } finally {
      setScanning(false)
    }
  }

  const toggleSelectedUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const handleImportUrls = async () => {
    if (addingTo === null || selectedUrls.size === 0) return
    setImporting(true)
    setImportResult(null)
    try {
      const result = await importKnowledgeSourceUrls(addingTo, Array.from(selectedUrls))
      setImportResult(result)
      reload()
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Import failed - try again.')
    } finally {
      setImporting(false)
    }
  }

  const handleFile = async (file: File) => {
    setFileError(null)
    setExtracting(true)
    try {
      const text = await extractTextFromFile(file)
      setSourceText(text)
      if (!sourceName) setSourceName(file.name.replace(/\.[^.]+$/, ''))
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setExtracting(false)
    }
  }

  const handleStrict = async (kb: KnowledgeBase, strict: boolean) => {
    // Optimistic - the toggle should feel instant.
    setKbs((prev) => prev.map((k) => (k.id === kb.id ? { ...k, strict } : k)))
    try {
      await setKnowledgeBaseStrict(kb.id, strict)
    } catch {
      reload()
    }
  }

  const handleExtract = async (kbId: number, sourceId: number, name: string) => {
    setExtractError(null)
    setExtractingSource(sourceId)
    try {
      const { pairs } = await extractQaFromSource(sourceId)
      setReview({ kbId, sourceName: name, drafts: pairs })
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed - try again.')
    } finally {
      setExtractingSource(null)
    }
  }

  const acceptDrafts = async () => {
    if (!review) return
    const kept = review.drafts.filter((d) => d.question.trim() && d.answer.trim())
    if (kept.length > 0) await addKbQaBulk(review.kbId, kept)
    setReview(null)
    reload()
  }

  const startEditQa = (qa: KbQaPair) => {
    setEditingQa(qa.id)
    setEditQ(qa.question)
    setEditA(qa.answer)
  }

  const saveEditQa = async () => {
    if (editingQa === null || !editQ.trim() || !editA.trim()) return
    await updateKbQa(editingQa, editQ.trim(), editA.trim())
    setEditingQa(null)
    reload()
  }

  const startEditSource = async (sourceId: number, name: string) => {
    setEditingSource(sourceId)
    setLoadingSource(true)
    try {
      const full = await fetchKnowledgeSource(sourceId)
      setEditSourceName(full.name)
      setEditSourceContent(full.content)
    } catch {
      setEditSourceName(name)
      setEditSourceContent('')
    } finally {
      setLoadingSource(false)
    }
  }

  const cancelEditSource = () => {
    setEditingSource(null)
    setEditSourceName('')
    setEditSourceContent('')
  }

  const saveEditSource = async () => {
    if (editingSource === null || !editSourceName.trim()) return
    setSavingSource(true)
    try {
      await updateKnowledgeSource(editingSource, { name: editSourceName.trim(), content: editSourceContent })
      setEditingSource(null)
      reload()
    } finally {
      setSavingSource(false)
    }
  }

  const saveNewQa = async () => {
    if (addingQaTo === null || !newQ.trim() || !newA.trim()) return
    await addKbQa(addingQaTo, newQ.trim(), newA.trim())
    setNewQ('')
    setNewA('')
    setAddingQaTo(null)
    reload()
  }

  return (
    <DashboardLayout>
      <PageHeader title="Knowledge Base" subtitle={`${kbs.length} knowledge ${kbs.length === 1 ? 'base' : 'bases'}`} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-muted">
          <Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-cyan" />
          Upload a brochure or price sheet, hit <span className="font-semibold text-primary">✦ Auto-extract Q&A</span>,
          review the answers, and edit any price inline whenever it changes. With{' '}
          <span className="font-semibold text-success">Strict mode</span> on, the agent quotes these
          approved answers instead of improvising facts. Attach a knowledge base to an agent from the
          Agents page.
        </div>

        {/* Live catalog — separate from the KB on purpose. KB text is
            stuffed into every system prompt under an 8k cap; catalog items reach
            the agent as a short index plus an on-demand lookup instead, so
            the catalog can grow without slowing every call down. */}
        <Card padding="none" className="overflow-hidden">
          <button
            type="button"
            onClick={() => setCatalogOpen((open) => !open)}
            aria-expanded={catalogOpen}
            className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-high/40 ${catalogOpen ? 'border-b border-border' : ''}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Icon name="inventory_2" className="shrink-0 text-[18px] text-text-muted" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Live catalog</h2>
                <p className="text-xs text-text-muted">
                  Optional structured products, services, inventory, menus, plans, or listings. Only agents
                  you explicitly enable can use this data.
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${listings.length ? 'bg-success/15 text-success' : 'bg-surface-high text-text-muted'}`}>
                {listings.length ? `${listings.length} synced` : 'Not configured'}
              </span>
              <Icon name={catalogOpen ? 'expand_less' : 'expand_more'} className="text-[20px] text-text-muted" />
            </span>
          </button>

          {catalogOpen && (
            <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://yoursite.com/catalog.json"
                className="min-w-0 flex-1 basis-[260px] rounded-lg border border-border bg-surface-high px-3 py-2 font-mono text-xs outline-none transition-colors focus:border-primary"
              />
              <button
                onClick={handleSaveFeed}
                disabled={feedBusy || !canSyncCatalog}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
              >
                {feedBusy ? 'Syncing…' : 'Save & sync'}
              </button>
              {!!listings.length && (
                <button
                  onClick={handleSyncNow}
                  disabled={feedBusy || !canSyncCatalog}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary disabled:opacity-40"
                >
                  Sync now
                </button>
              )}
            </div>

            <p className="text-[11px] text-text-muted">
              Point this at a JSON array on your website. Each item needs a stable <code>id</code>,{' '}
              <code>sku</code>, or <code>slug</code> and a <code>name</code> or <code>title</code>. Optional
              fields include category, status, priceLabel, variants, features, description, and URL. It
              re-syncs every 6 hours.
            </p>

            {feedMsg && (
              <p className={`text-xs ${feedMsg.ok ? 'text-success' : 'text-destructive'}`}>{feedMsg.text}</p>
            )}

            {!!listings.length && (
              <div className="divide-y divide-border rounded-lg border border-border">
                {listings.map((l) => (
                  <div key={l.slug} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {l.title}
                        {l.status && l.status !== 'active' && (
                          <span className="ml-2 rounded bg-amber/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber">
                            {l.status}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-text-muted">
                        {[l.developer, l.config, l.location].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-text-muted">
                      {l.priceLabel ||
                        (l.units.length ? `${l.units.length} variant${l.units.length === 1 ? '' : 's'}` : '')}
                    </span>
                  </div>
                ))}
              </div>
            )}
            </div>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New knowledge base name (e.g. Products and FAQs)"
            className="min-w-[240px] flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || !canCreate || creating || loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          >
            <Icon name="add" className="text-[18px]" />
            {creating ? 'Creating…' : 'Create Knowledge Base'}
          </button>
        </div>

        <p className="text-xs text-text-muted" role="status">
          {entitlementError ? 'Unable to check plan limits. Reload before creating a base or syncing a catalog.' : !entitlements ? 'Checking plan limits…' : `${kbs.length} knowledge bases used${entitlements.knowledgeBaseLimit === null ? '' : ` of ${entitlements.knowledgeBaseLimit}`}. Existing knowledge is retained when your plan changes.`}
          {entitlements && !canSyncCatalog && <> Live catalog sync requires Growth or Scale. <a href="/dashboard/billing" className="text-primary underline">Compare plans</a>.</>}
        </p>
        {createError && <p role="alert" className="text-xs text-destructive">{createError}</p>}

        {loading && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Loading knowledge bases">
            {[0, 1].map((item) => <div key={item} className="h-72 animate-pulse rounded-xl border border-border bg-surface" />)}
          </div>
        )}

        {!loading && kbs.length === 0 && (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-text-muted">
            <Icon name="menu_book" className="text-[36px]" />
            <p className="text-sm font-bold">No knowledge bases yet</p>
            <p className="text-xs">Create one above, then add brochures, price sheets, and FAQs as sources.</p>
          </div>
        )}

        {!loading && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {kbs.map((kb) => {
            const used = kbCharsUsed(kb)
            const pct = Math.min(100, Math.round((used / PROMPT_BUDGET_CHARS) * 100))
            const over = used > PROMPT_BUDGET_CHARS
            // Warn on the way up, not only after text has already been
            // dropped. A base sitting at 7.7k/8k is one paste away from
            // losing content silently, and today said nothing at all.
            const nearlyFull = !over && used >= PROMPT_BUDGET_CHARS * 0.9
            return (
              <Card key={kb.id} className="flex flex-col gap-4">
                {/* Header: name · counts · strict toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{kb.name}</p>
                    <p className="text-xs text-text-muted">
                      {kb.sources.length} {kb.sources.length === 1 ? 'file' : 'files'} · {kb.qa.length} Q&A{' '}
                      {kb.qa.length === 1 ? 'pair' : 'pairs'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle on={kb.strict} onChange={(v) => handleStrict(kb, v)} label="Strict mode" />
                    <button
                      onClick={() =>
                        confirm(`Delete "${kb.name}" and all its sources and Q&A?`) &&
                        deleteKnowledgeBase(kb.id).then(reload)
                      }
                      aria-label={`Delete ${kb.name}`}
                      className="text-text-muted transition-colors hover:text-destructive"
                    >
                      <Icon name="delete" className="text-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Prompt budget bar */}
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-high">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: over ? '#ef4444' : 'linear-gradient(90deg, #22d3ee, #a855f7)',
                      }}
                    />
                  </div>
                  <p className={`mt-1.5 text-[11px] ${over ? 'font-semibold text-destructive' : nearlyFull ? 'font-medium text-amber-600 dark:text-amber-500' : 'text-text-muted'}`}>
                    {(used / 1000).toFixed(1)}k / {PROMPT_BUDGET_CHARS / 1000}k characters used
                    {/* Deliberately about what the agent KNOWS, not about
                        speed. Measured on the live prompt: halving it moved
                        time-to-first-word by ~150ms, inside the run-to-run
                        spread. Telling an operator a full knowledge base
                        slows their calls would be untrue, and it would hide
                        the consequence that actually bites — text past the
                        cap never reaches the agent, so it answers as though
                        that paragraph was never written. */}
                    {over
                      ? ' — over the limit. Q&A pairs always reach the agent; source text past 8k does not, so the agent will not know it. Trim the source or move it to another knowledge base.'
                      : nearlyFull
                        ? ' — nearly full. Anything past 8k will not reach the agent.'
                        : ' — only the first 8k reaches the agent on a call.'}
                  </p>
                </div>

                {/* Sources with auto-extract */}
                <div className="flex flex-col gap-2">
                  {kb.sources.map((s) =>
                    editingSource === s.id ? (
                      <div key={s.id} className="flex flex-col gap-2 rounded-lg border border-primary/50 bg-surface-high/40 p-3">
                        <input
                          value={editSourceName}
                          onChange={(e) => setEditSourceName(e.target.value)}
                          placeholder="Source name"
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <textarea
                          value={editSourceContent}
                          onChange={(e) => setEditSourceContent(e.target.value)}
                          disabled={loadingSource}
                          rows={8}
                          placeholder={loadingSource ? 'Loading…' : 'Source text'}
                          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed outline-none focus:border-primary disabled:opacity-50"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-text-muted">{(editSourceContent.length / 1000).toFixed(1)}k chars</span>
                          <div className="flex gap-2">
                            <button
                              onClick={cancelEditSource}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEditSource}
                              disabled={savingSource || loadingSource || !editSourceName.trim()}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {savingSource ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-surface-high/40 px-3 py-2.5"
                      >
                        <Icon
                          name={s.type === 'url' ? 'language' : 'description'}
                          className="text-[17px] text-text-muted"
                        />
                        <button
                          onClick={() => startEditSource(s.id, s.name)}
                          className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                          title="Open and edit this source"
                        >
                          {s.name}
                        </button>
                        {s.type === 'url' && (
                          <span className="hidden rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted sm:block">
                            URL
                          </span>
                        )}
                        <span className="hidden text-[11px] text-text-muted sm:block">
                          {(s.sizeChars / 1000).toFixed(1)}k chars
                        </span>
                        <button
                          onClick={() => startEditSource(s.id, s.name)}
                          aria-label={`Edit ${s.name}`}
                          className="text-text-muted transition-colors hover:text-text"
                        >
                          <Icon name="edit" className="text-[16px]" />
                        </button>
                        <button
                          onClick={() => handleExtract(kb.id, s.id, s.name)}
                          disabled={extractingSource !== null}
                          className="flex items-center gap-1.5 rounded-lg bg-primary/90 px-3 py-1.5 text-xs font-bold text-bg transition-all hover:bg-primary active:scale-[0.97] disabled:opacity-50"
                        >
                          <span className="text-[13px]">✦</span>
                          {extractingSource === s.id ? 'Extracting…' : 'Auto-extract Q&A'}
                        </button>
                        <button
                          onClick={() => deleteKnowledgeSource(s.id).then(reload)}
                          aria-label={`Remove ${s.name}`}
                          className="text-text-muted transition-colors hover:text-destructive"
                        >
                          <Icon name="close" className="text-[16px]" />
                        </button>
                      </div>
                    ),
                  )}
                </div>
                {extractError && review === null && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <Icon name="error" className="text-[15px]" />
                    {extractError}
                  </p>
                )}

                {/* Q&A pairs */}
                {kb.qa.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedQa((current) => {
                      const next = new Set(current)
                      if (next.has(kb.id)) next.delete(kb.id)
                      else next.add(kb.id)
                      return next
                    })}
                    aria-expanded={expandedQa.has(kb.id)}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface-high/30 px-3 py-2 text-sm font-semibold hover:border-primary/50"
                  >
                    <span>{kb.qa.length} approved Q&amp;A {kb.qa.length === 1 ? 'pair' : 'pairs'}</span>
                    <Icon name={expandedQa.has(kb.id) ? 'expand_less' : 'expand_more'} className="text-[18px] text-text-muted" />
                  </button>
                )}
                {expandedQa.has(kb.id) && <div className="flex flex-col gap-2">
                  {kb.qa.map((qa) =>
                    editingQa === qa.id ? (
                      <div key={qa.id} className="flex flex-col gap-2 rounded-lg border border-primary bg-surface-high/40 p-3">
                        <input
                          value={editQ}
                          onChange={(e) => setEditQ(e.target.value)}
                          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                        />
                        <textarea
                          value={editA}
                          onChange={(e) => setEditA(e.target.value)}
                          className="h-20 resize-none rounded-lg border border-border bg-surface-high p-2 text-sm outline-none focus:border-primary"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => confirm('Delete this Q&A pair?') && deleteKbQa(qa.id).then(() => { setEditingQa(null); reload() })}
                            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive transition-colors hover:border-destructive"
                          >
                            <Icon name="delete" className="text-[14px]" />
                            Delete
                          </button>
                          <div className="flex-1" />
                          <button onClick={() => setEditingQa(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary">
                            Cancel
                          </button>
                          <button
                            onClick={saveEditQa}
                            disabled={!editQ.trim() || !editA.trim()}
                            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-bg transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={qa.id}
                        onClick={() => startEditQa(qa)}
                        className="group rounded-lg border border-border bg-surface-high/30 p-3 text-left transition-colors hover:border-primary/60"
                      >
                        <p className="flex items-start gap-2 text-sm font-semibold">
                          <span className="mt-px font-bold text-primary">Q</span>
                          <span className="flex-1">{qa.question}</span>
                          <Icon name="edit" className="text-[15px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                        </p>
                        <p className="mt-1 pl-5 text-sm text-text-muted">
                          <HighlightedAnswer text={qa.answer} />
                        </p>
                      </button>
                    ),
                  )}
                </div>}

                {/* Add Q&A pair */}
                {addingQaTo === kb.id ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-primary/40 p-3">
                    <input
                      value={newQ}
                      onChange={(e) => setNewQ(e.target.value)}
                      placeholder="Question - the way a caller would ask it"
                      className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <textarea
                      value={newA}
                      onChange={(e) => setNewA(e.target.value)}
                      placeholder="Answer - 1-2 short spoken-style sentences with exact prices/numbers"
                      className="h-20 resize-none rounded-lg border border-border bg-surface-high p-2 text-sm outline-none focus:border-primary"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setAddingQaTo(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary">
                        Cancel
                      </button>
                      <button
                        onClick={saveNewQa}
                        disabled={!newQ.trim() || !newA.trim()}
                        className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-bg transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
                      >
                        Add pair
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingQaTo(kb.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-bold text-text-muted transition-colors hover:border-primary hover:text-primary"
                    >
                      <Icon name="add" className="text-[16px]" />
                      Add Q&A pair
                    </button>
                    <button
                      onClick={() => setAddingTo(kb.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-bold text-text-muted transition-colors hover:border-cyan hover:text-cyan"
                    >
                      <Icon name="upload_file" className="text-[16px]" />
                      Add source
                    </button>
                  </div>
                )}

                {/* Add-source form */}
                {addingTo === kb.id && (
                  <div className="flex flex-col gap-3 rounded-lg border border-cyan/40 p-3">
                    <div className="flex gap-1 rounded-lg bg-surface-high p-1">
                      <button
                        onClick={() => setSourceMode('text')}
                        className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-colors ${
                          sourceMode === 'text' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        Text / File
                      </button>
                      <button
                        onClick={() => setSourceMode('url')}
                        className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-colors ${
                          sourceMode === 'url' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        Website URL
                      </button>
                    </div>

                    {sourceMode === 'text' ? (
                      <>
                        <input
                          value={sourceName}
                          onChange={(e) => setSourceName(e.target.value)}
                          placeholder="Source name (e.g. Price sheet - Tower A)"
                          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <textarea
                          value={sourceText}
                          onChange={(e) => setSourceText(e.target.value)}
                          placeholder="Paste the content here, or upload a file…"
                          className="h-28 resize-none rounded-lg border border-border bg-surface-high p-2 text-xs outline-none focus:border-primary"
                        />
                        {fileError && (
                          <p className="flex items-center gap-1.5 text-xs text-destructive">
                            <Icon name="error" className="text-[15px]" />
                            {fileError}
                          </p>
                        )}
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".txt,.md,.csv,.pdf,.docx"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleFile(e.target.files[0])
                            e.target.value = ''
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => fileRef.current?.click()}
                            disabled={extracting}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary disabled:opacity-40"
                          >
                            <Icon name={extracting ? 'progress_activity' : 'upload_file'} className="text-[15px]" />
                            {extracting ? 'Reading file…' : 'Upload .txt / .pdf / .docx'}
                          </button>
                          <div className="flex-1" />
                          <button
                            onClick={closeAddSource}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddSource}
                            disabled={!sourceText.trim()}
                            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-bg transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
                          >
                            Add source
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <input
                            value={scanUrl}
                            onChange={(e) => setScanUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleScanUrl()}
                            placeholder="https://example.com"
                            className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <button
                            onClick={handleScanUrl}
                            disabled={scanning || !scanUrl.trim()}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold transition-colors hover:border-cyan disabled:opacity-40"
                          >
                            <Icon name={scanning ? 'progress_activity' : 'travel_explore'} className="text-[15px]" />
                            {scanning ? 'Scanning…' : 'Scan'}
                          </button>
                        </div>
                        {scanError && (
                          <p className="flex items-center gap-1.5 text-xs text-destructive">
                            <Icon name="error" className="text-[15px]" />
                            {scanError}
                          </p>
                        )}
                        {scanResult && (
                          <>
                            <div className="flex items-center justify-between text-[11px] text-text-muted">
                              <span>
                                {scanResult.length} page{scanResult.length === 1 ? '' : 's'} found ·{' '}
                                {selectedUrls.size} selected
                              </span>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => setSelectedUrls(new Set(scanResult.map((p) => p.url)))}
                                  className="font-bold text-cyan hover:underline"
                                >
                                  Select all
                                </button>
                                <button onClick={() => setSelectedUrls(new Set())} className="font-bold hover:underline">
                                  Clear
                                </button>
                              </div>
                            </div>
                            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface-high/40 p-2">
                              {scanResult.map((p) => (
                                <label
                                  key={p.url}
                                  className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-surface-high"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedUrls.has(p.url)}
                                    onChange={() => toggleSelectedUrl(p.url)}
                                    className="mt-0.5 accent-primary"
                                  />
                                  <span className="min-w-0 flex-1 truncate text-text-muted">{p.url}</span>
                                </label>
                              ))}
                            </div>
                          </>
                        )}
                        {importResult && (
                          <p
                            className={`flex items-center gap-1.5 text-xs ${
                              importResult.failed.length > 0 ? 'text-amber' : 'text-success'
                            }`}
                          >
                            <Icon name="check_circle" className="text-[15px]" />
                            Imported {importResult.added} page{importResult.added === 1 ? '' : 's'}
                            {importResult.failed.length > 0 && ` · ${importResult.failed.length} failed`}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <div className="flex-1" />
                          <button
                            onClick={closeAddSource}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary"
                          >
                            {importResult ? 'Done' : 'Cancel'}
                          </button>
                          {scanResult && (
                            <button
                              onClick={handleImportUrls}
                              disabled={importing || selectedUrls.size === 0}
                              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-bg transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
                            >
                              {importing
                                ? 'Importing…'
                                : `Import ${selectedUrls.size} page${selectedUrls.size === 1 ? '' : 's'}`}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>}
      </section>

      {/* Auto-extract review overlay - drafts are editable and nothing is
          saved until "Add to knowledge base" is pressed. */}
      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <span className="text-primary">✦</span>
                Review extracted Q&A - {review.sourceName}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {review.drafts.length} drafts. Check every <span className="font-semibold text-amber">highlighted price</span> against
                the document - nothing is saved until you accept, and the agent only ever quotes what you approve here.
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              {review.drafts.map((d, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-high/30 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">Q</span>
                    <input
                      value={d.question}
                      onChange={(e) =>
                        setReview((r) =>
                          r ? { ...r, drafts: r.drafts.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) } : r,
                        )
                      }
                      className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => setReview((r) => (r ? { ...r, drafts: r.drafts.filter((_, j) => j !== i) } : r))}
                      aria-label="Discard this pair"
                      className="text-text-muted transition-colors hover:text-destructive"
                    >
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </div>
                  <textarea
                    value={d.answer}
                    onChange={(e) =>
                      setReview((r) =>
                        r ? { ...r, drafts: r.drafts.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) } : r,
                      )
                    }
                    className="h-16 resize-none rounded-lg border border-border bg-surface-high p-2 text-sm outline-none focus:border-primary"
                  />
                  <p className="text-xs text-text-muted">
                    Preview: <HighlightedAnswer text={d.answer} />
                  </p>
                </div>
              ))}
              {review.drafts.length === 0 && (
                <p className="py-8 text-center text-sm text-text-muted">All drafts discarded - nothing to add.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setReview(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary"
              >
                Cancel
              </button>
              <button
                onClick={acceptDrafts}
                disabled={review.drafts.length === 0}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
              >
                Add {review.drafts.length} {review.drafts.length === 1 ? 'pair' : 'pairs'} to knowledge base
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
