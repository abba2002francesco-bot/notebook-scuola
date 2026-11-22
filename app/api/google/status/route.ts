import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { decryptGoogleConnection, getSupabaseUserIdFromRequest, GOOGLE_CONNECTION_COOKIE } from "@/lib/notebooklm-google";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const userId = await getSupabaseUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Sessione Notebook Scuola non valida." }, { status: 401 });
  const cookieValue = (await cookies()).get(GOOGLE_CONNECTION_COOKIE)?.value;
  const connection = cookieValue ? decryptGoogleConnection(cookieValue) : null;
  return NextResponse.json({ connected: Boolean(connection && connection.userId === userId) });
}
