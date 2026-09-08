import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import { Card } from './Card'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Extra classes on both the <th> and each row's <td> for this column. */
  className?: string
  /** Extra classes on loaded-data cells only. Useful when the rendered
   * control needs to own the full clickable area of the cell. */
  cellClassName?: string
  /** Rendered as the mobile card's title row instead of a label/value pair. Exactly one column should set this. */
  primary?: boolean
  /** Omit this column from the mobile stacked-card view (e.g. a column that duplicates info already shown, or an actions column better placed inline on the card). */
  hideOnCard?: boolean
  /** Desktop width in pixels. Supplying widths for every column gives the
   * table a stable, Ads-Manager-style grid instead of content-driven jumps. */
  width?: number
  minWidth?: number
  maxWidth?: number
  /** Keep important identity/action columns visible while the middle grid
   * scrolls horizontally. Sticky columns need an explicit width. */
  sticky?: 'left' | 'right'
  /** Show a drag handle on the desktop header. */
  resizable?: boolean
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  emptyMessage: ReactNode
  footer?: ReactNode
  /** Render placeholder rows instead of `rows`/`emptyMessage` while the first
   * fetch is in flight. Reuses the real column definitions, so the header and
   * column widths are identical to the loaded table and nothing shifts when
   * the data lands - a centered spinner in a fixed-height box could not do
   * that. Defaults to false, so existing call sites are unaffected. */
  loading?: boolean
  skeletonRows?: number
  /** Disable row background changes when a table uses its own interactive
   * controls and the hover fill would visually compete with them. */
  hoverRows?: boolean
  /** Makes the complete desktop row/mobile card open its detail view. Native
   * controls inside the row remain independent and never trigger navigation. */
  onRowClick?: (row: T) => void
  rowAriaLabel?: (row: T) => string
  /** Draw separators between desktop columns. */
  columnDividers?: boolean
  /** Persists operator-adjusted desktop widths in localStorage. */
  columnWidthStorageKey?: string
}

/** One shimmering placeholder bar. Widths vary per column so a loading table
 * reads as text of differing lengths rather than a uniform grid. */
function SkeletonBar({ index }: { index: number }) {
  const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3']
  return <span className={`block h-3 rounded bg-surface-high ${widths[index % widths.length]}`} />
}

