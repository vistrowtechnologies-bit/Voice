import type { ReactNode } from 'react'

// Renders server/help_articles.py's small body format as React elements —
// never as HTML, so article text can't inject markup. Supported:
// "## Heading", "- bullet", "1. step", blank line = paragraph, **bold**.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong> : part,
  )
}

export function HelpArticleBody({ body }: { body: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`} className="leading-relaxed">{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`flex flex-col gap-1.5 pl-5 leading-relaxed ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-text-muted`}>
        {list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </Tag>,
    )
    list = null
  }

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const bullet = line.match(/^-\s+(.*)$/)
    const step = line.match(/^\d+\.\s+(.*)$/)
    if (!line) {
      flushPara()
      flushList()
    } else if (line.startsWith('## ')) {
      flushPara()
      flushList()
      blocks.push(<h3 key={`h${blocks.length}`} className="mt-2 text-base font-semibold text-text">{line.slice(3)}</h3>)
    } else if (bullet || step) {
      flushPara()
      const ordered = Boolean(step)
      if (list && list.ordered !== ordered) flushList()
      list = list ?? { ordered, items: [] }
      list.items.push((bullet ?? step)![1])
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return <div className="flex flex-col gap-3 text-[15px] text-text-muted">{blocks}</div>
}
