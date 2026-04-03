declare module "pdf-parse" {
  interface PdfParseResult {
    text?: string;
    numpages?: number;
    info?: Record<string, unknown>;
  }

  function pdfParse(dataBuffer: Uint8Array | ArrayBuffer): Promise<PdfParseResult>;

  export default pdfParse;
}
