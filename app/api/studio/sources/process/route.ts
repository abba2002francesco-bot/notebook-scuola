import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { unzipSync } from "fflate";
import { getSupabaseUserIdFromRequest } from "@/lib/notebooklm-google";
import {
  STUDY_API_SOURCES_URL,
  STUDY_SUPABASE_URL,
  STUDY_SUPABASE_PUBLISHABLE_KEY,
} from "@/lib/study-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 2_000_000;
const MAX_PAGES = 1_000;

type SourceInfo = {
  id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
};

type ExtractedPage = {
  page_index: number;
  page_number: number | null;
  text: string;
};

class SourceProcessingError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 422) {
    super(message);
    this.name = "SourceProcessingError";
    this.code = code;
    this.status = status;
  }
}

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const userId = await getSupabaseUserIdFromRequest(request);

  if (!userId || !/^Bearer\s+.+$/i.test(authorization)) {
    return { error: NextResponse.json({ error: "Accedi nuovamente a Notebook Scuola." }, { status: 401 }) };
  }

  return { authorization };
}

async function callEdge(path: string, authorization: string, body: Record<string, unknown>, timeout = 20_000) {
  const response = await fetch(STUDY_API_SOURCES_URL + "/" + path, {
    method: "POST",
    headers: {
      apikey: STUDY_SUPABASE_PUBLISHABLE_KEY,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });

  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, result };
}

async function markFailed(sourceId: string, authorization: string, failureCode: string) {
  try {
    await callEdge("fail", authorization, {
      source_id: sourceId,
      failure_code: failureCode,
    });
  } catch (error) {
    console.error("[Studio extraction] unable to persist failure state", {
      sourceId,
      message: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
  }
}

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function validateZipArchive(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new SourceProcessingError("Il documento Office non è un archivio ZIP valido.", "invalid_office_archive");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.length - 65_557);
  let eocd = -1;

  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }

  if (eocd < 0) {
    throw new SourceProcessingError("Il documento Office è danneggiato o non leggibile.", "invalid_office_archive");
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (entryCount < 1 || entryCount > 1_000 ||
      centralOffset + centralSize > eocd || centralOffset >= bytes.length) {
    throw new SourceProcessingError("Il documento Office supera i limiti di sicurezza dell'archivio.", "invalid_office_archive");
  }

  let offset = centralOffset;
  let totalUncompressed = 0;
  const decoder = new TextDecoder();

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new SourceProcessingError("Indice ZIP non valido nel documento Office.", "invalid_office_archive");
    }

    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const recordLength = 46 + filenameLength + extraLength + commentLength;

    if (offset + recordLength > bytes.length ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
        uncompressedSize > 15 * 1024 * 1024) {
      throw new SourceProcessingError("Un componente del documento Office è troppo grande.", "invalid_office_archive");
    }

    const filename = decoder.decode(bytes.subarray(offset + 46, offset + 46 + filenameLength));
    if (filename.startsWith("/") || filename.split("/").includes("..")) {
      throw new SourceProcessingError("Il documento Office contiene percorsi non consentiti.", "invalid_office_archive");
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > 50 * 1024 * 1024) {
      throw new SourceProcessingError("Il documento Office è troppo compresso per essere elaborato in sicurezza.", "invalid_office_archive");
    }

    offset += recordLength;
  }

  if (offset > centralOffset + centralSize) {
    throw new SourceProcessingError("Indice ZIP non coerente nel documento Office.", "invalid_office_archive");
  }
}

function extractWordDocument(bytes: Uint8Array): { pages: ExtractedPage[]; pageCount: null } {
  validateZipArchive(bytes);
  let archive: Record<string, Uint8Array>;

  try {
    archive = unzipSync(bytes);
  } catch {
    throw new SourceProcessingError("Il documento Word è danneggiato o non leggibile.", "invalid_office_archive");
  }

  const documentXml = archive["word/document.xml"];
  if (!documentXml) {
    throw new SourceProcessingError("Il file non contiene un documento Word DOCX valido.", "unsupported_document");
  }

  const xml = new TextDecoder().decode(documentXml);
  const raw = xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n\n")
    .replace(/<w:t\b[^>]*>/g, "")
    .replace(/<\/w:t>/g, "")
    .replace(/<[^>]+>/g, "");
  const text = normalizeText(decodeXml(raw));

  if (!text) {
    throw new SourceProcessingError("Il documento Word non contiene testo estraibile.", "no_text_content");
  }

  // DOCX non contiene una paginazione stabile: non inventiamo numeri di pagina.
  return {
    pages: [{ page_index: 0, page_number: null, text }],
    pageCount: null,
  };
}

