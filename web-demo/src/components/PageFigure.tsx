import { pageFigures, type PageFigureData } from '../lib/pageFigures'

// One in-content marketing image with its caption. Portrait (phone) images
// get a narrower column so they do not tower over the page.
export function PageFigure({ figure, className = 'mt-10' }: { figure: PageFigureData; className?: string }) {
  const portrait = figure.height > figure.width
  // Taller-than-16:10 cards (long transcripts) get a narrower column too.
  const tall = !portrait && figure.height / figure.width > 0.66
  const small = figure.src.replace(/\.webp$/, '-800.webp')
  return (
    <figure
      className={`mx-auto overflow-hidden rounded-3xl border border-border bg-surface ${portrait ? 'max-w-md' : tall ? 'max-w-3xl' : 'max-w-4xl'} ${className}`}
    >
      <img
        src={figure.src}
        srcSet={`${small} 800w, ${figure.src} ${figure.width}w`}
        sizes={portrait ? '(min-width: 488px) 448px, calc(100vw - 40px)' : tall ? '(min-width: 808px) 768px, calc(100vw - 40px)' : '(min-width: 936px) 896px, calc(100vw - 40px)'}
        alt={figure.alt}
        width={figure.width}
        height={figure.height}
        loading={figure.eager ? 'eager' : 'lazy'}
        fetchPriority={figure.eager ? 'high' : 'auto'}
        decoding="async"
        className="h-auto w-full"
      />
      <figcaption className="border-t border-border px-5 py-3 text-xs leading-relaxed text-text-muted">
        {figure.caption}
      </figcaption>
    </figure>
  )
}

// Every figure pageFigures.ts places on `route` after the section headed `after`.
export function PageFigures({ route, after, className }: { route: string; after: string; className?: string }) {
  return (
    <>
      {pageFigures(route, after).map((figure) => (
        <PageFigure key={figure.src} figure={figure} className={className} />
      ))}
    </>
  )
}
