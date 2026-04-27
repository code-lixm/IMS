import { readFile, stat } from "node:fs/promises";
import JSZip from "jszip";

const ZIP_IGNORED_ENTRY_NAMES = [".ds_store", "thumbs.db"];
const ZIP_IGNORED_ENTRY_PREFIXES = ["__macosx/"];

export const MAX_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRY_COUNT = 100;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

export class ZipPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipPdfError";
  }
}

export interface ExtractedZipPdfEntry {
  entryName: string;
  buffer: Buffer;
}

interface ExtractZipPdfOptions {
  archiveReadErrorMessage?: string;
  archiveExtractErrorMessage?: string;
  invalidEntryMessage?: string;
  emptyArchiveMessage?: string;
  archiveTooLargeMessage?: string;
  entryTooLargeMessage?: string;
  totalTooLargeMessage?: string;
  tooManyEntriesMessage?: string;
  strictPdfOnly?: boolean;
}

export async function extractPdfEntriesFromZip(
  archivePath: string,
  options: ExtractZipPdfOptions = {}
): Promise<ExtractedZipPdfEntry[]> {
  const archiveStats = await stat(archivePath).catch(() => null);
  if (!archiveStats) {
    throw new ZipPdfError(options.archiveReadErrorMessage ?? "ZIP 压缩包读取失败");
  }
  if (archiveStats.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new ZipPdfError(options.archiveTooLargeMessage ?? "ZIP 压缩包过大");
  }

  const zipBuffer = await readFile(archivePath).catch(() => null);
  if (!zipBuffer) {
    throw new ZipPdfError(options.archiveReadErrorMessage ?? "ZIP 压缩包读取失败");
  }

  const zip = await JSZip.loadAsync(zipBuffer).catch(() => null);
  if (!zip) {
    throw new ZipPdfError(options.archiveReadErrorMessage ?? "ZIP 压缩包读取失败");
  }

  const entries = Object.entries(zip.files)
    .filter(([, entry]) => !entry.dir)
    .map(([entryName, entry]) => ({ entryName, entry }))
    .filter(({ entryName }) => !shouldIgnoreZipEntry(entryName));

  if (entries.length === 0) {
    throw new ZipPdfError(options.emptyArchiveMessage ?? "ZIP 压缩包内没有可导入的 PDF 文件");
  }
  if (entries.length > MAX_ZIP_ENTRY_COUNT) {
    throw new ZipPdfError(options.tooManyEntriesMessage ?? "ZIP 压缩包内文件数量过多");
  }

  const pdfEntries = entries.filter(({ entryName }) => entryName.toLowerCase().endsWith(".pdf"));
  const invalidEntries = entries.filter(({ entryName }) => !entryName.toLowerCase().endsWith(".pdf"));

  if (options.strictPdfOnly !== false && invalidEntries.length > 0) {
    throw new ZipPdfError(options.invalidEntryMessage ?? "ZIP 压缩包内只能包含 PDF 文件");
  }
  if (pdfEntries.length === 0) {
    throw new ZipPdfError(options.emptyArchiveMessage ?? "ZIP 压缩包内没有可导入的 PDF 文件");
  }

  let totalUncompressedBytes = 0;
  const extracted: ExtractedZipPdfEntry[] = [];

  for (const { entryName, entry } of pdfEntries) {
    const metadataSize = getZipEntryUncompressedSize(entry);
    if (metadataSize !== null && metadataSize > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw new ZipPdfError(options.entryTooLargeMessage ?? "ZIP 压缩包内文件过大");
    }
    if (metadataSize !== null && totalUncompressedBytes + metadataSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ZipPdfError(options.totalTooLargeMessage ?? "ZIP 压缩包解压后的总文件过大");
    }

    const buffer = await entry.async("nodebuffer").catch(() => null);
    if (!buffer) {
      throw new ZipPdfError(options.archiveExtractErrorMessage ?? "ZIP 压缩包解压失败");
    }
    if (buffer.byteLength > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw new ZipPdfError(options.entryTooLargeMessage ?? "ZIP 压缩包内文件过大");
    }

    totalUncompressedBytes += buffer.byteLength;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ZipPdfError(options.totalTooLargeMessage ?? "ZIP 压缩包解压后的总文件过大");
    }
    if (!isPdfBuffer(buffer)) {
      throw new ZipPdfError(options.invalidEntryMessage ?? "ZIP 压缩包内存在无法解析的 PDF 文件");
    }

    extracted.push({ entryName, buffer });
  }

  return extracted;
}

function shouldIgnoreZipEntry(entryName: string) {
  const normalized = entryName.replace(/\\/g, "/").toLowerCase();
  if (ZIP_IGNORED_ENTRY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  const parts = normalized.split("/");
  const baseName = parts[parts.length - 1] ?? normalized;
  return ZIP_IGNORED_ENTRY_NAMES.includes(baseName);
}

function getZipEntryUncompressedSize(entry: JSZip.JSZipObject): number | null {
  const rawData = Reflect.get(entry as object, "_data");
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const value = Reflect.get(rawData as object, "uncompressedSize");
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPdfBuffer(buffer: Buffer) {
  if (buffer.byteLength < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
