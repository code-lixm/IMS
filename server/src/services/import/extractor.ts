/**
 * Text extraction from PDF and images (OCR).
 *
 * PDF:  uses pdf-parse ( synchronous, works in Bun )
 * Image: uses tesseract.js (async, runs entirely in-browser/node)
 */

import { readFileSync } from "node:fs";
import type { ExtractResult } from "./types";

// Bun-compatible pdf-parse import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

// Tesseract.js
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tesseract = require("tesseract.js");

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

export async function extractPdfText(filePath: string): Promise<ExtractResult> {
  const buf = readFileSync(filePath);

  try {
    const data = await pdfParse(buf);
    const text = (data.text ?? "").trim();

    // If extracted text is suspiciously short, flag low confidence
    const confidence = text.length > 200 ? 90 : text.length > 50 ? 60 : 30;

    return { text, confidence, method: "pdf_text" };
  } catch (err) {
    throw new Error(`pdf-parse failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Image OCR
// ---------------------------------------------------------------------------

export async function extractImageText(
  filePath: string,
  fileType: string
): Promise<ExtractResult> {
  try {
    const { data } = await tesseract.recognize(
      readFileSync(filePath),
      fileType === "png" ? "eng" : "eng",
      {
        logger: () => {},  // silence progress logs
      }
    );

    return {
      text: (data.text ?? "").trim(),
      confidence: Math.round(data.confidence ?? 0),
      method: "ocr",
    };
  } catch (err) {
    throw new Error(`tesseract OCR failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

export async function extractText(
  filePath: string,
  fileType: "pdf" | "png" | "jpg" | "jpeg" | "webp"
): Promise<ExtractResult> {
  if (fileType === "pdf") {
    return extractPdfText(filePath);
  }
  return extractImageText(filePath, fileType);
}
