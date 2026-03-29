import { readFileSync } from "node:fs";
import type { ExtractResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tesseract = require("tesseract.js");

export async function extractPdfText(filePath: string): Promise<ExtractResult> {
  const buf = readFileSync(filePath);

  try {
    const data = await pdfParse(buf);
    const text = normalizeExtractedPdfText(data.text);
    if (!text) {
      throw new Error("pdf-parse returned too little text");
    }

    const confidence = text.length > 2000 ? 95 : text.length > 800 ? 88 : text.length > 200 ? 72 : 55;
    return { text, confidence, method: "pdf_text" };
  } catch (err) {
    throw new Error(`local pdf extraction failed: ${(err as Error).message}`);
  }
}

export async function extractImageText(filePath: string, fileType: string): Promise<ExtractResult> {
  try {
    const { data } = await tesseract.recognize(readFileSync(filePath), fileType === "png" ? "eng" : "eng", { logger: () => {} });
    return { text: (data.text ?? "").trim(), confidence: Math.round(data.confidence ?? 0), method: "ocr" };
  } catch (err) {
    throw new Error(`tesseract OCR failed: ${(err as Error).message}`);
  }
}

export async function extractText(
  filePath: string,
  fileType: "pdf" | "png" | "jpg" | "jpeg" | "webp"
): Promise<ExtractResult> {
  if (fileType === "pdf") return extractPdfText(filePath);
  return extractImageText(filePath, fileType);
}

function normalizeExtractedPdfText(value: string | null | undefined): string | null {
  const withoutNulls = (value ?? "").split("\0").join("");
  const normalized = withoutNulls
    .replace(/^\(null\)$/im, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length >= 20 ? normalized : null;
}
