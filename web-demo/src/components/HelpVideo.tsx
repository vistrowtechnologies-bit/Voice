import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { HELP_VIDEOS, helpVideoPoster, helpVideoSrc } from '../lib/helpVideos'

// A help video loads nothing but its poster until someone presses play, so
// pages with a video stay as fast as pages without one.

/** Poster with a play button; becomes the playing video on click. */
export function HelpVideoPlayer({ slug, autoPlay = false }: { slug: string; autoPlay?: boolean }) {
  const [playing, setPlaying] = useState(autoPlay)
  const video = HELP_VIDEOS[slug]
  if (!video) return null
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      {playing ? (
        <video
          className="h-full w-full"
          src={helpVideoSrc(slug)}
          poster={helpVideoPoster(slug)}
          controls
          autoPlay
          playsInline
          preload="metadata"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Play video: ${video.title}`} className="group absolute inset-0 h-full w-full">
          <img src={helpVideoPoster(slug)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15" />
          <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary/40 transition-transform group-hover:scale-105">
            <Icon name="play_arrow" className="text-[22px]" />
            Watch · {video.length}
          </span>
        </button>
      )}
    </div>
  )
}

/** The "Watch how" button in a dashboard page header; the video opens in a dialog. */
/** compact: icon only on phones (the label stays for screen readers). */
export function WatchHowButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const video = HELP_VIDEOS[slug]
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!video) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Watch how: ${video.title}`}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary ${compact ? 'h-9 justify-center px-2.5 sm:h-auto sm:px-3.5 sm:py-2' : 'px-3 py-1.5'}`}
      >
        <Icon name="play_arrow" className="text-[16px] text-primary" />
        <span className={compact ? 'sr-only sm:not-sr-only' : ''}>Watch how</span>
        <span className="hidden text-text-muted sm:inline">· {video.length}</span>
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={video.title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <p className="truncate text-sm font-semibold">{video.title}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close video" className="rounded-full p-1.5 hover:bg-white/10">
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <HelpVideoPlayer slug={slug} autoPlay />
          </div>
        </div>
      )}
    </>
  )
}
