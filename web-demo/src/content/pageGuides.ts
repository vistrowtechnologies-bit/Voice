// In-text links from marketing pages to related blog guides, added by
// scripts/publish-queued-post.mts when a queued post goes live. Keyed by page
// path; each entry is one sentence with [anchor](/resources/blog/slug) links.
// Rendered by components/PageGuides.tsx inside MarketingLayout's <main>.
export const PAGE_GUIDES: Record<string, string[]> = {
  '/ai-receptionist': [
    'Still deciding between options? Read our guide to [comparing an AI receptionist with an answering service and an IVR](/resources/blog/ai-receptionist-vs-answering-service-vs-ivr).',
  ],
}
