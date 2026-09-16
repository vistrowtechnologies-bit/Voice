import { useEffect, useRef, useState } from 'react'

const VAR_PATTERN = /\{\{([a-zA-Z0-9_.]+)\}\}/g
// Matches an unclosed "{{partial" ending exactly at the caret - the trigger
// for the suggestion popup. Requires the opening pair not be followed by
// "}}" anywhere before the caret, which is naturally true since this only
// ever looks at text UP TO the caret.
const OPEN_TOKEN_AT_CARET = /\{\{([a-zA-Z0-9_.]*)$/

function makeChip(name: string): HTMLSpanElement {
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
  return chip
}

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
    el.appendChild(makeChip(name))
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

/** The plain text from the start of the editor up to the caret. Used only
 * to detect an unclosed "{{partial" trigger, so a chip earlier in the text
 * rendering as its visible "{}name" glyphs here (rather than "{{name}}")
 * is harmless - only the tail matters. */
function textBeforeCaret(el: HTMLDivElement): string | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const { startContainer, startOffset } = sel.getRangeAt(0)
  if (!el.contains(startContainer)) return null
  const preRange = document.createRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(startContainer, startOffset)
  return preRange.toString()
}

/** Replaces the "{{partial" text immediately before the caret with a real
 * chip for `name`, then places the caret right after it. Only handles the
 * caret sitting inside a single text node - true for ordinary typing,
 * which is the only way this trigger text gets there. */
function insertChipAtCaret(el: HTMLDivElement, openLen: number, name: string): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE || range.startOffset < openLen) return false

  const replaceRange = document.createRange()
  replaceRange.setStart(node, range.startOffset - openLen)
  replaceRange.setEnd(node, range.startOffset)
  replaceRange.deleteContents()

  const chip = makeChip(name)
  replaceRange.insertNode(chip)

  const after = document.createRange()
  after.setStartAfter(chip)
  after.collapse(true)
  sel.removeAllRanges()
  sel.addRange(after)
  el.focus()
  return true
}

/** A single-line text input that renders {{variable}} tokens as small
 * pills instead of raw syntax, while still storing/emitting the exact same
 * plain string a regular <input> would - every existing caller (Save,
 * validation, the backend) keeps working against `value`/`onChange`
 * unchanged. Native <input> can't render inline markup at all, so this is
 * a contentEditable div dressed to match inputCls.
 *
 * Typing "{{" opens a suggestion popup (built-ins plus this agent's own
 * dashboard-defined variables, passed in as `suggestions`) filtered by
 * whatever's typed after it - selecting one finishes the token as a chip,
 * the same trigger Sarvam's own agent builder uses. */
export function VariableInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Variable names offered after typing "{{" - built-ins plus whatever
   * this agent has defined in its Variables panel. */
  suggestions?: string[]
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // What we last told the parent, so the sync effect below can tell "the
  // value prop changed because WE typed" (skip - would reset the caret to
  // the start) apart from "it changed for some other reason, e.g. switching
  // to a different agent" (do re-render from the new string).
  const lastEmitted = useRef(value)
  // The open "{{partial" trigger, if any: its filter text and how many
  // characters (including the "{{") to delete when a suggestion is picked.
  const [trigger, setTrigger] = useState<{ query: string; openLen: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

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

  const filtered = trigger
    ? suggestions.filter((s) => s.toLowerCase().includes(trigger.query.toLowerCase()))
    : []

  function syncTriggerFromCaret() {
    if (!ref.current) return
    const before = textBeforeCaret(ref.current)
    const match = before ? OPEN_TOKEN_AT_CARET.exec(before) : null
    if (match) {
      setTrigger({ query: match[1], openLen: match[0].length })
      setActiveIndex(0)
    } else {
      setTrigger(null)
    }
  }

  function handleInput() {
    if (!ref.current) return
    const next = serialize(ref.current)
    lastEmitted.current = next
    onChange(next)
    syncTriggerFromCaret()
  }

  function pickSuggestion(name: string) {
    if (!ref.current || !trigger) return
    if (insertChipAtCaret(ref.current, trigger.openLen, name)) {
      const next = serialize(ref.current)
      lastEmitted.current = next
      onChange(next)
    }
    setTrigger(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (trigger && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickSuggestion(filtered[activeIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setTrigger(null)
        return
      }
    }
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
    <div className="relative">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={syncTriggerFromCaret}
        onBlur={() => setTrigger(null)}
        data-placeholder={placeholder}
        className={`${className} whitespace-pre overflow-x-auto empty:before:text-text-muted empty:before:content-[attr(data-placeholder)] [&:not(:empty)]:before:content-none`}
      />
      {trigger && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-56 overflow-y-auto rounded-md border border-border bg-surface-high py-1 text-sm shadow-lg">
          {filtered.map((name, i) => (
            <button
              key={name}
              type="button"
              // Fires before the input's onBlur closes the popup.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickSuggestion(name)}
              className={`flex w-full items-center gap-1 px-2.5 py-1.5 text-left font-mono text-xs ${
                i === activeIndex ? 'bg-primary/10 text-primary' : 'text-text hover:bg-surface'
              }`}
            >
              <span className="text-primary/50">{'{}'}</span>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
