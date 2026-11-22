import { NextRequest, NextResponse } from "next/server";
import {
  createOAuthState,
  getGoogleRedirectUri,
  getSupabaseUserIdFromRequest,
  GOOGLE_STATE_COOKIE,
  NOTEBOOK_READONLY_SCOPE,
} from "@/lib/notebooklm-google";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const userId = await getSupabaseUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "Accedi nuovamente a Notebook Scuola e riprova." }, { status: 401 });

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
      return NextResponse.json({ error: "Prima configura le credenziali OAuth di Google nelle variabili ambiente di Vercel." }, { status: 503 });
    }

    const state = createOAuthState(userId);
    const redirectUri = getGoogleRedirectUri();
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", NOTEBOOK_READONLY_SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    const response = NextResponse.json({ url: authUrl.toString() });
    response.cookies.set(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/google/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Non è stato possibile iniziare il collegamento Google." }, { status: 500 });
  }
}
