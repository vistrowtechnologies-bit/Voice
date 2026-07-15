import type { ReactNode } from 'react'
import { Card } from './Card'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Extra classes on both the <th> and each row's <td> for this column. */
  className?: string
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
}

// Responsive table: a real <table> at md: and above, the same rows as
// stacked info-cards below md: — replaces the raw <table> + overflow-x-auto
// pattern (CallsHistory.tsx, Contacts.tsx), which just scrolled sideways on
// narrow screens instead of actually adapting.
export function DataTable<T>({ columns, rows, rowKey, emptyMessage, footer }: DataTableProps<T>) {
  const primaryCol = columns.find((c) => c.primary) ?? columns[0]
  const cardCols = columns.filter((c) => c !== primaryCol && !c.hideOnCard)

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
                  <tr key={rowKey(row)} className="group hover:bg-surface-high/20">
                    {columns.map((col) => (
                      <td key={col.key} className={`py-3 px-3 first:pl-5 ${col.className ?? ''}`}>
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
