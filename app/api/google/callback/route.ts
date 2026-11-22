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

  if (!suppliedState || !cookieState || suppliedState !== cookieState) {
    console.error("[Google OAuth callback] state cookie mismatch", {
      hasStateParameter: Boolean(suppliedState),
      hasStateCookie: Boolean(cookieState),
    });
    return finish("/carica?google=state_error");
  }

  const state = verifyOAuthState(suppliedState);
  if (!state) {
    console.error("[Google OAuth callback] state signature or expiry check failed");
    return finish("/carica?google=state_error");
  }

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    const safeDescription = request.nextUrl.searchParams.get("error_description") || "";
    console.error("[Google OAuth authorization rejected]", {
      error: oauthError,
      description: safeDescription.slice(0, 300),
    });
    return finish(`/carica?google=${encodeURIComponent(oauthError === "access_denied" ? "denied" : "authorization_error")}`);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    console.error("[Google OAuth callback] authorization code missing");
    return finish("/carica?google=missing_code");
  }

  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error("[Google OAuth callback] GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET is missing");
      return finish("/carica?google=oauth_config_missing");
    }

    const redirectUri = getGoogleRedirectUri();
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    const tokens = await tokenResponse.json().catch(() => ({})) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      token_type?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    // Never log authorization codes, access tokens, refresh tokens, client secrets, or cookies.
    if (!tokenResponse.ok) {
      console.error("[Google OAuth token exchange failed]", {
        httpStatus: tokenResponse.status,
        error: tokens.error || "unknown_error",
        description: (tokens.error_description || "").slice(0, 300),
        redirectUri,
      });
      return finish("/carica?google=token_exchange_failed");
    }

    if (!tokens.refresh_token) {
      console.error("[Google OAuth token response has no refresh token]", {
        httpStatus: tokenResponse.status,
        hasAccessToken: Boolean(tokens.access_token),
        tokenType: tokens.token_type || null,
        expiresIn: tokens.expires_in ?? null,
        grantedScopes: tokens.scope || null,
        requestedOfflineAccess: true,
        requestedConsent: true,
      });
      return finish("/carica?google=refresh_missing");
    }

    if (tokens.scope && !tokens.scope.split(" ").includes(NOTEBOOK_READONLY_SCOPE)) {
      console.error("[Google OAuth token response missing required notebook scope]", {
        grantedScopes: tokens.scope,
      });
      return finish("/carica?google=scope_missing");
    }

    const encrypted = encryptGoogleConnection({
      userId: state.userId,
      refreshToken: tokens.refresh_token,
      createdAt: Date.now(),
    });

    const response = finish("/carica?google=connected");
    response.cookies.set(GOOGLE_CONNECTION_COOKIE, encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
    return response;
  } catch (error) {
    console.error("[Google OAuth callback internal error]", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return finish("/carica?google=callback_error");
  }
}
