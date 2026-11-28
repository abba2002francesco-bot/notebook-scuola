import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUserIdFromRequest } from "@/lib/notebooklm-google";
import { STUDY_API_NOTES_URL, STUDY_SUPABASE_PUBLISHABLE_KEY } from "@/lib/study-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const userId = await getSupabaseUserIdFromRequest(request);

  if (!userId || !/^Bearer\s+.+$/i.test(authorization)) {
    return { error: NextResponse.json({ error: "Accedi nuovamente a Notebook Scuola." }, { status: 401 }) };
  }

  return { authorization };
}

async function forward(request: NextRequest, method: "GET" | "POST" | "DELETE") {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  try {
    let body: string | undefined;
    if (method !== "GET") {
      const length = Number(request.headers.get("content-length") || "0");
      if (length > 220_000) {
        return NextResponse.json({ error: "Richiesta troppo grande." }, { status: 413 });
      }
      const parsed = await request.json().catch(() => null);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
      }
      body = JSON.stringify(parsed);
    }

    const endpoint = method === "GET"
      ? STUDY_API_NOTES_URL + new URL(request.url).search
      : STUDY_API_NOTES_URL;

    const response = await fetch(endpoint, {
      method,
      headers: {
        apikey: STUDY_SUPABASE_PUBLISHABLE_KEY,
        Authorization: auth.authorization,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const result = await response.json().catch(() => ({ error: "Risposta non valida dal servizio Studio." }));
    return NextResponse.json(result, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Studio notes proxy] request failed", {
      method,
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return NextResponse.json(
      { error: "Il servizio note non è momentaneamente raggiungibile. Riprova tra poco." },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  return forward(request, "GET");
}

export async function POST(request: NextRequest) {
  return forward(request, "POST");
}

export async function DELETE(request: NextRequest) {
  return forward(request, "DELETE");
}
