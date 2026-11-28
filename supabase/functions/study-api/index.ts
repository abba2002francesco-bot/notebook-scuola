import { createClient } from "npm:@supabase/supabase-js@2.80.0";

// L'identità resta quella del progetto Auth già usato da Notebook Scuola.
const PRIMARY_AUTH_URL = "https://wjdaeyerqkqebhtslgjm.supabase.co";
const PRIMARY_AUTH_PUBLISHABLE_KEY = "sb_publishable_AdqGMjewmnG5ghUThnpWvA";

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

const SOURCE_SELECT = "id,workspace_id,original_filename,mime_type,byte_size,status,page_count,extracted_char_count,failure_code,created_at,processed_at";

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

  const { data: existing, error: quotaError } = await studyAdmin
    .from("study_sources")
    .select("byte_size")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(MAX_SOURCES_PER_WORKSPACE + 1);

  if (quotaError) return json({ error: "Non è stato possibile verificare lo spazio disponibile." }, 500);
  const existingBytes = (existing ?? []).reduce((total, item) => total + Number(item.byte_size || 0), 0);
  if ((existing?.length ?? 0) >= MAX_SOURCES_PER_WORKSPACE) {
    return json({ error: "Nella beta puoi caricare al massimo 25 documenti per notebook." }, 429);
  }
  if (existingBytes + byteSize > MAX_WORKSPACE_BYTES) {
    return json({ error: "Hai raggiunto il limite beta di 100 MB per questo notebook." }, 429);
  }

  const sourceId = crypto.randomUUID();
  const storagePath = userId + "/" + workspaceId + "/" + sourceId + "/" + safeFilename(filename);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data: inserted, error: insertError } = await studyAdmin
    .from("study_sources")
    .insert({
      id: sourceId,
      workspace_id: workspaceId,
      user_id: userId,
      original_filename: filename,
      storage_path: storagePath,
      mime_type: mimeType,
      byte_size: byteSize,
      status: "uploaded",
      upload_expires_at: expiresAt,
    })
    .select(SOURCE_SELECT)
    .single();

  if (insertError || !inserted) {
    console.error("[study-api] create source record failed", insertError?.code ?? "unknown");
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
    body = await readJson(request, 6 * 1024 * 1024);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "REQUEST_TOO_LARGE"
      ? "Il testo estratto supera il limite consentito." : "Dati estratti non validi." }, 413);
  }

  const sourceId = body.source_id;
  const pages = body.pages;
  const pageCount = body.page_count;
  if (!isUuid(sourceId) || !Array.isArray(pages) || pages.length < 1 || pages.length > 1_000) {
    return json({ error: "Risultato dell'estrazione non valido." }, 400);
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
  if (!["uploaded", "processing"].includes(source.status)) {
    return json({ error: "Il documento non è in uno stato elaborabile." }, 409);
  }

  const rows: Array<Record<string, unknown>> = [];
  let totalChars = 0;
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
    totalChars += text.length;
    if (totalChars > 2_000_000) {
      return json({ error: "Il documento contiene troppo testo per la beta (massimo 2 milioni di caratteri)." }, 413);
    }

    rows.push({
      source_id: sourceId,
      workspace_id: source.workspace_id,
      user_id: userId,
      page_index: Number(pageIndex),
      page_number: pageNumber === null || pageNumber === undefined ? null : Number(pageNumber),
      content: text,
    });
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

  await studyAdmin.from("study_source_pages").delete().eq("source_id", sourceId).eq("user_id", userId);

  const { error: pagesError } = await studyAdmin.from("study_source_pages").insert(rows);
  if (pagesError) {
    await studyAdmin.from("study_source_pages").delete().eq("source_id", sourceId).eq("user_id", userId);
    await studyAdmin.from("study_sources").update({
      status: "failed",
      failure_code: "extraction_storage_error",
    }).eq("id", sourceId).eq("user_id", userId);
    console.error("[study-api] persist extracted pages failed", pagesError.code ?? "unknown");
    return json({ error: "Il testo è stato estratto ma non è stato possibile salvarlo." }, 500);
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
    await studyAdmin.from("study_source_pages").delete().eq("source_id", sourceId).eq("user_id", userId);
    await studyAdmin.from("study_sources").update({
      status: "failed",
      failure_code: "extraction_storage_error",
    }).eq("id", sourceId).eq("user_id", userId);
    console.error("[study-api] finalize source failed", updateError?.code ?? "unknown");
    return json({ error: "Non è stato possibile completare l'elaborazione del documento." }, 500);
  }

  return json({ extracted: true, source: updated, page_rows: rows.length, extracted_char_count: totalChars });
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
    : segments.slice(-1)[0] ?? "";

  if (route === "workspaces") {
    if (request.method === "GET") return await listWorkspaces(user.id);
    if (request.method === "POST") return await createWorkspace(request, user.id);
    return await deleteWorkspace(request, user.id);
  }

  if (route === "sources" && request.method === "GET") return await listSources(request, user.id);
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
