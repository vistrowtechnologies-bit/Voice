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

/** AI-generated editorial illustrations, not photographs of actual customers. */
export function VoiceBlogVisual({ post, featured = false }: { post: VoiceBlogPost; featured?: boolean }) {
  return <div className={`relative overflow-hidden bg-surface-high ${featured ? 'min-h-[320px] lg:min-h-full' : 'aspect-[16/9] border-b border-border'}`}>
    <img src={post.image} srcSet={`${post.image.replace('.jpg', '-640.jpg')} 640w, ${post.image} 1200w`} sizes={featured ? '(min-width:1024px) 42vw, 100vw' : '(min-width:1024px) 30vw, (min-width:640px) 50vw, 100vw'} alt={post.imageAlt} width={1200} height={675} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
  </div>
}
