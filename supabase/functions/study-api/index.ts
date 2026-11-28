import { createClient } from "npm:@supabase/supabase-js@2.80.0";

// L'identità resta quella del progetto Auth già usato da Notebook Scuola.
const PRIMARY_AUTH_URL = "https://wjdaeyerqkqebhtslgjm.supabase.co";
const PRIMARY_AUTH_PUBLISHABLE_KEY = "sb_publishable_AdqGMjewmnG5ghUThnpWvA_4e2F520J";

const STUDY_URL = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const STUDY_SECRET_KEY =
  secretKeys.default ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

if (!STUDY_URL || !STUDY_SECRET_KEY) {
  throw new Error("Missing Supabase server environment configuration");
}

const BUCKET = "study-source-files";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCES_PER_WORKSPACE = 25;
const MAX_WORKSPACE_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 2_000_000;
const CHUNK_TARGET_CHARS = 1_800;
const CHUNK_OVERLAP_CHARS = 220;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const primaryAuth = createClient(PRIMARY_AUTH_URL, PRIMARY_AUTH_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const adminFetch: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (STUDY_SECRET_KEY.startsWith("sb_secret_")) {
    headers.delete("Authorization");
    headers.set("apikey", STUDY_SECRET_KEY);
  }
  return fetch(input, { ...init, headers });
};

const studyAdmin = createClient(STUDY_URL, STUDY_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { fetch: adminFetch },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readJson(request: Request, maxBytes = 8_192) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new Error("REQUEST_TOO_LARGE");
  const parsed: unknown = await request.json();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_BODY");
  }
  return parsed as Record<string, unknown>;
}

async function getPrimaryUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const { data, error } = await primaryAuth.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user;
}

function safeFilename(value: string) {
  const base = value.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^\.+/, "").slice(0, 120);
  return base || "document";
}

function isExpectedExtension(filename: string, mime: string) {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf") return lower.endsWith(".pdf");
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return lower.endsWith(".docx");
  }
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return lower.endsWith(".pptx");
  }
  return false;
}

async function listWorkspaces(userId: string) {
  const { data, error } = await studyAdmin
    .from("study_workspaces")
    .select("id,title,subject,education_level,description,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[study-api] list workspaces failed", error.code ?? "unknown");
    return json({ error: "Non è stato possibile caricare i notebook personali." }, 500);
  }
  return json({ workspaces: data ?? [] });
}

async function createWorkspace(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8_192);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "REQUEST_TOO_LARGE"
      ? "Richiesta troppo grande." : "Dati del notebook non validi." }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : null;
  const level = typeof body.education_level === "string" ? body.education_level.trim() : null;
  const description = typeof body.description === "string" ? body.description.trim() : null;

  if (title.length < 1 || title.length > 120) {
    return json({ error: "Il titolo deve contenere da 1 a 120 caratteri." }, 400);
  }
  if (subject !== null && subject.length > 60) {
    return json({ error: "La materia è troppo lunga." }, 400);
  }
  if (level !== null && !["Medie", "Superiori", "Università", "Altro"].includes(level)) {
    return json({ error: "Il livello scolastico non è valido." }, 400);
  }
  if (description !== null && description.length > 1200) {
    return json({ error: "La descrizione supera 1200 caratteri." }, 400);
  }

  const { data, error } = await studyAdmin.rpc("create_study_workspace_with_quota", {
    p_user_id: userId,
    p_title: title,
    p_subject: subject,
    p_education_level: level,
    p_description: description,
  });

  if (error) {
    if (error.message?.includes("STUDY_WORKSPACE_LIMIT_REACHED")) {
      return json({ error: "Nella beta puoi creare al massimo 5 notebook personali." }, 429);
    }
    console.error("[study-api] create workspace failed", error.code ?? "unknown");
    return json({ error: "Non è stato possibile creare il notebook." }, 500);
  }

  const workspace = Array.isArray(data) ? data[0] : data;
  if (!workspace) return json({ error: "Non è stato possibile creare il notebook." }, 500);
  return json({ workspace }, 201);
}

async function removeStoredFiles(paths: string[]) {
  if (paths.length === 0) return null;
  const { error } = await studyAdmin.storage.from(BUCKET).remove(paths);
  if (!error) return null;
  const status = String((error as { statusCode?: string }).statusCode ?? "");
  if (status === "404" || /not found|does not exist/i.test(error.message ?? "")) return null;
  return error;
}

