import { createClient } from "npm:@supabase/supabase-js@2.80.0";

// L'identità resta quella del progetto Auth già usato da Notebook Scuola.
// Questi due valori sono pubblici (URL + publishable key), non credenziali server.
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

// Verifica i token contro l'Auth principale, non contro l'Auth vuota del DB di sviluppo.
const primaryAuth = createClient(
  PRIMARY_AUTH_URL,
  PRIMARY_AUTH_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);

// Il client amministrativo vive esclusivamente nell'Edge Function.
// Per i secret key moderni, invia la chiave soltanto come apikey (non come Bearer JWT).
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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
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

async function getPrimaryUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  // getUser() verifica il JWT con il server Auth primario. Non fidarsi dei claim
  // letti soltanto dal client o decodificati senza verifica della firma.
  const { data, error } = await primaryAuth.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user;
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
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 8_192) return json({ error: "Richiesta troppo grande." }, 413);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Dati del notebook non validi." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Dati del notebook non validi." }, 400);
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

  // Quota beta atomica: lock transazionale per utente, così richieste simultanee
  // non possono superare il limite di 5 notebook.
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

async function deleteWorkspace(request: Request, userId: string) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Richiesta non valida." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }

  const workspaceId = body.workspace_id;
  if (!isUuid(workspaceId)) return json({ error: "Notebook non valido." }, 400);

  // L'ownership filter è obbligatorio: il service role bypassa RLS.
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

  // I record figli vengono eliminati tramite FK ON DELETE CASCADE.
  // La pulizia degli oggetti Storage sarà aggiunta insieme alla funzione upload.
  return json({ deleted: true });
}

Deno.serve(async (request: Request) => {
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return json({ error: "Metodo non supportato." }, 405);
  }

  // verify_jwt è disabilitato nella configurazione della funzione perché il
  // token appartiene al progetto Auth primario. L'autenticazione è verificata
  // qui esplicitamente con primaryAuth.auth.getUser(), prima di usare service role.
  const user = await getPrimaryUser(request);
  if (!user) return json({ error: "Sessione non valida o scaduta." }, 401);

  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  if (segments.at(-1) !== "workspaces") {
    return json({ error: "Endpoint non trovato." }, 404);
  }

  if (request.method === "GET") return await listWorkspaces(user.id);
  if (request.method === "POST") return await createWorkspace(request, user.id);
  return await deleteWorkspace(request, user.id);
});
