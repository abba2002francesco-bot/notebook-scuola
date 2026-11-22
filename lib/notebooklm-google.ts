import { createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const GOOGLE_CONNECTION_COOKIE = "notebooklm_google_connection";
export const GOOGLE_STATE_COOKIE = "notebooklm_google_oauth_state";
export const NOTEBOOK_READONLY_SCOPE = "https://www.googleapis.com/auth/notebook.readonly";

export type GoogleConnection = {
  userId: string;
  refreshToken: string;
  createdAt: number;
};

type OAuthState = {
  userId: string;
  issuedAt: number;
  nonce: string;
  returnTo: "/carica";
};

function getStateSecret() {
  const value = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Configurazione mancante: GOOGLE_OAUTH_STATE_SECRET deve contenere almeno 32 caratteri.");
  }
  return value;
}

function getEncryptionKey() {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Configurazione mancante: GOOGLE_TOKEN_ENCRYPTION_KEY.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY deve essere una chiave Base64 da 32 byte (generata con openssl rand -base64 32).");
  }
  return key;
}

export function getGoogleRedirectUri() {
  const value = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!value) throw new Error("Configurazione mancante: GOOGLE_OAUTH_REDIRECT_URI.");
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.pathname.endsWith("/api/google/callback")) {
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI deve essere l'URL HTTPS completo che termina con /api/google/callback.");
  }
  return url.toString();
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  return new URL(getGoogleRedirectUri()).origin;
}