async function deleteWorkspace(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8_192);
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }

  const workspaceId = body.workspace_id;
  if (!isUuid(workspaceId)) return json({ error: "Notebook non valido." }, 400);

  const { data: sources, error: sourceError } = await studyAdmin
    .from("study_sources")
    .select("storage_path")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (sourceError) {
    console.error("[study-api] list source paths failed", sourceError.code ?? "unknown");
    return json({ error: "Non è stato possibile preparare l'eliminazione dei file." }, 500);
  }

  const storageError = await removeStoredFiles((sources ?? []).map((source) => source.storage_path));
  if (storageError) {
    console.error("[study-api] storage cleanup failed", storageError.message);
    return json({ error: "Non è stato possibile rimuovere tutti i file. Il notebook non è stato eliminato." }, 500);
  }

  const { data, error } = await studyAdmin
    .from("study_workspaces")
    .delete()
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[study-api] delete workspace failed", error.code ?? "unknown");
    return json({ error: "Non è stato possibile eliminare il notebook." }, 500);
  }
  if (!data) return json({ error: "Notebook non trovato." }, 404);
  return json({ deleted: true });
}

const SOURCE_SELECT = "id,workspace_id,original_filename,mime_type,byte_size,status,page_count,extracted_char_count,chunk_count,chunked_at,failure_code,created_at,processed_at";

async function listSources(request: Request, userId: string) {
  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!isUuid(workspaceId)) return json({ error: "Notebook non valido." }, 400);

  const { data: workspace, error: workspaceError } = await studyAdmin
    .from("study_workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (workspaceError || !workspace) return json({ error: "Notebook non trovato." }, 404);

  const { data, error } = await studyAdmin
    .from("study_sources")
    .select(SOURCE_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[study-api] list sources failed", error.code ?? "unknown");
    return json({ error: "Non è stato possibile caricare i documenti." }, 500);
  }
  return json({ sources: data ?? [] });
}

async function createSource(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8_192);
  } catch {
    return json({ error: "Dati del documento non validi." }, 400);
  }

  const workspaceId = body.workspace_id;
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const mimeType = typeof body.mime_type === "string" ? body.mime_type : "";
  const byteSize = Number(body.byte_size);

  if (!isUuid(workspaceId)) return json({ error: "Notebook non valido." }, 400);
  if (!filename || filename.length > 255 || filename.includes("/") || filename.includes("\\")) {
    return json({ error: "Nome del file non valido." }, 400);
  }
  if (!ALLOWED_MIME.has(mimeType) || !isExpectedExtension(filename, mimeType)) {
    return json({ error: "Sono supportati soltanto file PDF, DOCX e PPTX validi." }, 415);
  }
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_FILE_BYTES) {
    return json({ error: "Ogni documento deve pesare al massimo 20 MB." }, 413);
  }

  const { data: workspace, error: workspaceError } = await studyAdmin
    .from("study_workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (workspaceError || !workspace) return json({ error: "Notebook non trovato." }, 404);

  const sourceId = crypto.randomUUID();
  const storagePath = userId + "/" + workspaceId + "/" + sourceId + "/" + safeFilename(filename);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data: insertedData, error: insertError } = await studyAdmin.rpc("create_study_source_with_quota", {
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_source_id: sourceId,
    p_filename: filename,
    p_storage_path: storagePath,
    p_mime_type: mimeType,
    p_byte_size: byteSize,
    p_upload_expires_at: expiresAt,
  });

  if (insertError) {
    if (insertError.message?.includes("STUDY_WORKSPACE_NOT_FOUND")) {
      return json({ error: "Notebook non trovato." }, 404);
    }
    if (insertError.message?.includes("STUDY_SOURCE_LIMIT_REACHED")) {
      return json({ error: "Nella beta puoi caricare al massimo 25 documenti per notebook." }, 429);
    }
    if (insertError.message?.includes("STUDY_WORKSPACE_FILE_LIMIT_REACHED")) {
      return json({ error: "Hai raggiunto il limite beta di 100 MB per questo notebook." }, 429);
    }
    if (insertError.message?.includes("STUDY_SOURCE_SIZE_INVALID")) {
      return json({ error: "Ogni documento deve pesare al massimo 20 MB." }, 413);
    }
    console.error("[study-api] create source record failed", insertError.code ?? "unknown");
    return json({ error: "Non è stato possibile preparare il caricamento." }, 500);
  }

  const inserted = Array.isArray(insertedData) ? insertedData[0] : insertedData;
  if (!inserted) {
    return json({ error: "Non è stato possibile preparare il caricamento." }, 500);
  }

  const { data: signedUpload, error: signedError } = await studyAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedError || !signedUpload?.token) {
    await studyAdmin.from("study_sources").delete().eq("id", sourceId).eq("user_id", userId);
    console.error("[study-api] create signed upload failed", signedError?.message ?? "missing token");
    return json({ error: "Non è stato possibile autorizzare il caricamento sicuro." }, 502);
  }

  return json({
    source: inserted,
    upload: { path: signedUpload.path, token: signedUpload.token },
  }, 201);
}

