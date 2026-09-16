import { useEffect, useRef } from 'react'

const VAR_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g

/** Builds the contentEditable DOM for a value string: plain text runs stay
 * text nodes, and every {{variable}} becomes a small atomic, non-editable
 * chip - so it reads like a token instead of seven characters of syntax,
 * the way Sarvam's own agent builder renders variables. */
function renderInto(el: HTMLDivElement, value: string) {
  el.innerHTML = ''
  let lastIndex = 0
  for (const match of value.matchAll(VAR_PATTERN)) {
    const [full, name] = match
    const index = match.index ?? 0
    if (index > lastIndex) {
      el.appendChild(document.createTextNode(value.slice(lastIndex, index)))
    }
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.varChip = name
    chip.className =
      'mx-px inline-flex select-none items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 align-baseline text-[0.85em] font-medium text-primary'
    const brace = document.createElement('span')
    brace.className = 'text-primary/50'
    brace.textContent = '{}'
    chip.appendChild(brace)
    chip.appendChild(document.createTextNode(name))
    el.appendChild(chip)
    lastIndex = index + full.length
  }
  if (lastIndex < value.length) {
    el.appendChild(document.createTextNode(value.slice(lastIndex)))
  }
  // Deliberately left with zero children when value is "" - the :empty
  // CSS placeholder below depends on that, and inputCls's own padding/
  // line-height already gives this row a fixed height with no content.
}

/** The inverse of renderInto: walks the DOM back into the plain {{var}}
 * string the rest of the app (and the backend) actually stores. */
function serialize(el: HTMLDivElement): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
    } else if (node instanceof HTMLElement && node.dataset.varChip !== undefined) {
      out += `{{${node.dataset.varChip}}}`
    } else if (node instanceof HTMLBRElement) {
      // from the empty-div fallback above - contributes nothing.
    } else {
      out += node.textContent ?? ''
    }
  }
  return out
}

/** A single-line text input that renders {{variable}} tokens as small
 * pills instead of raw syntax, while still storing/emitting the exact same
 * plain string a regular <input> would - every existing caller (Save,
 * validation, the backend) keeps working against `value`/`onChange`
 * unchanged. Native <input> can't render inline markup at all, so this is
 * a contentEditable div dressed to match inputCls. */
export function VariableInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // What we last told the parent, so the sync effect below can tell "the
  // value prop changed because WE typed" (skip - would reset the caret to
  // the start) apart from "it changed for some other reason, e.g. switching
  // to a different agent" (do re-render from the new string).
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (!ref.current || value === lastEmitted.current) return
    renderInto(ref.current, value)
    lastEmitted.current = value
  }, [value])

  // Initial paint.
  useEffect(() => {
    if (ref.current) renderInto(ref.current, value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleInput() {
    if (!ref.current) return
    const next = serialize(ref.current)
    lastEmitted.current = next
    onChange(next)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Single-line - Enter must not insert a line break the way it would in
    // a normal contentEditable div.
    if (e.key === 'Enter') e.preventDefault()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain').replace(/\r?\n/g, ' ')
    document.execCommand('insertText', false, text)
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      data-placeholder={placeholder}
      className={`${className} whitespace-pre overflow-x-auto empty:before:text-text-muted empty:before:content-[attr(data-placeholder)] [&:not(:empty)]:before:content-none`}
    />
  )
}