// Responsive table: a real <table> at md: and above, the same rows as
// stacked info-cards below md: - replaces the raw <table> + overflow-x-auto
// pattern (CallsHistory.tsx, Contacts.tsx), which just scrolled sideways on
// narrow screens instead of actually adapting.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  footer,
  loading = false,
  skeletonRows = 6,
  hoverRows = true,
  onRowClick,
  rowAriaLabel,
  columnDividers = false,
  columnWidthStorageKey,
}: DataTableProps<T>) {
  const primaryCol = columns.find((c) => c.primary) ?? columns[0]
  const cardCols = columns.filter((c) => c !== primaryCol && !c.hideOnCard)
  const [savedWidths, setSavedWidths] = useState<Record<string, number>>(() => {
    if (!columnWidthStorageKey || typeof window === 'undefined') return {}
    try {
      return JSON.parse(window.localStorage.getItem(columnWidthStorageKey) || '{}') as Record<string, number>
    } catch {
      return {}
    }
  })

  useEffect(() => {
    if (!columnWidthStorageKey || typeof window === 'undefined') return
    window.localStorage.setItem(columnWidthStorageKey, JSON.stringify(savedWidths))
  }, [columnWidthStorageKey, savedWidths])

  const widths = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.key, savedWidths[column.key] ?? column.width])),
    [columns, savedWidths],
  ) as Record<string, number | undefined>
  const totalWidth = columns.reduce((sum, column) => sum + (widths[column.key] ?? column.minWidth ?? 140), 0)

  const stickyOffsets = useMemo(() => {
    const left: Record<string, number> = {}
    const right: Record<string, number> = {}
    let leftOffset = 0
    for (const column of columns) {
      if (column.sticky !== 'left') continue
      left[column.key] = leftOffset
      leftOffset += widths[column.key] ?? column.minWidth ?? 0
    }
    let rightOffset = 0
    for (const column of [...columns].reverse()) {
      if (column.sticky !== 'right') continue
      right[column.key] = rightOffset
      rightOffset += widths[column.key] ?? column.minWidth ?? 0
    }
    return { left, right }
  }, [columns, widths])

  const lastLeftSticky = [...columns].reverse().find((column) => column.sticky === 'left')?.key
  const firstRightSticky = columns.find((column) => column.sticky === 'right')?.key
  const columnStyle = (column: DataTableColumn<T>): CSSProperties => ({
    width: widths[column.key],
    minWidth: column.minWidth ?? widths[column.key],
    maxWidth: column.maxWidth,
    left: column.sticky === 'left' ? stickyOffsets.left[column.key] : undefined,
    right: column.sticky === 'right' ? stickyOffsets.right[column.key] : undefined,
  })
  const stickyShadow = (column: DataTableColumn<T>) =>
    column.key === lastLeftSticky
      ? 'shadow-[7px_0_9px_-9px_rgba(20,17,35,0.65)]'
      : column.key === firstRightSticky
        ? 'shadow-[-7px_0_9px_-9px_rgba(20,17,35,0.65)]'
        : ''
  const startResize = (event: PointerEvent<HTMLSpanElement>, column: DataTableColumn<T>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = widths[column.key] ?? column.width ?? column.minWidth ?? 140
    const min = column.minWidth ?? 72
    const max = column.maxWidth ?? 640
    const move = (moveEvent: globalThis.PointerEvent) => {
      const next = Math.max(min, Math.min(max, startWidth + moveEvent.clientX - startX))
      setSavedWidths((current) => ({ ...current, [column.key]: Math.round(next) }))
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      document.body.style.removeProperty('user-select')
      document.body.style.removeProperty('cursor')
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }
  const isInteractive = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest('a, button, input, select, textarea, [role="button"]'))
  const activateRow = (event: MouseEvent<HTMLElement>, row: T) => {
    if (!onRowClick || isInteractive(event.target)) return
    onRowClick(row)
  }
  const activateRowFromKeyboard = (event: KeyboardEvent<HTMLElement>, row: T) => {
    if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onRowClick(row)
  }

  if (loading) {
    const placeholders = Array.from({ length: skeletonRows }, (_, i) => i)
    return (
      <Card variant="default" padding="none">
        <div className="animate-pulse" aria-hidden="true">
          {/* Desktop/tablet: same table, same columns, placeholder cells */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full table-fixed text-left" style={{ minWidth: totalWidth }}>
              <thead>
                <tr className="bg-surface-high/30 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                  {columns.map((col) => (
                    <th key={col.key} style={columnStyle(col)} className={`relative py-3 px-3 first:pl-5 ${columnDividers ? 'border-r border-border/70 last:border-r-0' : ''} ${col.sticky ? `sticky z-30 bg-surface-high ${stickyShadow(col)}` : ''} ${col.className ?? ''}`}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {placeholders.map((r) => (
                  <tr key={r}>
                    {columns.map((col, c) => (
                      <td key={col.key} style={columnStyle(col)} className={`py-3 px-3 first:pl-5 ${columnDividers ? 'border-r border-border/70 last:border-r-0' : ''} ${col.sticky ? `sticky z-10 bg-surface ${stickyShadow(col)}` : ''} ${col.className ?? ''}`}>
                        <SkeletonBar index={r + c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: same stacked-card shape */}
          <div className="flex flex-col divide-y divide-border lg:hidden">
            {placeholders.map((r) => (
              <div key={r} className="flex flex-col gap-2 px-4 py-3">
                <SkeletonBar index={r} />
                {cardCols.map((col, c) => (
                  <div key={col.key} className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                      {col.header}
                    </span>
                    <span className="min-w-0 flex-1 pl-6">
                      <SkeletonBar index={r + c + 1} />
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only" aria-live="polite">
          Loading
        </span>
      </Card>
    )
  }

  return (
    <Card variant="default" padding="none">
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-text-muted">{emptyMessage}</div>
      ) : (
        <>
          {/* Desktop/tablet: real table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full table-fixed text-left" style={{ minWidth: totalWidth }}>
              <thead>
                <tr className="bg-surface-high/30 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      style={columnStyle(col)}
                      className={`relative py-3 px-3 first:pl-5 ${columnDividers ? 'border-r border-border/70 last:border-r-0' : ''} ${col.sticky ? `sticky z-30 bg-surface-high ${stickyShadow(col)}` : ''} ${col.className ?? ''}`}
                    >
                      {col.header}
                      {col.resizable && (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${col.header || 'column'}`}
                          onPointerDown={(event) => startResize(event, col)}
                          title={`Drag to resize ${col.header.toLowerCase()}`}
                          className="absolute inset-y-0 -right-1.5 z-40 w-3 cursor-col-resize touch-none bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:content-[''] hover:after:w-0.5 hover:after:bg-primary"
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={(event) => activateRow(event, row)}
                    onKeyDown={(event) => activateRowFromKeyboard(event, row)}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={rowAriaLabel?.(row)}
                    className={`${hoverRows ? 'group hover:bg-surface-high' : 'group'} ${onRowClick ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary' : ''}`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        style={columnStyle(col)}
                        className={`py-3 px-3 first:pl-5 ${columnDividers ? 'border-r border-border/70 last:border-r-0' : ''} ${col.resizable ? 'overflow-hidden' : ''} ${col.sticky ? `sticky z-10 bg-surface group-hover:bg-surface-high ${stickyShadow(col)}` : ''} ${col.className ?? ''} ${col.cellClassName ?? ''}`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards, one per row */}
          <div className="flex flex-col divide-y divide-border lg:hidden">
            {rows.map((row) => (
              <div
                key={rowKey(row)}
                onClick={(event) => activateRow(event, row)}
                onKeyDown={(event) => activateRowFromKeyboard(event, row)}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'link' : undefined}
                aria-label={rowAriaLabel?.(row)}
                className={`flex flex-col gap-2 px-4 py-3 ${onRowClick ? 'cursor-pointer hover:bg-surface-high/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary' : ''}`}
              >
                <div className="font-semibold">{primaryCol.render(row)}</div>
                {cardCols.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                      {col.header}
                    </span>
                    <span className="min-w-0 text-right">{col.render(row)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      {footer && <div className="border-t border-border px-5 py-3 text-xs text-text-muted">{footer}</div>}
    </Card>
  )
}
