import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactElement, ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  /** What to say. Empty (undefined, null, false, '') renders the child untouched. */
  content: ReactNode
  children: ReactElement
  /** Preferred side. It flips to the opposite side when there is no room. */
  side?: Side
  /** Milliseconds of hover before it appears. Keyboard focus shows it at once. */
  delay?: number
  /** Let the pointer move onto the tooltip (for tooltips that hold a link). */
  interactive?: boolean
  /** Wrap the child in a span instead of attaching to it. Only for a component
   * that does not forward ref and mouse/focus handlers (an <Icon>, say). */
  wrap?: boolean
  /** On touch screens (no hover) show it when the trigger is tapped, and hide it
   * after a few seconds. Off by default: a tooltip on an action button would
   * only get in the way of the tap. Turn on for "what is this?" triggers. */
  touch?: boolean
}

const GAP = 10 // space between trigger and tooltip
const EDGE = 8 // minimum distance from the screen edge

type Pos = { top: number; left: number; side: Side; arrow: number }

function place(trigger: DOMRect, tip: DOMRect, preferred: Side): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const room = {
    top: trigger.top - GAP - EDGE,
    bottom: vh - trigger.bottom - GAP - EDGE,
    left: trigger.left - GAP - EDGE,
    right: vw - trigger.right - GAP - EDGE,
  }
  const need = { top: tip.height, bottom: tip.height, left: tip.width, right: tip.width }
  const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
  let side = preferred
  if (room[side] < need[side] && room[opposite[side]] >= need[opposite[side]]) side = opposite[side]

  let top: number
  let left: number
  if (side === 'top' || side === 'bottom') {
    left = trigger.left + trigger.width / 2 - tip.width / 2
    left = Math.max(EDGE, Math.min(left, vw - EDGE - tip.width))
    top = side === 'top' ? trigger.top - GAP - tip.height : trigger.bottom + GAP
    const arrow = trigger.left + trigger.width / 2 - left
    return { top, left, side, arrow: Math.max(14, Math.min(arrow, tip.width - 14)) }
  }
  top = trigger.top + trigger.height / 2 - tip.height / 2
  top = Math.max(EDGE, Math.min(top, vh - EDGE - tip.height))
  left = side === 'left' ? trigger.left - GAP - tip.width : trigger.right + GAP
  const arrow = trigger.top + trigger.height / 2 - top
  return { top, left, side, arrow: Math.max(14, Math.min(arrow, tip.height - 14)) }
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const r of refs) {
      if (typeof r === 'function') r(node)
      else if (r && typeof r === 'object') (r as { current: T | null }).current = node
    }
  }
}

/**
 * The one tooltip for the whole dashboard.
 *
 * - Drawn in a portal at the document root with fixed positioning, so no
 *   scrolling card or modal can clip it and it never pushes a field around.
 * - Flips to the other side and stays inside the screen.
 * - Opens on hover (after a short delay) and on keyboard focus; Escape closes it.
 * - Describes its trigger to screen readers through aria-describedby.
 * - It attaches to the child element itself (no wrapper), so layout classes on
 *   the child keep working. The child must forward ref and mouse/focus handlers:
 *   DOM elements and react-router's Link do. Use wrap for anything else.
 */
