// Turns an uploaded document into something the model can read: page images for
// photos/scans, or plain text for digital PDFs, Word documents and text files.
//
// Everything happens in memory — the file is never written to Supabase Storage,
// `form_files` or the database, and the buffers are dropped when the request
// ends. Only `pdfjs-dist` and `mammoth` are loaded, and only for their formats.
//
// Deliberately free of app imports (no `@/` paths) so the whole module is
// unit-testable with plain `tsc` + `node --test`.

export const MAX_FILES = 6;
export const MAX_FILE_BYTES = 6 * 1024 * 1024;
export const MAX_IMAGES = 6;
export const MAX_TEXT_CHARS = 40_000;
const MAX_PDF_PAGES = 10;

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ImportKind = "image" | "pdf_text" | "docx_text" | "plain_text";

export interface PageImage {
  mimeType: string;
  /** Ready for `imagePart(mimeType, dataUrl.split(",")[1])`. */
  dataUrl: string;
}

export interface ExtractedSource {
  kind: ImportKind;
  mime: string;
  /** Extracted text ("" for image-only sources). */
  text: string;
  images: PageImage[];
  /** Pages read (each image counts as one page). */
  pages: number;
  chars: number;
  warnings: string[];
}

/** The file isn't a kind we can read. */
export class UnsupportedFileError extends Error {
  constructor(
    public readonly mime: string,
    message: string
  ) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function dataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, i) => bytes[offset + i] === value);
}

/** True when the first KB looks like decodable text rather than binary. */
export function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 1024);
  if (sample.length === 0) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte !== 127)) printable++;
  }
  return printable / sample.length > 0.9;
}

/**
 * Content sniffing. The declared MIME type comes from the browser and the
 * filename from the user, so neither is trusted on its own.
 */
export function sniffMime(bytes: Uint8Array, declared = "", filename = ""): string {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // A ZIP container: a Word document keeps its part names in the first bytes.
    const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096))).toString("latin1");
    return filename.toLowerCase().endsWith(".docx") || head.includes("word/document.xml")
      ? DOCX_MIME
      : "application/zip";
  }
  if (looksLikeText(bytes)) return declared.startsWith("text/") ? declared : "text/plain";
  return declared || "application/octet-stream";
}

// ---------------------------------------------------------------------------
// HTML → text (Word documents are laid out as tables; keep that shape)
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z#0-9]+;/gi, (match) => ENTITIES[match.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Flatten mammoth's HTML into lines, keeping each table row as "Label | Answer".
 * `extractRawText` would put every cell on its own line and lose which options
 * belong to which question.
 *
 * Cells are flattened FIRST: Word puts a <p> inside every cell, so closing the
 * paragraph before the cell would split "Gender | Male Female" across lines.
 */
export function htmlToText(html: string): string {
  const withCells = html.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (_match, inner: string) => {
    const flat = decodeEntities(String(inner))
      .replace(/<\s*br\s*\/?>/gi, " ")
      .replace(/<\/?\s*(p|div|li)\s*>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/[ \t]+/g, " ")
      .trim();
    return `${flat} | `;
  });

  return decodeEntities(
    withCells
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|h[1-6]|li|tr|table)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/\s*\|\s*$/, "").trim())
    .filter((line) => line !== "")
    .join("\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

async function pdfjs(): Promise<any> {
  // pdfjs-dist v3 is pinned on purpose: it ships a CommonJS legacy build that
  // loads on every Node version Next 14 supports. v4+ is ESM-only, which a CJS
  // server bundle can only require on Node >= 22.
  const mod: any = await import("pdfjs-dist/legacy/build/pdf.js");
  return mod.getDocument ? mod : mod.default;
}

/** Rebuild text lines from positioned text items (group by y, order by x). */
export function linesFromTextItems(items: any[]): string[] {
  const rows: { y: number; parts: { x: number; str: string; w: number }[] }[] = [];
  for (const item of items ?? []) {
    if (!item || typeof item.str !== "string") continue;
    const y = item.transform?.[5] ?? 0;
    const x = item.transform?.[4] ?? 0;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: item.str, w: typeof item.width === "number" ? item.width : 0 });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const parts = row.parts.sort((a, b) => a.x - b.x);
      let out = "";
      let end: number | null = null;
      for (const part of parts) {
        if (end !== null && part.x - end > 1.5) out += " ";
        out += part.str;
        end = part.x + (part.w || part.str.length * 4);
      }
      return out.replace(/\s+/g, " ").trim();
    })
    .filter((line) => line !== "");
}

/**
 * JPEG page images embedded in a PDF — the usual shape of a scanned document,
 * which has no text layer to read.
 *
 * Anchored on `/DCTDecode` rather than on the bare `stream` keyword: a JPEG's
 * own compressed bytes can contain the ASCII sequence "stream", which made a
 * keyword-first scan skip straight past the real image.
 */
