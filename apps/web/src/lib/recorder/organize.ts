import type { RecorderTranscriptSegment } from "@ims/shared";

export const RECORDER_ORGANIZE_LONG_PAUSE_MS = 1200;

const ASCII_PUNCTUATION = /[,.!?;:]/;
const ASCII_WORD = /[A-Za-z0-9]/;

function normalizeInlineText(text: string): string {
  return text
    .replace(/[\t\r\f\v ]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?!\s|$|[\])}"'”’》】）])/g, "$1 ")
    .replace(/\s*([，。！？；：、])/g, "$1")
    .replace(/([，。！？；：、])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/([（【《「“‘\(\[])\s+/g, "$1")
    .replace(/\s+([）】》」”’\)\]])/g, "$1")
    .trim();
}

function shouldInsertSpace(previousText: string, nextText: string): boolean {
  const previousChar = previousText.at(-1) ?? "";
  const nextChar = nextText.at(0) ?? "";

  if (!previousChar || !nextChar) {
    return false;
  }

  if (ASCII_PUNCTUATION.test(nextChar) || /[，。！？；：、]/.test(nextChar)) {
    return false;
  }

  return ASCII_WORD.test(previousChar) && ASCII_WORD.test(nextChar);
}

function normalizeParagraph(text: string): string {
  return normalizeInlineText(text).replace(/\s{2,}/g, " ");
}

function buildParagraphsFromSegments(segments: RecorderTranscriptSegment[]): string[] {
  const paragraphs: string[] = [];
  let paragraph = "";
  let previousSegment: RecorderTranscriptSegment | null = null;

  for (const segment of segments) {
    const normalizedText = normalizeInlineText(segment.text);
    if (!normalizedText) {
      previousSegment = segment;
      continue;
    }

    const hasLongPause = previousSegment
      ? segment.startMs - previousSegment.endMs >= RECORDER_ORGANIZE_LONG_PAUSE_MS
      : false;

    if (!paragraph || hasLongPause) {
      if (paragraph) {
        paragraphs.push(normalizeParagraph(paragraph));
      }
      paragraph = normalizedText;
    } else {
      paragraph = `${paragraph}${shouldInsertSpace(paragraph, normalizedText) ? " " : ""}${normalizedText}`;
    }

    previousSegment = segment;
  }

  if (paragraph) {
    paragraphs.push(normalizeParagraph(paragraph));
  }

  return paragraphs.filter(Boolean);
}

export function organizeRecorderText(options: {
  finalTranscriptText?: string | null;
  segments?: RecorderTranscriptSegment[];
}): string {
  const segments = [...(options.segments ?? [])]
    .filter((segment) => typeof segment.text === "string" && segment.text.trim())
    .sort((left, right) => left.sequence - right.sequence || left.startMs - right.startMs);

  if (segments.length > 0) {
    return buildParagraphsFromSegments(segments).join("\n\n");
  }

  const fallback = (options.finalTranscriptText ?? "").trim();
  if (!fallback) {
    return "";
  }

  return fallback
    .split(/\n+/)
    .map((paragraph) => normalizeParagraph(paragraph))
    .filter(Boolean)
    .join("\n\n");
}
