# Blog queue

Finished posts waiting for their publish date. Nothing here is imported by the site, so a queued post is not public until the daily job moves it into `src/content/dailyBlogPosts.ts` on its `publishOn` date.

One post per JSON file, `NN-<slug>.json` (NN = calendar row in docs/SEO-BLOG-PLAN-2026-10-21.md), plus two images next to it: `<slug>.jpg` (1200x675, also the og:image) and `<slug>-640.jpg` (640x360).

Run `npx tsx scripts/check-blog-queue.mts` from web-demo; it must print PASS.

## Fields
```
{
  "n": 2,                                   // calendar row
  "publishOn": "2026-10-22",                // YYYY-MM-DD
  "primaryKeyword": "ai receptionist vs answering service",
  "audience": "Global",
  "slug": "ai-receptionist-vs-answering-service-vs-ivr",
  "title": "...",                            // H1, natural sentence
  "seoTitle": "...",                         // <title>, <= 60 chars, keyword first
  "metaDescription": "...",                  // <= 155 chars
  "shortAnswer": "...",                      // 40-60 words, direct answer
  "excerpt": "...",                          // 1-2 sentences under the H1
  "category": "...",                         // reuse an existing category where it fits
  "related": ["slug", "slug", "slug"],       // live posts or earlier-queued posts
  "sections": [ { "heading": "Question?", "paragraphs": ["... [anchor 12+ chars](/path) ..."], "points": ["..."] } ],
  "faqs": [ { "q": "...?", "a": "..." } ],   // 4-6
  "imageAlt": "...",                         // > 30 chars, describes the photo
  "imagePrompt": "...",                      // the prompt used for the cover
  "sources": [ { "title": "...", "url": "https://..." } ],   // every number cited here
  "contextualLinks": "One sentence with 2 [descriptive links](/path).",
  "inbound": [                               // >= 2: in-text links INTO this post, added on publish day
    { "target": "blog:<live-or-earlier-slug>", "sentence": "... [anchor](/resources/blog/<this slug>) ..." },
    { "target": "language:<slug>" | "page:<path such as /ai-receptionist>", "sentence": "..." }
  ]
}
```