async function getSourceDownloadUrl(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8_192);
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }

  const sourceId = body.source_id;
  if (!isUuid(sourceId)) return json({ error: "Documento non valido." }, 400);

  const { data: source, error } = await studyAdmin
    .from("study_sources")
    .select("id,original_filename,mime_type,byte_size,storage_path,status,upload_expires_at")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !source) return json({ error: "Documento non trovato." }, 404);
  if (!["uploaded", "failed"].includes(source.status)) {
    return json({ error: "Questo documento è già stato elaborato." }, 409);
  }
  if (new Date(source.upload_expires_at).getTime() < Date.now()) {
    return json({ error: "Il caricamento è scaduto. Elimina la voce e carica di nuovo il documento." }, 410);
  }

  const { data, error: signedError } = await studyAdmin.storage
    .from(BUCKET)
    .createSignedUrl(source.storage_path, 300);

  if (signedError || !data?.signedUrl) {
    console.error("[study-api] create signed download failed", signedError?.message ?? "unknown");
    return json({ error: "Il file non è disponibile nello spazio privato." }, 404);
  }

  return json({
    source: {
      id: source.id,
      original_filename: source.original_filename,
      mime_type: source.mime_type,
      byte_size: source.byte_size,
    },
    download_url: data.signedUrl,
  });
}

