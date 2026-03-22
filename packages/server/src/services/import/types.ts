export type FileType = "pdf" | "png" | "jpg" | "jpeg" | "webp" | "zip" | "unknown";

export function classifyFileType(ext: string): FileType {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "pdf") return "pdf";
  if (e === "png") return "png";
  if (e === "jpg") return "jpg";
  if (e === "jpeg") return "jpeg";
  if (e === "webp") return "webp";
  if (e === "zip") return "zip";
  return "unknown";
}

export interface ExtractResult {
  text: string;
  confidence: number;
  method: "pdf_text" | "ocr" | "fallback";
}

export interface ParsedResume {
  name: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  education: string[];
  workHistory: string[];
  rawText: string;
}

export type FileStage =
  | "queued" | "extracting" | "text_extracting" | "ocr_running"
  | "parsing" | "matching_candidate" | "saving" | "done" | "failed" | "skipped";

export type BatchStage =
  | "queued" | "preparing" | "extracting" | "classifying"
  | "processing" | "indexing" | "completed" | "partial_success" | "failed" | "cancelled";

export const ImportErrorCodes = {
  FILE_NOT_FOUND: "IMPORT_FILE_NOT_FOUND",
  UNSUPPORTED_TYPE: "IMPORT_UNSUPPORTED_TYPE",
  ARCHIVE_TOO_DEEP: "IMPORT_ARCHIVE_TOO_DEEP",
  ARCHIVE_TOO_LARGE: "IMPORT_ARCHIVE_TOO_LARGE",
  TEXT_EXTRACT_FAILED: "IMPORT_TEXT_EXTRACT_FAILED",
  OCR_FAILED: "IMPORT_OCR_FAILED",
  PARSE_FAILED: "IMPORT_PARSE_FAILED",
  SAVE_FAILED: "IMPORT_SAVE_FAILED",
  INDEX_FAILED: "IMPORT_INDEX_FAILED",
} as const;
