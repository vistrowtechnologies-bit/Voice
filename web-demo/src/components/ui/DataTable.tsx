import type { ReactNode } from 'react'
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
}: DataTableProps<T>) {
  const primaryCol = columns.find((c) => c.primary) ?? columns[0]
  const cardCols = columns.filter((c) => c !== primaryCol && !c.hideOnCard)

  if (loading) {
    const placeholders = Array.from({ length: skeletonRows }, (_, i) => i)
    return (
      <Card variant="default" padding="none">
        <div className="animate-pulse" aria-hidden="true">
          {/* Desktop/tablet: same table, same columns, placeholder cells */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-high/30 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                  {columns.map((col) => (
                    <th key={col.key} className={`py-3 px-3 first:pl-5 ${col.className ?? ''}`}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {placeholders.map((r) => (
                  <tr key={r}>
                    {columns.map((col, c) => (
                      <td key={col.key} className={`py-3 px-3 first:pl-5 ${col.className ?? ''}`}>
                        <SkeletonBar index={r + c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: same stacked-card shape */}
          <div className="flex flex-col divide-y divide-border md:hidden">
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
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-high/30 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                  {columns.map((col) => (
                    <th key={col.key} className={`py-3 px-3 first:pl-5 ${col.className ?? ''}`}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={rowKey(row)} className={hoverRows ? 'group hover:bg-surface-high/20' : 'group'}>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`py-3 px-3 first:pl-5 ${col.className ?? ''} ${col.cellClassName ?? ''}`}
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
          <div className="flex flex-col divide-y divide-border md:hidden">
            {rows.map((row) => (
              <div key={rowKey(row)} className="flex flex-col gap-2 px-4 py-3">
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