async function completeSource(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 2 * 1024 * 1024);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "REQUEST_TOO_LARGE"
      ? "Il gruppo di pagine estratte supera il limite consentito." : "Dati estratti non validi." }, 413);
  }

  const sourceId = body.source_id;
  const pages = body.pages;
  const pageCount = body.page_count;
  const isFinal = body.is_final === true;

  if (!isUuid(sourceId) || !Array.isArray(pages) || pages.length < 1 || pages.length > 100) {
    return json({ error: "Gruppo di pagine estratte non valido." }, 400);
  }
  if (pageCount !== null && pageCount !== undefined &&
      (!Number.isInteger(pageCount) || Number(pageCount) < 1 || Number(pageCount) > 10_000)) {
    return json({ error: "Numero di pagine non valido." }, 400);
  }

  const { data: source, error: sourceError } = await studyAdmin
    .from("study_sources")
    .select("id,workspace_id,user_id,status")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sourceError || !source) return json({ error: "Documento non trovato." }, 404);
  if (source.status === "extracted" || source.status === "ready") {
    return json({ extracted: true, source_id: sourceId, already_processed: true });
  }
  if (!["uploaded", "processing", "failed"].includes(source.status)) {
    return json({ error: "Il documento non è in uno stato elaborabile." }, 409);
  }

  const rows: Array<Record<string, unknown>> = [];
  let batchChars = 0;
  let previousIndex = -1;

  for (const candidate of pages) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return json({ error: "Una pagina estratta non è valida." }, 400);
    }
    const page = candidate as Record<string, unknown>;
    const pageIndex = page.page_index;
    const pageNumber = page.page_number;
    const text = typeof page.text === "string" ? page.text.trim() : "";

    if (!Number.isInteger(pageIndex) || Number(pageIndex) < 0 ||
        Number(pageIndex) > 10_000 || Number(pageIndex) <= previousIndex ||
        (pageNumber !== null && pageNumber !== undefined &&
          (!Number.isInteger(pageNumber) || Number(pageNumber) < 1 || Number(pageNumber) > 10_000)) ||
        !text || text.length > 200_000) {
      return json({ error: "Il testo estratto contiene una pagina non valida." }, 400);
    }

    previousIndex = Number(pageIndex);
    batchChars += text.length;
    rows.push({
      source_id: sourceId,
      workspace_id: source.workspace_id,
      user_id: userId,
      page_index: Number(pageIndex),
      page_number: pageNumber === null || pageNumber === undefined ? null : Number(pageNumber),
      content: text,
    });
  }

  if (batchChars > 500_000) {
    return json({ error: "Il gruppo di pagine è troppo grande. Riprova con un gruppo più piccolo." }, 413);
  }

  const { error: statusError } = await studyAdmin
    .from("study_sources")
    .update({ status: "processing", failure_code: null })
    .eq("id", sourceId)
    .eq("user_id", userId);

  if (statusError) {
    console.error("[study-api] mark source processing failed", statusError.code ?? "unknown");
    return json({ error: "Non è stato possibile salvare il testo estratto." }, 500);
  }

  const { error: pagesError } = await studyAdmin
    .from("study_source_pages")
    .upsert(rows, { onConflict: "source_id,page_index" });

  if (pagesError) {
    await studyAdmin.from("study_sources").update({
      status: "failed",
      failure_code: "extraction_storage_error",
    }).eq("id", sourceId).eq("user_id", userId);
    console.error("[study-api] persist extracted pages failed", pagesError.code ?? "unknown");
    return json({ error: "Il testo è stato estratto ma non è stato possibile salvarlo." }, 500);
  }

  if (!isFinal) {
    return json({ saved: true, source_id: sourceId, batch_pages: rows.length });
  }

  const { data: allPages, error: countError } = await studyAdmin
    .from("study_source_pages")
    .select("page_index,content")
    .eq("source_id", sourceId)
    .eq("user_id", userId)
    .order("page_index", { ascending: true })
    .limit(1_000);

  if (countError || !allPages?.length) {
    await studyAdmin.from("study_sources").update({
      status: "failed",
      failure_code: "extraction_storage_error",
    }).eq("id", sourceId).eq("user_id", userId);
    console.error("[study-api] verify extracted pages failed", countError?.code ?? "empty");
    return json({ error: "Non è stato possibile verificare tutte le pagine estratte." }, 500);
  }

  const totalChars = allPages.reduce((total, page) => total + page.content.length, 0);
  if (totalChars > 2_000_000) {
    await studyAdmin.from("study_source_pages").delete().eq("source_id", sourceId).eq("user_id", userId);
    await studyAdmin.from("study_sources").update({
      status: "failed",
      failure_code: "document_too_large",
    }).eq("id", sourceId).eq("user_id", userId);
    return json({ error: "Il documento contiene più di 2 milioni di caratteri: limite beta superato." }, 413);
  }

  const finalPageCount = pageCount === null || pageCount === undefined ? null : Number(pageCount);
  const { data: updated, error: updateError } = await studyAdmin
    .from("study_sources")
    .update({
      status: "extracted",
      page_count: finalPageCount,
      extracted_char_count: totalChars,
      processed_at: new Date().toISOString(),
      failure_code: null,
    })
    .eq("id", sourceId)
    .eq("user_id", userId)
    .select(SOURCE_SELECT)
    .single();

  if (updateError || !updated) {
    await studyAdmin.from("study_sources").update({
      status: "failed",
      failure_code: "extraction_storage_error",
    }).eq("id", sourceId).eq("user_id", userId);
    console.error("[study-api] finalize source failed", updateError?.code ?? "unknown");
    return json({ error: "Non è stato possibile completare l'elaborazione del documento." }, 500);
  }

  return json({ extracted: true, source: updated, page_rows: allPages.length, extracted_char_count: totalChars });
}

