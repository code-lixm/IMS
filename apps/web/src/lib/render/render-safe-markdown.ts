import { marked } from "marked"
import createDOMPurify from "dompurify"

const domPurify = createDOMPurify(typeof window !== "undefined" ? window : globalThis)

marked.setOptions({
  async: false,
  breaks: true,
  gfm: true,
})

const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
} as const

function fallbackSanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+=(["']).*?\1/gi, "")
    .replace(/\son[a-z]+=[^\s>]+/gi, "")
}

function sanitizeHtml(html: string): string {
  const candidate = domPurify as unknown as {
    sanitize?: (dirty: string, options?: typeof SANITIZE_OPTIONS) => string
  }

  if (typeof candidate.sanitize === "function") {
    return candidate.sanitize(html, SANITIZE_OPTIONS)
  }

  return fallbackSanitize(html)
}

export function renderSafeMarkdown(content: string): string {
  const rawHtml = marked.parse(content)
  return sanitizeHtml(typeof rawHtml === "string" ? rawHtml : String(rawHtml))
}
