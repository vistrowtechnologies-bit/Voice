// Client-side text extraction for knowledge-base source uploads. Runs in the
// browser (no backend change needed) — addKnowledgeSource already just takes
// a plain-text `content` string, so any format we can turn into text here
// slots into the existing prompt-stuffing pipeline unchanged.

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.pdf')) return extractPdf(file)
  if (name.endsWith('.docx')) return extractDocx(file)
  // .doc (legacy binary Word) has no reliable browser-side parser; treating
  // it as plain text would just produce binary garbage, so reject clearly.
  if (name.endsWith('.doc')) {
    throw new Error('.doc (old Word format) isn\'t supported — please save as .docx and re-upload.')
  }

  // .txt, .md, .csv, and anything else we don't have a specific parser for.
  return file.text()
}

async function extractPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  const text = pages.join('\n\n').trim()
  if (!text) {
    throw new Error('No extractable text found in this PDF — it may be scanned images without a text layer.')
  }
  return text
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  const text = result.value.trim()
  if (!text) {
    throw new Error('No extractable text found in this document.')
  }
  return text
}
