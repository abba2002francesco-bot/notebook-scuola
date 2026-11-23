import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  createOpaqueToken,
  escapeHtml,
  getPublicSiteUrl,
  hashToken,
  isValidEmail,
  normalizeEmail,
  sendTransactionalEmail,
} from "@/lib/registration";

export const runtime = "nodejs";

const CONSENT_TEXT_VERSION = "parental-consent-v1-2026-11-23";
const PARENT_REQUEST_TTL_HOURS = 48;
const REGISTRATION_TICKET_TTL_MINUTES = 30;

function getItalianToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    iso: `${values.year}-${values.month}-${values.day}`,
  };
}

function calculateAge(birthDateValue: unknown) {
  if (typeof birthDateValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateValue)) {
    return null;
  }

  const parsed = new Date(`${birthDateValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDateValue) {
    return null;
  }

  const today = getItalianToday();
  if (birthDateValue > today.iso) return null;

  let age = today.year - parsed.getUTCFullYear();
  const birthMonth = parsed.getUTCMonth() + 1;
  const birthDay = parsed.getUTCDate();
  if (today.month < birthMonth || (today.month === birthMonth && today.day < birthDay)) {
    age -= 1;
  }

  return age >= 0 && age <= 120 ? age : null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: {
    displayName?: unknown;
    email?: unknown;
    birthDate?: unknown;
    ageDeclarationAccepted?: unknown;
    guardianEmail?: unknown;
  };

  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonError("La richiesta non è valida.", 400);
    }
    body = parsed;
  } catch {
    return jsonError("La richiesta non è valida.", 400);
  }

  const displayName = typeof body.displayName === "string"
    ? body.displayName.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 40)
    : "";
  const email = normalizeEmail(body.email);
  const age = calculateAge(body.birthDate);

  if (!displayName || displayName.length < 1) {
    return jsonError("Inserisci il nome da visualizzare.", 400);
  }
  if (!isValidEmail(email)) {
    return jsonError("Inserisci un indirizzo email valido.", 400);
  }
  if (age === null) {
    return jsonError("Inserisci una data di nascita valida.", 400);
  }
  if (body.ageDeclarationAccepted !== true) {
    return jsonError("Conferma che la data di nascita inserita è corretta.", 400);
  }

  try {
    const admin = createSupabaseAdmin();
    const now = new Date();

    if (age < 14) {
      const { data: existingParentalRequest, error: existingRequestError } = await admin
        .from("parental_consent_requests")
        .select("status, guardian_declaration_accepted")
        .eq("child_email", email)
        .in("status", ["pending", "approved", "invite_sent", "invite_failed"])
        .gt("expires_at", now.toISOString())
        .limit(1)
        .maybeSingle();

      if (existingRequestError) {
        console.error("[Registration request] Could not check existing parental request", existingRequestError.code);
        return jsonError("Non è stato possibile verificare la richiesta. Riprova più tardi.", 503);
      }

      // Se l'invio dell'email al genitore era fallito prima dell'autorizzazione,
      // consentiamo una nuova richiesta. Gli altri stati attivi non vanno duplicati.
      const previousGuardianEmailFailed = existingParentalRequest?.status === "invite_failed" &&
        existingParentalRequest.guardian_declaration_accepted !== true;

      if (existingParentalRequest && !previousGuardianEmailFailed) {
        return NextResponse.json({
          status: "parental_request_in_progress",
          message: existingParentalRequest.guardian_declaration_accepted === true
            ? "La procedura risulta già autorizzata. Controlla l'email dello studente o chiedi al genitore di riaprire il messaggio ricevuto."
            : "Per questo indirizzo esiste già una richiesta in attesa. Controlla la casella del genitore.",
        }, { status: 202 });
      }

      const guardianEmail = normalizeEmail(body.guardianEmail);
      if (!isValidEmail(guardianEmail)) {
        return jsonError("Per proseguire serve l'email di un genitore o tutore.", 400);
      }
      if (guardianEmail === email) {
        return jsonError("L'email del genitore deve essere diversa da quella dello studente.", 400);
      }

      const approvalToken = createOpaqueToken();
      const expiresAt = new Date(now.getTime() + PARENT_REQUEST_TTL_HOURS * 60 * 60 * 1000);
      const { data: savedRequest, error: insertError } = await admin
        .from("parental_consent_requests")
        .insert({
          child_display_name: displayName,
          child_email: email,
          guardian_email: guardianEmail,
          approval_token_hash: hashToken(approvalToken),
          consent_text_version: CONSENT_TEXT_VERSION,
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !savedRequest) {
        if (insertError?.code === "23505") {
          return NextResponse.json({
            status: "request_already_pending",
            message: "Per questo indirizzo esiste già una richiesta in attesa. Controlla la casella del genitore.",
          }, { status: 202 });
        }
        console.error("[Registration request] Could not save parental request", insertError?.code || "unknown");
        return jsonError("Non è stato possibile registrare la richiesta. Riprova più tardi.", 500);
      }

      // Una nuova richiesta under 14 invalida qualsiasi ticket precedente per lo stesso studente.
      const { error: revokeExistingTicketError } = await admin
        .from("registration_authorizations")
        .update({ revoked_at: now.toISOString() })
        .eq("student_email", email)
        .is("consumed_at", null)
        .is("revoked_at", null);

      if (revokeExistingTicketError) {
        await admin
          .from("parental_consent_requests")
          .update({ status: "invite_failed" })
          .eq("id", savedRequest.id);
        console.error("[Registration request] Could not revoke previous tickets", revokeExistingTicketError.code);
        return jsonError("Non è stato possibile mettere in sicurezza la richiesta. Riprova più tardi.", 503);
      }

      const approvalUrl = new URL("/consenso-genitore", getPublicSiteUrl());
      approvalUrl.hash = new URLSearchParams({ token: approvalToken }).toString();
      const safeName = escapeHtml(displayName);
      const safeUrl = escapeHtml(approvalUrl.toString());

      try {
        await sendTransactionalEmail({
          to: guardianEmail,
          subject: "Richiesta di autorizzazione per Notebook Scuola",
          idempotencyKey: `parental-consent-request-${savedRequest.id}`,
          text: [
            "È stata richiesta la creazione di un account Notebook Scuola per uno studente che ha dichiarato di avere meno di 14 anni.",
            `Nome visualizzato indicato: ${displayName}`,
            "Nessun account è stato creato. Per autorizzare la registrazione, apri questo link:",
            approvalUrl.toString(),
            "Il link scade tra 48 ore. Se non sei il genitore o tutore responsabile, non autorizzare la richiesta.",
          ].join("\n\n"),
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#20242a;max-width:600px">
              <h2>Richiesta di autorizzazione</h2>
              <p>È stata richiesta la creazione di un account Notebook Scuola per uno studente che ha dichiarato di avere meno di 14 anni.</p>
              <p><strong>Nome visualizzato indicato:</strong> ${safeName}</p>
              <p><strong>Nessun account è stato creato.</strong> Per autorizzare la registrazione, apri il pulsante qui sotto. Ti verrà chiesto di confermare la tua responsabilità genitoriale o tutoriale e di esprimere il consenso.</p>
              <p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#1f2937;color:#fff;text-decoration:none;border-radius:8px">Esamina la richiesta</a></p>
              <p>Il collegamento scade tra 48 ore. Se non riconosci la richiesta o non sei la persona responsabile, non autorizzarla.</p>
              <p style="font-size:12px;color:#666">Notebook Scuola</p>
            </div>
          `,
        });
      } catch (emailError) {
        await admin
          .from("parental_consent_requests")
          .update({ status: "invite_failed" })
          .eq("id", savedRequest.id);
        console.error("[Registration request] Resend delivery failed", emailError instanceof Error ? emailError.message : "unknown");
        return jsonError("La richiesta è stata registrata, ma non è stato possibile inviare l'email al genitore. Riprova più tardi.", 503);
      }

      return NextResponse.json({
        status: "parent_email_sent",
        message: "Abbiamo inviato un'email al genitore. L'account dello studente non verrà creato finché non sarà autorizzato.",
      }, { status: 202 });
    }

    // Se esiste una procedura genitoriale ancora valida, la procedura 14+ non può sostituirla.
    const { data: activeParentalRequest, error: parentalLookupError } = await admin
      .from("parental_consent_requests")
      .select("id")
      .eq("child_email", email)
      .in("status", ["pending", "approved", "invite_sent", "invite_failed"])
      .gt("expires_at", now.toISOString())
      .limit(1)
      .maybeSingle();

    if (parentalLookupError) {
      console.error("[Registration request] Could not check parental request", parentalLookupError.code);
      return jsonError("Non è stato possibile verificare la richiesta. Riprova più tardi.", 500);
    }
    if (activeParentalRequest) {
      return jsonError("Per questo indirizzo è già in corso una procedura di autorizzazione. Controlla la casella del genitore.", 409);
    }

    // Revoca ticket precedenti non consumati, compresi quelli scaduti.
    const { error: revokeError } = await admin
      .from("registration_authorizations")
      .update({ revoked_at: now.toISOString() })
      .eq("student_email", email)
      .is("consumed_at", null)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("[Registration request] Could not rotate registration ticket", revokeError.code);
      return jsonError("Non è stato possibile preparare la registrazione. Riprova più tardi.", 500);
    }

    const ticketExpiry = new Date(now.getTime() + REGISTRATION_TICKET_TTL_MINUTES * 60 * 1000);
    const { data: ticket, error: ticketError } = await admin
      .from("registration_authorizations")
      .insert({
        student_email: email,
        authorization_type: "age_14_plus",
        expires_at: ticketExpiry.toISOString(),
      })
      .select("id")
      .single();

    if (ticketError || !ticket) {
      console.error("[Registration request] Could not issue registration ticket", ticketError?.code || "unknown");
      return jsonError("Non è stato possibile preparare la registrazione. Riprova più tardi.", 500);
    }

    return NextResponse.json({
      status: "registration_allowed",
      registrationTicket: ticket.id,
      expiresAt: ticketExpiry.toISOString(),
      message: "Puoi completare la registrazione.",
    });
  } catch (error) {
    console.error("[Registration request] Unexpected error", error instanceof Error ? error.message : "unknown");
    return jsonError("Servizio di registrazione momentaneamente non disponibile.", 503);
  }
}
