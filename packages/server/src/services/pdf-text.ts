import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy, getMeta } from "unpdf";

type PdfInfoValue = string | number | boolean | null;

export interface PdfTextExtractionResult {
  text: string;
  sufficientText: boolean;
  pageCount: number | null;
  info: Record<string, PdfInfoValue>;
}

export async function extractPdfTextFromFile(filePath: string): Promise<PdfTextExtractionResult> {
  const buffer = await readFile(filePath);
  return extractPdfTextFromBuffer(buffer);
}

export async function extractPdfTextFromBuffer(data: Uint8Array | ArrayBuffer): Promise<PdfTextExtractionResult> {
  const pdf = await getDocumentProxy(toUint8Array(data));

  try {
    const textResult = await extractText(pdf, { mergePages: true });

    let info: Record<string, PdfInfoValue> = {};
    try {
      const meta = await getMeta(pdf);
      info = normalizePdfInfo(meta.info);
    } catch {
      info = {};
    }

    const text = normalizeExtractedPdfText(textResult.text);

    return {
      text,
      sufficientText: text.length >= 20,
      pageCount: textResult.totalPages ?? pdf.numPages ?? null,
      info,
    };
  } finally {
    await pdf.destroy();
  }
}

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  return Buffer.isBuffer(data) ? new Uint8Array(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
}

function normalizeExtractedPdfText(value: string | null | undefined): string {
  let text = (value ?? "")
    .split("\0")
    .join("")
    .replace(/^\(null\)$/im, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ");

  // Insert newlines before known resume section headers that appear mid-text
  // (PDF extraction may not preserve line breaks)
  text = text.replace(
    /(?<=\S)\s*(?=(?:专业技能|工作经历|项目经历|教育经历|教育背景|毕业院校|学历|技能特长|个人简介|联系方式|基本信息|其他)[:：]?(?:\s|$))/g,
    "\n",
  );

  return text
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePdfInfo(info: Record<string, unknown> | null | undefined): Record<string, PdfInfoValue> {
  return Object.fromEntries(
    Object.entries(info ?? {}).map(([key, value]) => [key, normalizePdfInfoValue(value)])
  );
}

function normalizePdfInfoValue(value: unknown): PdfInfoValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}