function extractPowerPoint(bytes: Uint8Array): { pages: ExtractedPage[]; pageCount: number } {
  validateZipArchive(bytes);
  let archive: Record<string, Uint8Array>;

  try {
    archive = unzipSync(bytes);
  } catch {
    throw new SourceProcessingError("La presentazione PowerPoint è danneggiata o non leggibile.", "invalid_office_archive");
  }

  if (!archive["ppt/presentation.xml"]) {
    throw new SourceProcessingError("Il file non contiene una presentazione PPTX valida.", "unsupported_document");
  }

  const slideEntries = Object.keys(archive)
    .map((name) => {
      const match = name.match(/^ppt\/slides\/slide(\d+)\.xml$/);
      return match ? { name, number: Number(match[1]) } : null;
    })
    .filter((entry): entry is { name: string; number: number } => Boolean(entry))
    .sort((a, b) => a.number - b.number);

  if (slideEntries.length < 1 || slideEntries.length > MAX_PAGES) {
    throw new SourceProcessingError("La presentazione non contiene diapositive leggibili o supera il limite beta.", "unsupported_document");
  }

  const pages = slideEntries.flatMap((slide, pageIndex) => {
    const xml = new TextDecoder().decode(archive[slide.name]);
    const raw = xml
      .replace(/<\/a:p>/g, "\n")
      .replace(/<a:t\b[^>]*>/g, "")
      .replace(/<\/a:t>/g, "")
      .replace(/<[^>]+>/g, "");
    const text = normalizeText(decodeXml(raw));
    return text ? [{ page_index: pageIndex, page_number: slide.number, text }] : [];
  });

  if (pages.length === 0) {
    throw new SourceProcessingError("La presentazione non contiene testo estraibile.", "no_text_content");
  }

  return { pages, pageCount: slideEntries.length };
}

async function extractPdf(bytes: Uint8Array): Promise<{ pages: ExtractedPage[]; pageCount: number }> {
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new SourceProcessingError("Il file non ha la firma di un PDF valido.", "invalid_file_signature");
  }

  let pdf;
  try {
    pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password") || message.includes("encrypt")) {
      throw new SourceProcessingError("Il PDF è protetto da password o cifrato.", "encrypted_or_corrupt_pdf");
    }
    throw new SourceProcessingError("Il PDF è danneggiato o non può essere letto.", "encrypted_or_corrupt_pdf");
  }

  const pageCount = pdf.numPages;
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGES) {
    throw new SourceProcessingError("Il PDF supera il limite beta di 1.000 pagine.", "document_too_large");
  }

  try {
    const extracted = await extractText(pdf, { mergePages: false });
    const textPages = Array.isArray(extracted.text)
      ? extracted.text
      : String(extracted.text).split("\f");

    const pages = textPages.map((value, pageIndex) => ({
      page_index: pageIndex,
      page_number: pageIndex + 1,
      text: normalizeText(String(value)),
    })).filter((page) => page.text.length > 0);

    if (pages.length === 0) {
      throw new SourceProcessingError(
        "Questo PDF non contiene testo selezionabile. I PDF composti soltanto da scansioni richiederanno una funzione OCR, non ancora attiva.",
        "no_text_content",
      );
    }

    return { pages, pageCount };
  }
}