async function failSource(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8_192);
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }
  const sourceId = body.source_id;
  const allowedCodes = new Set([
    "file_download_failed",
    "invalid_file_signature",
    "invalid_office_archive",
    "unsupported_document",
    "encrypted_or_corrupt_pdf",
    "no_text_content",
    "document_too_large",
    "extraction_error",
  ]);
  const failureCode = typeof body.failure_code === "string" && allowedCodes.has(body.failure_code)
    ? body.failure_code
    : "extraction_error";

  if (!isUuid(sourceId)) return json({ error: "Documento non valido." }, 400);

  const { data, error } = await studyAdmin
    .from("study_sources")
    .update({ status: "failed", failure_code: failureCode })
    .eq("id", sourceId)
    .eq("user_id", userId)
    .in("status", ["uploaded", "processing", "failed"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[study-api] mark source failed", error.code ?? "unknown");
    return json({ error: "Non è stato possibile aggiornare lo stato del documento." }, 500);
  }
  if (!data) return json({ error: "Documento non trovato o già elaborato." }, 404);
  return json({ failed: true });
}

async function deleteSource(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8_192);
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }
  const sourceId = body.source_id;
  if (!isUuid(sourceId)) return json({ error: "Documento non valido." }, 400);

  const { data: source, error: sourceError } = await studyAdmin
    .from("study_sources")
    .select("id,storage_path")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sourceError || !source) return json({ error: "Documento non trovato." }, 404);

  const storageError = await removeStoredFiles([source.storage_path]);
  if (storageError) {
    console.error("[study-api] delete source storage failed", storageError.message);
    return json({ error: "Non è stato possibile eliminare il file originale. Il documento è ancora presente." }, 500);
  }

  const { error } = await studyAdmin
    .from("study_sources")
    .delete()
    .eq("id", sourceId)
    .eq("user_id", userId);

  if (error) {
    console.error("[study-api] delete source record failed", error.code ?? "unknown");
    return json({ error: "Il file è stato rimosso ma non è stato possibile eliminare i relativi dati." }, 500);
  }

  return json({ deleted: true });
}


