import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUserIdFromRequest } from "@/lib/notebooklm-google";
import { STUDY_API_SOURCES_URL, STUDY_SUPABASE_PUBLISHABLE_KEY } from "@/lib/study-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const userId = await getSupabaseUserIdFromRequest(request);

  if (!userId || !/^Bearer\s+.+$/i.test(authorization)) {
    return { error: NextResponse.json({ error: "Accedi nuovamente a Notebook Scuola." }, { status: 401 }) };
  }
  return { authorization };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const length = Number(request.headers.get("content-length") || "0");
  if (length > 8_192) return NextResponse.json({ error: "Richiesta troppo grande." }, { status: 413 });

  const body = await request.json().catch(() => null) as { source_id?: unknown } | null;
  const sourceId = typeof body?.source_id === "string" ? body.source_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId)) {
    return NextResponse.json({ error: "Documento non valido." }, { status: 400 });
  }

  try {
    const response = await fetch(STUDY_API_SOURCES_URL + "/chunk", {
      method: "POST",
      headers: {
        apikey: STUDY_SUPABASE_PUBLISHABLE_KEY,
        Authorization: auth.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source_id: sourceId }),
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
    const result = await response.json().catch(() => ({ error: "Risposta non valida dal servizio Studio." }));
    return NextResponse.json(result, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Studio chunking proxy] request failed", {
      sourceId,
      message: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return NextResponse.json(
      { error: "Il servizio di preparazione del testo non è momentaneamente raggiungibile." },
      { status: 503 },
    );
  }
}