async function extractDocument(source: SourceInfo, bytes: Uint8Array) {
  if (source.mime_type === "application/pdf") {
    if (!source.original_filename.toLowerCase().endsWith(".pdf")) {
      throw new SourceProcessingError("Estensione e formato del file non corrispondono.", "unsupported_document");
    }
    return await extractPdf(bytes);
  }

  if (source.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (!source.original_filename.toLowerCase().endsWith(".docx")) {
      throw new SourceProcessingError("Estensione e formato del file non corrispondono.", "unsupported_document");
    }
    return extractWordDocument(bytes);
  }

  if (source.mime_type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    if (!source.original_filename.toLowerCase().endsWith(".pptx")) {
      throw new SourceProcessingError("Estensione e formato del file non corrispondono.", "unsupported_document");
    }
    return extractPowerPoint(bytes);
  }

  throw new SourceProcessingError("Formato non supportato.", "unsupported_document", 415);
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const length = Number(request.headers.get("content-length") || "0");
  if (length > 8_192) {
    return NextResponse.json({ error: "Richiesta troppo grande." }, { status: 413 });
  }

  const body = await request.json().catch(() => null) as { source_id?: unknown } | null;
  const sourceId = typeof body?.source_id === "string" ? body.source_id : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId)) {
    return NextResponse.json({ error: "Documento non valido." }, { status: 400 });
  }

  try {
    const signed = await callEdge("download-url", auth.authorization, { source_id: sourceId });
    if (!signed.response.ok) {
      const message = typeof signed.result.error === "string" ? signed.result.error : "Il file non è disponibile.";
      return NextResponse.json({ error: message }, { status: signed.response.status });
    }

    const source = signed.result.source as SourceInfo | undefined;
    const downloadUrl = typeof signed.result.download_url === "string" ? signed.result.download_url : "";
    if (!source || !downloadUrl) {
      return NextResponse.json({ error: "Il servizio file ha restituito dati incompleti." }, { status: 502 });
    }

    const parsedUrl = new URL(downloadUrl);
    const expectedHost = new URL(STUDY_SUPABASE_URL).hostname;
    if (parsedUrl.hostname !== expectedHost ||
        !parsedUrl.pathname.includes("/storage/v1/object/sign/study-source-files/")) {
      await markFailed(sourceId, auth.authorization, "file_download_failed");
      return NextResponse.json({ error: "Indirizzo di download non valido." }, { status: 502 });
    }

    const fileResponse = await fetch(downloadUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
    if (!fileResponse.ok) {
      await markFailed(sourceId, auth.authorization, "file_download_failed");
      return NextResponse.json({ error: "Non è stato possibile recuperare il file privato." }, { status: 502 });
    }

    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    if (bytes.length < 1 || bytes.length > MAX_FILE_BYTES || bytes.length !== Number(source.byte_size)) {
      await markFailed(sourceId, auth.authorization, "document_too_large");
      return NextResponse.json({ error: "Il file ricevuto non corrisponde alla dimensione dichiarata o supera 20 MB." }, { status: 413 });
    }

    const extracted = await extractDocument(source, bytes);
    const totalChars = extracted.pages.reduce((total, page) => total + page.text.length, 0);
    if (totalChars < 1) {
      throw new SourceProcessingError("Non è stato trovato testo estraibile.", "no_text_content");
    }
    if (totalChars > MAX_EXTRACTED_CHARS) {
      throw new SourceProcessingError("Il documento contiene più di 2 milioni di caratteri: limite beta superato.", "document_too_large", 413);
    }

    // Invia gruppi piccoli: evita limiti di payload e consente di gestire
    // PDF lunghi senza accumulare l'intero testo in una singola richiesta.
    const encoder = new TextEncoder();
    const batches: ExtractedPage[][] = [];
    let currentBatch: ExtractedPage[] = [];
    let currentBytes = 0;
    const MAX_BATCH_BYTES = 450_000;

    for (const page of extracted.pages) {
      const pageBytes = encoder.encode(JSON.stringify(page)).byteLength;
      if (pageBytes > 1_000_000) {
        throw new SourceProcessingError("Una pagina supera la dimensione massima di elaborazione.", "document_too_large", 413);
      }
      if (currentBatch.length > 0 &&
          (currentBytes + pageBytes > MAX_BATCH_BYTES || currentBatch.length >= 100)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBytes = 0;
      }
      currentBatch.push(page);
      currentBytes += pageBytes;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    let completedResult: Record<string, unknown> = {};
    for (let index = 0; index < batches.length; index += 1) {
      const completed = await callEdge("complete", auth.authorization, {
        source_id: sourceId,
        page_count: extracted.pageCount,
        pages: batches[index],
        is_final: index === batches.length - 1,
      }, 40_000);

      if (!completed.response.ok) {
        const message = typeof completed.result.error === "string"
          ? completed.result.error
          : "Non è stato possibile salvare il testo estratto.";
        await markFailed(sourceId, auth.authorization, "extraction_error");
        return NextResponse.json({ error: message }, { status: completed.response.status });
      }
      completedResult = completed.result;
    }

    return NextResponse.json(completedResult, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SourceProcessingError) {
      await markFailed(sourceId, auth.authorization, error.code);
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("[Studio extraction] processing failed", {
      sourceId,
      message: error instanceof Error ? error.message.slice(0, 220) : "unknown",
    });
    await markFailed(sourceId, auth.authorization, "extraction_error");
    return NextResponse.json(
      { error: "L'estrazione del documento non è riuscita. Riprova o carica un altro file." },
      { status: 500 },
    );
  }
}
