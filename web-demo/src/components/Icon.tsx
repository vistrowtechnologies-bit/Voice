interface IconProps {
  name: string
  className?: string
  /** Accessible name for an icon that carries meaning on its own (an
   * icon-only control with no adjacent text and no aria-label of its own).
   * Leave unset for decorative icons - the default is to hide the glyph from
   * assistive tech entirely, because the ligature name IS the span's text
   * content ("graphic_eq", "swap_vert"), and screen readers would otherwise
   * announce that raw identifier as if it were content. */
  label?: string
}

export function Icon({ name, className = '', label }: IconProps) {
  // Material Symbols normally uses the ligature name as its text node. That
  // works visually once the font loads, but server-rendered HTML exposes the
  // raw word to crawlers (for example, "expand_more" was appearing directly
  // after FAQ questions in Google's homepage snippet). Keep this ubiquitous
  // chevron as a real vector instead of searchable text.
  if (name === 'expand_more') {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden={label ? undefined : 'true'}
        role={label ? 'img' : undefined}
        aria-label={label}
        focusable="false"
      >
        <path d="m7.41 8.59 4.59 4.58 4.59-4.58L18 10l-6 6-6-6z" />
      </svg>
    )
  }

  return (
    <span
      className={`material-symbols-outlined ${className}`}
      // Decorative by default: every call site today pairs the icon with a
      // visible text label or sits inside a control that already carries its
      // own aria-label.
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {name}
    </span>
  )
}
