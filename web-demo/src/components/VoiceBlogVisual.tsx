import type { VoiceBlogPost } from '../content/voiceBlog'

export function voiceBlogIcon(category: string) {
  const icons: Record<string, string> = {
    'Voice AI basics': 'graphic_eq',
    'Languages & speech': 'translate',
    'Performance & latency': 'speed',
    'Website voice': 'language',
    'CRM & integrations': 'hub',
  }
  return icons[category] ?? 'auto_awesome'
}

/** AI-generated editorial illustrations, not photographs of actual customers.
 *  Covers are designed 16:9 images with a headline, so they are never cropped. */
export function VoiceBlogVisual({ post, featured = false }: { post: VoiceBlogPost; featured?: boolean }) {
  return <div className="relative aspect-[16/9] overflow-hidden border-b border-border bg-surface-high">
    <img src={post.image} srcSet={`${post.image.replace('.jpg', '-640.jpg')} 640w, ${post.image} 1200w`} sizes={featured ? '(min-width:1024px) 760px, 100vw' : '(min-width:1024px) 420px, (min-width:640px) 50vw, 100vw'} alt={post.imageAlt} width={1200} height={675} loading={featured ? 'eager' : 'lazy'} fetchPriority={featured ? 'high' : 'auto'} decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.02]" />
  </div>
}
