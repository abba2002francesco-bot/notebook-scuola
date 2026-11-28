import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUserIdFromRequest } from "@/lib/notebooklm-google";
import { STUDY_API_BOOKMARKS_URL, STUDY_SUPABASE_PUBLISHABLE_KEY } from "@/lib/study-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const userId = await getSupabaseUserIdFromRequest(request);
  if (!userId || !/^Bearer\s+.+$/i.test(authorization)) {
    return NextResponse.json({ error: "Accedi nuovamente a Notebook Scuola." }, { status: 401 });
  }

  try {
    const response = await fetch(STUDY_API_BOOKMARKS_URL + new URL(request.url).search, {
      method: "GET",
      headers: {
        apikey: STUDY_SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({ error: "Risposta non valida dal servizio Studio." }));
    return NextResponse.json(result, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Studio bookmarks proxy] request failed", {
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return NextResponse.json({ error: "I segnalibri non sono momentaneamente raggiungibili. Riprova tra poco." }, { status: 503 });
  }
}
