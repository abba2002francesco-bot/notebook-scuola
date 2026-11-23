import "server-only";

import { createHash, randomBytes } from "node:crypto";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_FROM = "Notebook Scuola <noreply@auth.notebookscuola.it>";

export function createOpaqueToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getPublicSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) throw new Error("NEXT_PUBLIC_SITE_URL non configurato.");
  const url = new URL(configured);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL deve usare HTTPS in produzione.");
  }
  return url.origin;
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY non configurata.");

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // Non registrare mai la chiave API o il contenuto dei messaggi nei log.
    throw new Error(`Resend ha rifiutato l'invio (HTTP ${response.status}).`);
  }
}