function normalizePageForChunking(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findChunkBoundary(value: string, start: number) {
  const hardEnd = Math.min(start + CHUNK_TARGET_CHARS, value.length);
  if (hardEnd >= value.length) return hardEnd;
  const earliest = start + Math.floor((hardEnd - start) * 0.62);
  const window = value.slice(earliest, hardEnd);
  const paragraphBreak = window.lastIndexOf("\n\n");
  if (paragraphBreak >= 0) return earliest + paragraphBreak + 2;

  let sentenceEnd = -1;
  for (const match of window.matchAll(/[.!?;:][)"'’”»\]]*\s+/g)) {
    sentenceEnd = match.index! + match[0].length;
  }
  if (sentenceEnd >= 0) return earliest + sentenceEnd;

  const lineBreak = window.lastIndexOf("\n");
  if (lineBreak >= 0) return earliest + lineBreak + 1;
  const whitespace = window.lastIndexOf(" ");
  if (whitespace >= 0) return earliest + whitespace + 1;
  return hardEnd;
}

function buildPageChunks(
  page: { page_index: number; page_number: number | null; content: string },
  nextChunkIndex: number,
) {
  const value = normalizePageForChunking(page.content);
  if (!value) return [];

  const local: Array<{ start: number; content: string }> = [];
  let start = 0;
  while (start < value.length) {
    const end = findChunkBoundary(value, start);
    const chunkContent = value.slice(start, end).trim();
    if (chunkContent) local.push({ start, content: chunkContent });
    if (end >= value.length) break;

    const nextStart = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
    const remaining = value.length - nextStart;
    if (local.length > 0 && remaining <= CHUNK_TARGET_CHARS * 0.55) {
      const previous = local[local.length - 1];
      previous.content = value.slice(previous.start).trim();
      break;
    }
    start = nextStart;
  }

  return local.map((chunk, index) => ({
    chunk_index: nextChunkIndex + index,
    content: chunk.content,
    page_start: page.page_number,
    page_end: page.page_number,
  }));
}

function buildSourceChunks(pages: Array<{
  page_index: number;
  page_number: number | null;
  content: string;
}>) {
  const chunks: Array<{
    chunk_index: number;
    content: string;
    page_start: number | null;
    page_end: number | null;
  }> = [];
  for (const page of pages) chunks.push(...buildPageChunks(page, chunks.length));

  if (chunks.length < 1 || chunks.length > 2_000) {
    throw new Error("STUDY_CHUNKS_COUNT_INVALID");
  }
  const totalChunkChars = chunks.reduce((total, chunk) => total + chunk.content.length, 0);
  if (totalChunkChars > 4_000_000) throw new Error("STUDY_CHUNKS_TOO_LARGE");
  return chunks;
}

async function chunkSource(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8_192);
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }

  const sourceId = body.source_id;
  if (!isUuid(sourceId)) return json({ error: "Documento non valido." }, 400);

  const { data: source, error: sourceError } = await studyAdmin
    .from("study_sources")
    .select("id,workspace_id,status,page_count,extracted_char_count")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sourceError || !source) return json({ error: "Documento non trovato." }, 404);
  if (source.status !== "extracted") {
    return json({ error: "Il documento deve avere il testo estratto prima di poter creare i segmenti." }, 409);
  }

  const { data: pages, error: pagesError } = await studyAdmin
    .from("study_source_pages")
    .select("page_index,page_number,content")
    .eq("source_id", sourceId)
    .eq("workspace_id", source.workspace_id)
    .eq("user_id", userId)
    .order("page_index", { ascending: true })
    .limit(1_000);

  if (pagesError) {
    console.error("[study-api] load pages for chunking failed", pagesError.code ?? "unknown");
    return json({ error: "Non è stato possibile leggere il testo estratto." }, 500);
  }
  if (!pages?.length) return json({ error: "Il documento non contiene pagine di testo da organizzare." }, 422);

  const sourceChars = pages.reduce((total, page) => total + page.content.length, 0);
  if (sourceChars < 1 || sourceChars > MAX_EXTRACTED_CHARS) {
    return json({ error: "Il testo estratto non rientra nei limiti di elaborazione." }, 413);
  }

  let chunks: ReturnType<typeof buildSourceChunks>;
  try {
    chunks = buildSourceChunks(pages);
  } catch (error) {
    if (error instanceof Error && error.message === "STUDY_CHUNKS_COUNT_INVALID") {
      return json({ error: "Il documento genera un numero di segmenti superiore al limite beta." }, 413);
    }
    return json({ error: "Non è stato possibile suddividere il testo in segmenti." }, 422);
  }

  const { data, error } = await studyAdmin.rpc("replace_study_source_chunks", {
    p_user_id: userId,
    p_workspace_id: source.workspace_id,
    p_source_id: sourceId,
    p_chunks: chunks,
  });
  if (error) {
    console.error("[study-api] persist source chunks failed", error.code ?? "unknown");
    return json({ error: "I segmenti sono stati preparati ma non è stato possibile salvarli." }, 500);
  }

  const chunkCount = Number(data);
  if (!Number.isInteger(chunkCount) || chunkCount !== chunks.length) {
    console.error("[study-api] chunk count mismatch", { sourceId, expected: chunks.length });
    return json({ error: "Il numero dei segmenti salvati non corrisponde a quello previsto." }, 500);
  }

  return json({
    source_id: sourceId,
    chunk_count: chunkCount,
    extracted_char_count: sourceChars,
    page_count: source.page_count,
    embedding_status: "not_generated",
  });
}

Deno.serve(async (request: Request) => {
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return json({ error: "Metodo non supportato." }, 405);
  }

  const user = await getPrimaryUser(request);
  if (!user) return json({ error: "Sessione non valida o scaduta." }, 401);

  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const functionIndex = segments.lastIndexOf("study-api");
  const route = functionIndex >= 0
    ? segments.slice(functionIndex + 1).join("/")
    : segments.slice(-2).join("/");

  if (route === "workspaces") {
    if (request.method === "GET") return await listWorkspaces(user.id);
    if (request.method === "POST") return await createWorkspace(request, user.id);
    return await deleteWorkspace(request, user.id);
  }

  if (route === "sources" && request.method === "GET") return await listSources(request, user.id);
  if (route === "sources/chunk" && request.method === "POST") return await chunkSource(request, user.id);
  if (route === "sources" && request.method === "POST") return await createSource(request, user.id);
  if (route === "sources" && request.method === "DELETE") return await deleteSource(request, user.id);
  if (route === "sources/download-url" && request.method === "POST") {
    return await getSourceDownloadUrl(request, user.id);
  }
  if (route === "sources/complete" && request.method === "POST") {
    return await completeSource(request, user.id);
  }
  if (route === "sources/fail" && request.method === "POST") return await failSource(request, user.id);

  return json({ error: "Endpoint non trovato." }, 404);
});