export function embeddedJpegs(bytes: Uint8Array, max = MAX_IMAGES): PageImage[] {
  const buf = Buffer.from(bytes);
  const out: PageImage[] = [];
  let cursor = 0;

  while (out.length < max) {
    const dictionaryAt = buf.indexOf("/DCTDecode", cursor);
    if (dictionaryAt < 0) break;
    const start = buf.indexOf("stream", dictionaryAt);
    if (start < 0) break;
    const end = buf.indexOf("endstream", start);
    if (end < 0) break;

    // The keyword is followed by CRLF or LF, then the raw image bytes.
    let dataStart = start + "stream".length;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;

    let data = buf.subarray(dataStart, end);
    while (data.length > 2 && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
      data = data.subarray(0, data.length - 1);
    }
    if (data[0] === 0xff && data[1] === 0xd8) {
      out.push({ mimeType: "image/jpeg", dataUrl: dataUrl("image/jpeg", data) });
    }
    cursor = end + 1;
  }
  return out;
}

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedSource> {
  const warnings: string[] = [];
  const lib = await pdfjs();
  const doc = await lib.getDocument({
    data: bytes,
    useSystemFonts: false,
    isEvalSupported: false,
    verbosity: 0, // errors only — we never render, so canvas/font noise is useless
  }).promise;

  const pages: string[] = [];
  const limit = Math.min(doc.numPages, MAX_PDF_PAGES);
  for (let number = 1; number <= limit; number++) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const lines = linesFromTextItems(content.items);
    if (lines.length > 0) pages.push(`--- page ${number} ---\n${lines.join("\n")}`);
    if (typeof page.cleanup === "function") page.cleanup();
  }
  if (doc.numPages > MAX_PDF_PAGES) {
    warnings.push(`Only the first ${MAX_PDF_PAGES} of ${doc.numPages} pages were read.`);
  }

  const text = pages.join("\n\n").slice(0, MAX_TEXT_CHARS);
  const bare = text.replace(/--- page \d+ ---/g, "").trim();
  if (bare.length >= 40) {
    return {
      kind: "pdf_text",
      mime: "application/pdf",
      text,
      images: [],
      pages: limit,
      chars: text.length,
      warnings,
    };
  }

  // No usable text layer → treat it as a scan and read the embedded page images.
  const images = embeddedJpegs(bytes);
  if (images.length > 0) {
    warnings.push("This PDF has no text layer, so its page images were read instead.");
    return {
      kind: "image",
      mime: "application/pdf",
      text: "",
      images,
      pages: images.length,
      chars: 0,
      warnings,
    };
  }

  return {
    kind: "pdf_text",
    mime: "application/pdf",
    text: "",
    images: [],
    pages: limit,
    chars: 0,
    warnings: [
      "This PDF has no text layer and no readable page images — it looks like a scan. " +
        "Photograph the pages (or export them as images) and upload those instead.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Word / text
// ---------------------------------------------------------------------------

export async function extractDocx(bytes: Uint8Array): Promise<ExtractedSource> {
  const mod: any = await import("mammoth");
  const mammoth = mod.extractRawText ? mod : mod.default;
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  const text = htmlToText(String(result?.value ?? ""));
  return {
    kind: "docx_text",
    mime: DOCX_MIME,
    text,
    images: [],
    pages: 1,
    chars: text.length,
    warnings: text.trim() ? [] : ["That Word document appears to have no readable text."],
  };
}

export function extractPlainText(bytes: Uint8Array, mime: string): ExtractedSource {
  const text = Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n").slice(0, MAX_TEXT_CHARS);
  return { kind: "plain_text", mime, text, images: [], pages: 1, chars: text.length, warnings: [] };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function extractSource(input: {
  bytes: Uint8Array;
  declaredMime?: string;
  filename?: string;
}): Promise<ExtractedSource> {
  const { bytes } = input;
  const mime = sniffMime(bytes, input.declaredMime ?? "", input.filename ?? "");

  if (IMAGE_MIMES.has(mime)) {
    return {
      kind: "image",
      mime,
      text: "",
      images: [{ mimeType: mime, dataUrl: dataUrl(mime, bytes) }],
      pages: 1,
      chars: 0,
      warnings: [],
    };
  }
  if (mime === "application/pdf") return extractPdf(bytes);
  if (mime === DOCX_MIME) return extractDocx(bytes);
  if (mime.startsWith("text/") || mime === "application/json") return extractPlainText(bytes, mime);

  throw new UnsupportedFileError(
    mime,
    "That file type isn't supported. Upload a photo or scan (PNG/JPG/WebP), a PDF, a Word " +
      "(.docx) document, or a plain-text file."
  );
}