export function Tooltip({ content, children, side = 'top', delay = 250, interactive = false, wrap = false, touch = false }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const openTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)
  const hasContent = !(content === undefined || content === null || content === false || content === '')

  const show = useCallback(
    (immediately: boolean) => {
      window.clearTimeout(closeTimer.current)
      window.clearTimeout(openTimer.current)
      if (immediately) setOpen(true)
      else openTimer.current = window.setTimeout(() => setOpen(true), delay)
    },
    [delay],
  )
  const hide = useCallback(
    (grace: boolean) => {
      window.clearTimeout(openTimer.current)
      window.clearTimeout(closeTimer.current)
      if (grace) closeTimer.current = window.setTimeout(() => setOpen(false), 120)
      else setOpen(false)
    },
    [],
  )

  useEffect(() => () => {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
  }, [])

  // Measure and place after render, and again whenever the page moves under it.
  const reposition = useCallback(() => {
    if (!triggerRef.current || !tipRef.current) return
    setPos(place(triggerRef.current.getBoundingClientRect(), tipRef.current.getBoundingClientRect(), side))
  }, [side])
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    reposition()
  }, [open, content, reposition])
  useEffect(() => {
    if (!open) return
    const onMove = () => reposition()
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') hide(false) }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, reposition, hide])

  if (!hasContent || !isValidElement(children)) return children

  // No hover on touch screens: hover tooltips are skipped there, and tap-to-show
  // ones (touch) open on tap and close themselves after a few seconds.
  const noHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches
  const handlers = {
    onMouseEnter: () => { if (!noHover) show(false) },
    onMouseLeave: () => { if (!noHover) hide(interactive) },
    onFocus: () => { if (!noHover) show(true) },
    onBlur: () => hide(false),
    onClick: () => {
      if (!noHover || !touch) return
      show(true)
      window.clearTimeout(closeTimer.current)
      closeTimer.current = window.setTimeout(() => setOpen(false), 4000)
    },
  }

  const tip =
    open &&
    createPortal(
      <div
        ref={tipRef}
        id={id}
        role="tooltip"
        onMouseEnter={interactive ? () => show(true) : undefined}
        onMouseLeave={interactive ? () => hide(true) : undefined}
        style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
        className={`vv-tooltip z-[300] ${interactive ? '' : 'pointer-events-none'}`}
        data-side={pos?.side ?? side}
      >
        <div className="vv-tooltip-body">{content}</div>
        {pos && (
          <span
            aria-hidden="true"
            className="vv-tooltip-arrow"
            style={
              pos.side === 'top' || pos.side === 'bottom'
                ? { left: pos.arrow, [pos.side === 'top' ? 'bottom' : 'top']: -4 }
                : { top: pos.arrow, [pos.side === 'left' ? 'right' : 'left']: -4 }
            }
          />
        )}
      </div>,
      document.body,
    )

  const child = children as ReactElement<Record<string, unknown>>
  const childProps = child.props as Record<string, unknown>

  if (!wrap) {
    const call = (name: string, e: unknown) => (childProps[name] as ((e: unknown) => void) | undefined)?.(e)
    return (
      <>
        {cloneElement(child, {
          ref: mergeRefs(triggerRef as Ref<HTMLElement>, childProps.ref as Ref<HTMLElement> | undefined),
          onMouseEnter: (e: unknown) => { call('onMouseEnter', e); handlers.onMouseEnter() },
          onMouseLeave: (e: unknown) => { call('onMouseLeave', e); handlers.onMouseLeave() },
          onFocus: (e: unknown) => { call('onFocus', e); handlers.onFocus() },
          onBlur: (e: unknown) => { call('onBlur', e); handlers.onBlur() },
          onClick: (e: unknown) => { call('onClick', e); handlers.onClick() },
          'aria-describedby': open ? id : (childProps['aria-describedby'] as string | undefined),
        })}
        {tip}
      </>
    )
  }

  // wrap: components that do not forward handlers.
  return (
    <>
      <span
        ref={triggerRef as Ref<HTMLSpanElement>}
        className="inline-flex"
        aria-describedby={open ? id : undefined}
        {...handlers}
      >
        {children}
      </span>
      {tip}
    </>
  )
}

/**
 * The small (i) next to a label. Hover, focus or tap shows the explanation.
 * Uses a span with role="button" rather than a real button on purpose: it sits
 * inside <label> elements, and a nested button would steal the label's click
 * from the field it labels.
 */
export function InfoTip({ children, label = 'More information', side = 'top' }: { children: ReactNode; label?: string; side?: Side }) {
  return (
    <Tooltip content={children} side={side} interactive touch>
      <span
        role="button"
        tabIndex={0}
        aria-label={label}
        className="inline-flex cursor-help items-center rounded-full normal-case text-text-muted/70 outline-none hover:text-text-muted focus-visible:ring-2 focus-visible:ring-primary [@media(pointer:coarse)]:-m-2.5 [@media(pointer:coarse)]:p-2.5"
      >
        <Icon name="info" className="!text-sm" />
      </span>
    </Tooltip>
  )
}
