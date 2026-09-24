import { useState } from 'react'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from './support'

/** Pick, drop or paste files. Pasting is how most people attach a screenshot:
 * take it (⌘⇧4 / Win+Shift+S), then ⌘V / Ctrl+V into the message. */
export function useAttachments() {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const add = (incoming: File[]) => {
    if (!incoming.length) return
    const tooBig = incoming.filter((f) => f.size > MAX_ATTACHMENT_BYTES)
    const ok = incoming.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)
    setFiles((prev) => {
      if (prev.length + ok.length > MAX_ATTACHMENTS) setError(`Up to ${MAX_ATTACHMENTS} files per message.`)
      else setError(tooBig.length ? `${tooBig.map((f) => f.name || 'Pasted image').join(', ')}: over 5 MB.` : '')
      return [...prev, ...ok].slice(0, MAX_ATTACHMENTS)
    })
  }
  const remove = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i))
  const clear = () => {
    setFiles([])
    setError('')
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files)
    if (!pasted.length) return
    e.preventDefault()
    // Clipboard images all arrive named "image.png"; give each its own name.
    add(pasted.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${Date.now()}-${i}.png`, { type: f.type }))))
  }
  return { files, error, add, remove, clear, onPaste }
}