export function createOAuthState(userId: string) {
  const payload: OAuthState = {
    userId,
    issuedAt: Date.now(),
    nonce: randomBytes(18).toString("base64url"),
    returnTo: "/carica",
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(value: string): OAuthState | null {
  try {
    const [encoded, receivedSignature] = value.split(".");
    if (!encoded || !receivedSignature) return null;
    const expected = createHmac("sha256", getStateSecret()).update(encoded).digest();
    const received = Buffer.from(receivedSignature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
    if (!payload.userId || !payload.issuedAt || !payload.nonce || payload.returnTo !== "/carica") return null;
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function encryptGoogleConnection(connection: GoogleConnection) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(connection), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGoogleConnection(value: string): GoogleConnection | null {
  try {
    const [version, ivText, tagText, encryptedText] = value.split(".");
    if (version !== "v1" || !ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const connection = JSON.parse(plaintext) as GoogleConnection;
    if (!connection.userId || !connection.refreshToken || !connection.createdAt) return null;
    return connection;
  } catch {
    return null;
  }
}

export async function getSupabaseUserIdFromRequest(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Configura GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET su Vercel.");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !json.access_token) {
    if (json.error === "invalid_grant") {
      throw new Error("L'autorizzazione Google è scaduta o è stata revocata. Scollega e collega di nuovo l'account Google.");
    }
    throw new Error("Google non ha rinnovato l'accesso. Riprova a collegare l'account Google.");
  }
  return json.access_token;
}

export function isAllowedNotebookLmUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.port === "" &&
      ["notebooklm.google.com", "notebooklm.link.google"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function extractLinkIds(raw: string) {
  const url = new URL(raw);
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const ids = new Set<string>();
  for (const segment of segments) {
    if (/^[A-Za-z0-9_-]{6,128}$/.test(segment)) ids.add(segment);
  }
  for (const key of ["id", "notebook", "notebookId"]) {
    const value = url.searchParams.get(key);
    if (value && /^[A-Za-z0-9_-]{6,128}$/.test(value)) ids.add(value);
  }
  return [...ids];
}

export type GoogleNotebook = {
  name: string;
  displayName?: string;
  createTime?: string;
};

export type GoogleSource = {
  name: string;
  displayName?: string;
  mimeType?: string;
  state?: string;
  originalUrl?: string;
};

async function googleGet<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = (json as { error?: { status?: string } }).error?.status;
    if (response.status === 403) {
      throw new Error("Google non consente questa lettura. Controlla che l'API Gemini Notebook sia attiva e usa un account Google personale, non Workspace scolastico.");
    }
    if (response.status === 401) throw new Error("Accesso Google scaduto. Collega di nuovo l'account Google.");
    throw new Error(`La lettura del notebook da Google non è riuscita (${code || response.status}).`);
  }
  return json as T;
}

export async function listOwnedGoogleNotebooks(accessToken: string): Promise<GoogleNotebook[]> {
  const notebooks: GoogleNotebook[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://notebook.googleapis.com/v1/notebooks");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filter", "notebook.is_owner = true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await googleGet<{ notebooks?: GoogleNotebook[]; nextPageToken?: string }>(url.toString(), accessToken);
    notebooks.push(...(data.notebooks ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) return notebooks;
  }
  throw new Error("L'account contiene troppi notebook per completare la ricerca in modo affidabile. Seleziona manualmente o contatta il supporto.");
}

export async function listGoogleNotebookSources(accessToken: string, notebookName: string): Promise<GoogleSource[]> {
  if (!/^notebooks\/[A-Za-z0-9_-]+$/.test(notebookName)) throw new Error("Identificativo notebook non valido.");
  const sources: GoogleSource[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`https://notebook.googleapis.com/v1/${notebookName}/sources`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await googleGet<{ sources?: GoogleSource[]; nextPageToken?: string }>(url.toString(), accessToken);
    sources.push(...(data.sources ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) return sources;
  }
  throw new Error("Il notebook supera il limite di lettura previsto: non posso indicare un conteggio delle fonti potenzialmente incompleto.");
}

export async function generateNotebookSuggestions(input: {
  title: string;
  sources: Array<{ displayName: string; mimeType: string; state: string }>;
  subjects: string[];
  levels: string[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const schema = {
    type: "object",
    properties: {
      subject: { type: "string", enum: input.subjects },
      education_level: { type: "string", enum: input.levels },
      topic: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["subject", "education_level", "topic", "description", "tags"],
  };

  const prompt = [
    "Sei l'assistente editoriale di Notebook Scuola. Prepara una bozza in italiano per una scheda di studio.",
    "IMPORTANTE: hai ricevuto solo il titolo e i NOMI/TIPI delle fonti, non il loro contenuto integrale. Non affermare di aver letto i documenti e non inventare dettagli, risultati, capitoli o funzioni che non risultano dai metadati.",
    "Scegli la materia solo tra le opzioni fornite. Se non è chiara usa Altro. Scegli il livello solo se i metadati lo indicano chiaramente; altrimenti usa Altro.",
    "Scrivi un argomento breve e una descrizione prudente di 2-4 frasi, basata esclusivamente sul titolo e sui nomi delle fonti. Se non hai elementi sufficienti, dichiaralo in modo naturale.",
    "Crea 3-6 tag pertinenti, senza duplicati. Non compilare categorie di artefatti (audio, quiz, flashcard ecc.): non sono deducibili dalla lista delle fonti e verranno scelte manualmente dall'autore.",
    JSON.stringify({ title: input.title, subjects: input.subjects, levels: input.levels, sources: input.sources }),
  ].join("\n\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model,
      input: prompt,
      store: false,
      stream: false,
      background: false,
      response_format: { type: "text", mime_type: "application/json", schema },
    }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({})) as {
    error?: { message?: string };
    output_text?: string;
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  if (!response.ok) throw new Error(result.error?.message || `Gemini non disponibile (${response.status}).`);

  const outputText = result.output_text || result.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .find((part) => part.type === "text")?.text;
  if (!outputText) throw new Error("Gemini non ha restituito i suggerimenti attesi.");
  const parsed = JSON.parse(outputText) as {
    subject?: string;
    education_level?: string;
    topic?: string;
    description?: string;
    tags?: string[];
  };
  const subject = input.subjects.includes(parsed.subject || "") ? parsed.subject! : "Altro";
  const educationLevel = input.levels.includes(parsed.education_level || "") ? parsed.education_level! : "Altro";
  const tags = Array.isArray(parsed.tags)
    ? [...new Set(parsed.tags.map((tag) => String(tag).trim().slice(0, 32)).filter(Boolean))].slice(0, 10)
    : [];
  return {
    subject,
    education_level: educationLevel,
    topic: String(parsed.topic || "").trim().slice(0, 80),
    description: String(parsed.description || "").trim().slice(0, 1200),
    tags,
  };
}
