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
