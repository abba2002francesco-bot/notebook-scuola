import { NextRequest, NextResponse } from "next/server";
import {
  encryptGoogleConnection,
  getGoogleRedirectUri,
  getSiteUrl,
  GOOGLE_CONNECTION_COOKIE,
  GOOGLE_STATE_COOKIE,
  NOTEBOOK_READONLY_SCOPE,
  verifyOAuthState,
} from "@/lib/notebooklm-google";

export const runtime = "nodejs";

function finish(path: string) {
  const response = NextResponse.redirect(new URL(path, getSiteUrl()));
  response.cookies.set(GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const suppliedState = request.nextUrl.searchParams.get("state") || "";
  const cookieState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value || "";

  if (!suppliedState || !cookieState || suppliedState !== cookieState) return finish("/carica?google=state_error");
  const state = verifyOAuthState(suppliedState);
  if (!state) return finish("/carica?google=state_error");

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) return finish(`/carica?google=${encodeURIComponent(oauthError === "access_denied" ? "denied" : "error")}`);

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return finish("/carica?google=missing_code");

  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Credenziali OAuth Google mancanti.");

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const tokens = await tokenResponse.json().catch(() => ({})) as {
      refresh_token?: string;
      scope?: string;
      error?: string;
    };
    if (!tokenResponse.ok || !tokens.refresh_token) {
      return finish("/carica?google=refresh_missing");
    }
    if (tokens.scope && !tokens.scope.split(" ").includes(NOTEBOOK_READONLY_SCOPE)) {
      return finish("/carica?google=scope_missing");
    }

    const encrypted = encryptGoogleConnection({ userId: state.userId, refreshToken: tokens.refresh_token, createdAt: Date.now() });
    const response = finish("/carica?google=connected");
    response.cookies.set(GOOGLE_CONNECTION_COOKIE, encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
    response.cookies.set(GOOGLE_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/google/callback",
      maxAge: 0,
    });
    return response;
  } catch {
    return finish("/carica?google=error");
  }
}
