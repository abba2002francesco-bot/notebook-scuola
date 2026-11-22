import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { decryptGoogleConnection, getSupabaseUserIdFromRequest, GOOGLE_CONNECTION_COOKIE } from "@/lib/notebooklm-google";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const userId = await getSupabaseUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Sessione Notebook Scuola non valida." }, { status: 401 });
  const store = await cookies();
  const cookieValue = store.get(GOOGLE_CONNECTION_COOKIE)?.value;
  const connection = cookieValue ? decryptGoogleConnection(cookieValue) : null;

  if (connection && connection.userId === userId) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: connection.refreshToken }),
        cache: "no-store",
      });
    } catch {
      // La cancellazione locale resta prioritaria anche se la revoca remota non risponde.
    }
  }
  const response = NextResponse.json({ disconnected: true });
  response.cookies.set(GOOGLE_CONNECTION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
