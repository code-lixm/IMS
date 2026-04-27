import type { ExtractResult } from "./types";
import { extractPdfTextFromFile } from "../pdf-text";

const UNSUPPORTED_IMAGE_IMPORT_MESSAGE = "图片导入已不再支持，图片 OCR 已移除，请先转换为可搜索 PDF 后再导入";

export async function extractPdfText(filePath: string): Promise<ExtractResult> {
  try {
    const extraction = await extractPdfTextFromFile(filePath);
    if (!extraction.sufficientText) {
      throw new Error("unpdf returned too little text");
    }

    const text = extraction.text;
    const confidence = text.length > 2000 ? 95 : text.length > 800 ? 88 : text.length > 200 ? 72 : 55;
    return { text, confidence, method: "pdf_text" };
  } catch (err) {
    throw new Error(`local pdf extraction failed: ${(err as Error).message}`);
  }
}

export async function extractImageText(filePath: string, fileType: string): Promise<ExtractResult> {
  void filePath;
  throw new Error(`${UNSUPPORTED_IMAGE_IMPORT_MESSAGE}（${fileType.toUpperCase()}）`);
}

export async function extractText(
  filePath: string,
  fileType: "pdf" | "png" | "jpg" | "jpeg" | "webp"
): Promise<ExtractResult> {
  if (fileType === "pdf") return extractPdfText(filePath);
  return extractImageText(filePath, fileType);
}
