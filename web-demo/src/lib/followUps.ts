// Shared by the Follow-ups page and the call page.

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })

/** "Today, 11:00 am", "Tomorrow, 9:30 am", "24 Oct, 6:00 pm". */
export function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : dayFmt.format(d)
  return `${day}, ${timeFmt.format(d)}`
}
