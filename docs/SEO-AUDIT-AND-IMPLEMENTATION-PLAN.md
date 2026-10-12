# Vistrow Voice SEO audit and implementation plan

**Scope:** `www.vistrowvoice.com` only. This does not cover `vistrow.com` or its separate search property.

## Audit snapshot

- The marketing app has 112 public SEO route records. The build prerenders those routes and emits the sitemap, so Google can receive page-specific HTML rather than depending only on client-side rendering.
- The SEO registry already assigns each route a title, description, canonical URL, social image and page type. Search Console / live HTML checks did not support a claim that all pages were missing metadata. The important gap was discovery and link structure, not starting from zero on tags.
- A generated-HTML crawl found 3 orphan routes before this change: `/best-ai-voice-calling-software-india`, `/ai-voice-bot-pricing-india`, and `/resources/docs`. Some comparison pages had just one source route, while help articles mostly depended on their topic index.
- The ten blog articles already passed the repository's blog SEO check for metadata, rendered contextual links, cover images, BlogPosting schema, social metadata and sitemap membership.
- Search Console snapshot for `https://www.vistrowvoice.com/` (3-month report, through 6 Oct 2026): 692 impressions, 10 clicks, 1.4% CTR, average position 54. This is a small data sample, but it shows the main opportunity is visibility and click-through, not just technical tags. Queries such as “best ai voice calling agent in kannada” (76 impressions), Hindi (56), and Telugu (38) had impressions but no clicks in that snapshot.
- The Page indexing report snapshot showed 90 indexed and 12 not indexed, with 11 in “Discovered – currently not indexed.” Examples included product pages and `/compare/sarvam-ai`. That state means Google knows about those URLs but has not crawled them yet; it does not by itself prove a content-quality penalty.
- Search Console had last read the sitemap on 3 Oct and reported 101 URLs, while the current deployed sitemap check later showed 112. Re-submit or inspect the sitemap in Search Console after this release and compare the processed count; sitemap submission is discovery help, not an indexing guarantee.

## Implemented in this pass

1. Added a compact, visible “Explore related” section to public marketing pages. It uses descriptive crawlable links, connects detail pages to their closest collection, and adds relevant product, language, solution, pricing, help, blog and demo paths. Orphan buyer guides and docs now have explicit routes into their relevant topic clusters.
2. Added `npm run check:seo-pages`, which audits the built HTML for all indexable registry routes: prerendered page, unique title and description, canonical URL, one H1, and at least one incoming internal link from another SEO route.
3. Kept route metadata centralized in `src/lib/seoPages.ts`; do not add generic/fallback metadata for new indexable pages. Add each new public page there and make sure its collection or a related page links to it.

## Ranked rollout plan

### P0 — Release quality and indexation (now)

- Run the production build, `npm run check:seo-pages`, and `npx tsx scripts/check-blog-seo.ts` before release.
- Inspect the deployed sitemap, submit `/sitemap.xml` under the `vistrowai@gmail.com` Search Console account for the `www.vistrowvoice.com` property, and request indexing for a small first batch of the important already-published routes: `/product`, `/product/agents`, `/product/widget`, `/languages`, Hindi, Kannada, Telugu, Marathi, `/solutions/real-estate`, `/pricing`, and `/compare/sarvam-ai`.
- Track those exact URLs in Page indexing and URL Inspection; avoid repeated bulk requests while Google is still processing.
- Confirm canonical host consistency (`www`), redirect behavior, robots directives, HTTPS, and no accidental `noindex` on public product pages.

### P1 — Win high-intent searches

- Prioritize the query clusters already appearing in Search Console: AI voice calling software India, AI voice agent for Kannada/Hindi/Telugu/Marathi, AI IVR, AI voice bot pricing, website voice widget, and real-estate lead qualification.
- Give each cluster one clear landing page and ensure it has original proof: real product screenshots or call examples, supported-language limits, pricing context, implementation steps, and a specific CTA. Avoid creating thin city/language doorway pages that only swap a keyword.
- Improve snippets on pages with meaningful impressions but no clicks: align title/H1/description to the actual query intent and state a concrete differentiator without unsupported “best/fastest” claims.
- Link language pages to their language overview, product channel pages, relevant real call demos, and the contact/demo flow. Link comparison pages to their criteria, the relevant product page and pricing; clearly date-check comparisons when vendor details change.

### P2 — Build topical authority and conversion paths

- Expand the existing blog into evidence-backed guides: firsthand call tests, latency measurement methodology, language-specific examples, workflow diagrams, implementation details and named authors/reviewers where true.
- Add two-way contextual links between each article and one or more relevant product/solution pages; connect relevant demo transcripts and help guides. Keep anchor text natural and useful rather than repeating exact-match keywords.
- Publish useful case studies only when customer permission and measured outcomes are available; show the workflow, baseline, call volume, language, limitations and source of results.
- Add helpful, accessible alt text to meaningful images; compress and size images responsively. Keep decorative art alt-empty.
- Review structured data for correctness; maintain Organization, WebSite, BreadcrumbList, SoftwareApplication/Service and BlogPosting where they match visible page content. Do not rely on FAQ rich-result markup as a ranking tactic.

### P3 — Measure, refine, repeat (monthly)

- In Search Console, review query/page impressions, clicks, CTR and average position by page cluster; compare 28 days with the previous period after enough data accrues.
- In GA4, report organic landing sessions and meaningful conversion events (demo booking, account signup, widget test), using the existing normal traffic reporting. Do not split out AI/bot traffic as a separate marketing channel unless explicitly requested.
- Review pages with impressions and low CTR for snippet improvements; pages with impressions but low positions for better substance/links; pages with no impressions for indexability, discovery and demand checks.
- Monitor Page indexing and CWV. No CWV field-data conclusion is possible when Search Console reports insufficient field data.

## Owner actions after code review/release

- Use the existing `vistrowai@gmail.com` Google account and the exact `https://www.vistrowvoice.com/` Search Console property.
- Re-submit/inspect the sitemap and request indexing for the prioritized small batch above after the release is live.
- Share the next Search Console Pages and Queries export after 2–4 weeks so content priorities can be updated from actual results.

SEO improves eligibility and relevance; it cannot guarantee rankings or an indexing date. The Search Console figures above are a dated snapshot and should be refreshed before making a new performance claim.
