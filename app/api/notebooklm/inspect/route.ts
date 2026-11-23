import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hashToken } from "@/lib/registration";
import {
  decryptGoogleConnection,
  extractLinkIds,
  generateNotebookSuggestions,
  getSupabaseUserIdFromRequest,
  GOOGLE_CONNECTION_COOKIE,
  isAllowedNotebookLmUrl,
  listGoogleNotebookSources,
  listOwnedGoogleNotebooks,
  refreshGoogleAccessToken,
} from "@/lib/notebooklm-google";

export const runtime = "nodejs";
export const maxDuration = 30;

const SUBJECTS = ["Matematica", "Fisica", "Italiano", "Storia", "Inglese", "Filosofia", "Chimica", "Biologia", "Informatica", "Economia", "Diritto", "Arte", "Geografia", "Scienze", "Altro"];
const LEVELS = ["Medie", "Superiori", "Università", "Altro"];

export async function POST(request: NextRequest) {
  try {
    const userId = await getSupabaseUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "Accedi nuovamente a Notebook Scuola e riprova." }, { status: 401 });

    const body = await request.json().catch(() => null) as { url?: string; selectedNotebookName?: string; generateAi?: boolean } | null;
    const link = String(body?.url || "").trim();
    if (!isAllowedNotebookLmUrl(link)) {
      return NextResponse.json({ error: "Incolla un link HTTPS di notebooklm.google.com o notebooklm.link.google." }, { status: 400 });
    }

    const encryptedCookie = (await cookies()).get(GOOGLE_CONNECTION_COOKIE)?.value;
    const connection = encryptedCookie ? decryptGoogleConnection(encryptedCookie) : null;
    if (!connection || connection.userId !== userId) {
      return NextResponse.json({ error: "Collega prima il tuo account Google con il pulsante qui sopra." }, { status: 401 });
    }

    // Protegge la chiave Gemini condivisa: ogni account può richiedere al massimo
    // 10 generazioni AI all'ora. La lettura dei metadati senza AI resta disponibile.
    if (body?.generateAi === true) {
      const admin = createSupabaseAdmin();
      const { data: aiAllowed, error: aiRateLimitError } = await admin.rpc(
        "take_registration_rate_limit",
        {
          p_keys: [hashToken(`notebook-ai-user:${userId}`)],
          p_max_requests: 10,
          p_window_seconds: 3600,
        },
      );

      if (aiRateLimitError) {
        console.error("[Notebook inspection] AI rate limit check failed", aiRateLimitError.code);
        return NextResponse.json(
          { error: "Il servizio AI è momentaneamente non disponibile. Riprova più tardi." },
          { status: 503 },
        );
      }
      if (aiAllowed !== true) {
        return NextResponse.json(
          { error: "Hai raggiunto il limite di 10 compilazioni AI nell'ultima ora. Riprova più tardi." },
          { status: 429, headers: { "Retry-After": "3600" } },
        );
      }
    }

    const accessToken = await refreshGoogleAccessToken(connection.refreshToken);
    const notebooks = await listOwnedGoogleNotebooks(accessToken);
    if (notebooks.length === 0) {
      return NextResponse.json({ error: "Non trovo notebook di tua proprietà nell'account Google collegato. Controlla di aver usato l'account che possiede il notebook." }, { status: 404 });
    }

    let selected = null as (typeof notebooks)[number] | null;
    if (body?.selectedNotebookName) {
      selected = notebooks.find((item) => item.name === body.selectedNotebookName) ?? null;
      if (!selected) return NextResponse.json({ error: "Il notebook selezionato non appartiene all'account Google collegato. Ricarica l'elenco e riprova." }, { status: 400 });
    } else {
      const ids = extractLinkIds(link);
      selected = notebooks.find((item) => ids.includes(item.name.split("/").pop() || "")) ?? null;
    }

    if (!selected) {
      return NextResponse.json({
        status: "needs_selection",
        message: "Il codice del link condiviso non coincide con l'identificativo API. Seleziona dall'elenco il notebook corrispondente al link che hai incollato.",
        candidates: notebooks.map((item) => ({ name: item.name, displayName: item.displayName || "Notebook senza titolo", createTime: item.createTime || null })),
      }, { status: 200 });
    }

    const sources = await listGoogleNotebookSources(accessToken, selected.name);
    const sourceMetadata = sources.map((source) => ({
      displayName: String(source.displayName || "Fonte senza titolo").slice(0, 180),
      mimeType: String(source.mimeType || "tipo non indicato").slice(0, 100),
      state: String(source.state || "STATE_UNSPECIFIED"),
    }));

    let suggestions = null;
    let aiWarning: string | null = null;
    if (body?.generateAi === true) {
      try {
        suggestions = await generateNotebookSuggestions({
          title: selected.displayName || "Notebook senza titolo",
          sources: sourceMetadata.slice(0, 100),
          subjects: SUBJECTS,
          levels: LEVELS,
        });
        if (!suggestions) aiWarning = "Titolo e fonti letti correttamente. Per attivare i suggerimenti AI aggiungi GEMINI_API_KEY su Vercel.";
      } catch {
        aiWarning = "Ho letto titolo e fonti, ma Gemini non ha completato i suggerimenti. Puoi compilare i campi manualmente.";
      }
    } else {
      aiWarning = "Titolo e numero delle fonti letti. Per ricevere i suggerimenti descrittivi AI, seleziona prima l'autorizzazione a Gemini.";
    }

    return NextResponse.json({
      status: "complete",
      title: selected.displayName || "Notebook senza titolo",
      source_count: sources.length,
      sources: sourceMetadata.slice(0, 40),
      suggestions,
      aiWarning,
      metadataNote: "Google ha restituito i metadati delle fonti (nome, tipo e stato), non il testo integrale dei documenti né gli artefatti generati.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Non è stato possibile leggere il notebook.";
    const status = message.includes("Configura") || message.includes("Configurazione mancante") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
