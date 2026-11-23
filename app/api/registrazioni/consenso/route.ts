import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  escapeHtml,
  getPublicSiteUrl,
  hashToken,
  sendTransactionalEmail,
} from "@/lib/registration";

export const runtime = "nodejs";

const CHILD_TICKET_TTL_HOURS = 24;
const RELATIONSHIPS = new Set(["genitore", "tutore", "affidatario"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: {
    token?: unknown;
    action?: unknown;
    guardianName?: unknown;
    guardianRelationship?: unknown;
    accepted?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError("La richiesta non è valida.", 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const guardianName = typeof body.guardianName === "string"
    ? body.guardianName.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100)
    : "";
  const guardianRelationship = typeof body.guardianRelationship === "string"
    ? body.guardianRelationship.trim().toLowerCase()
    : "";

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return jsonError("Il collegamento non è valido o è scaduto. Richiedi un nuovo invito.", 400);
  }

  if (body.action === "decline") {
    try {
      const admin = createSupabaseAdmin();
      const now = new Date();
      const { data: found, error: lookupError } = await admin
        .from("parental_consent_requests")
        .select("id, status, expires_at, guardian_declaration_accepted, approved_at")
        .eq("approval_token_hash", hashToken(token))
        .maybeSingle();

      if (lookupError) {
        console.error("[Parental consent] Could not look up decline request", lookupError.code);
        return jsonError("Non è stato possibile verificare la richiesta. Riprova più tardi.", 503);
      }
      if (!found || new Date(found.expires_at).getTime() <= now.getTime()) {
        return jsonError("Il collegamento non è valido o è scaduto.", 410);
      }
      if (found.status === "declined") {
        return NextResponse.json({ status: "declined", message: "La richiesta è stata rifiutata." });
      }
      if (
        !["pending", "invite_failed"].includes(found.status) ||
        found.guardian_declaration_accepted === true ||
        found.approved_at
      ) {
        return jsonError("Questa richiesta è già stata autorizzata o non può più essere modificata da questo collegamento.", 409);
      }

      const { data: declined, error: declineError } = await admin
        .from("parental_consent_requests")
        .update({ status: "declined", guardian_declaration_accepted: false })
        .eq("id", found.id)
        .eq("status", found.status)
        .is("approved_at", null)
        .select("id")
        .maybeSingle();

      if (declineError || !declined) {
        console.error("[Parental consent] Could not decline request", declineError?.code || "status_changed");
        return jsonError("La richiesta potrebbe essere già stata elaborata. Aggiorna la pagina e riprova.", 409);
      }

      return NextResponse.json({
        status: "declined",
        message: "La richiesta è stata rifiutata. Non verrà creato alcun account per questa procedura.",
      });
    } catch (error) {
      console.error("[Parental consent] Unexpected decline error", error instanceof Error ? error.message : "unknown");
      return jsonError("Servizio di autorizzazione momentaneamente non disponibile.", 503);
    }
  }

  if (guardianName.length < 2) {
    return jsonError("Inserisci il tuo nome e cognome.", 400);
  }
  if (!RELATIONSHIPS.has(guardianRelationship)) {
    return jsonError("Seleziona il rapporto con lo studente.", 400);
  }
  if (body.accepted !== true) {
    return jsonError("Per proseguire devi esprimere il consenso e confermare la tua responsabilità.", 400);
  }

  try {
    const admin = createSupabaseAdmin();
    const now = new Date();
    const { data: found, error: lookupError } = await admin
      .from("parental_consent_requests")
      .select("id, child_display_name, child_email, guardian_email, status, expires_at, guardian_declaration_accepted, approved_at")
      .eq("approval_token_hash", hashToken(token))
      .maybeSingle();

    if (lookupError) {
      console.error("[Parental consent] Could not look up request", lookupError.code);
      return jsonError("Non è stato possibile verificare la richiesta. Riprova più tardi.", 503);
    }
    if (!found || new Date(found.expires_at).getTime() <= now.getTime()) {
      return jsonError("Il collegamento non è valido o è scaduto. Richiedi un nuovo invito.", 410);
    }

    if (found.status === "invite_sent") {
      return NextResponse.json({
        status: "already_sent",
        message: "L'autorizzazione risulta già registrata e l'invito è stato inviato allo studente.",
      });
    }

    let approvedRequest = found;

    if (found.status === "pending") {
      const { data: updated, error: updateError } = await admin
        .from("parental_consent_requests")
        .update({
          status: "approved",
          guardian_name: guardianName,
          guardian_relationship: guardianRelationship,
          guardian_declaration_accepted: true,
          approved_at: now.toISOString(),
        })
        .eq("id", found.id)
        .eq("status", "pending")
        .gt("expires_at", now.toISOString())
        .select("id, child_display_name, child_email, guardian_email, status, expires_at, guardian_declaration_accepted, approved_at")
        .maybeSingle();

      if (updateError) {
        console.error("[Parental consent] Could not approve request", updateError.code);
        return jsonError("Non è stato possibile registrare il consenso. Riprova più tardi.", 503);
      }

      if (updated) {
        approvedRequest = updated;
      } else {
        const { data: latest, error: latestError } = await admin
          .from("parental_consent_requests")
          .select("id, child_display_name, child_email, guardian_email, status, expires_at, guardian_declaration_accepted, approved_at")
          .eq("id", found.id)
          .maybeSingle();

        if (latestError || !latest) {
          return jsonError("Non è stato possibile verificare la richiesta. Riprova più tardi.", 503);
        }
        approvedRequest = latest;
      }
    }

    if (approvedRequest.status === "invite_sent") {
      return NextResponse.json({
        status: "already_sent",
        message: "L'autorizzazione risulta già registrata e l'invito è stato inviato allo studente.",
      });
    }

    if (
      !["approved", "invite_failed"].includes(approvedRequest.status) ||
      approvedRequest.guardian_declaration_accepted !== true ||
      !approvedRequest.approved_at
    ) {
      return jsonError("La richiesta non è più autorizzabile. Contatta il supporto di Notebook Scuola.", 409);
    }

    const requestExpiresAt = new Date(approvedRequest.expires_at);
    const ticketExpiry = new Date(Math.min(
      now.getTime() + CHILD_TICKET_TTL_HOURS * 60 * 60 * 1000,
      requestExpiresAt.getTime(),
    ));

    if (ticketExpiry.getTime() <= now.getTime()) {
      return jsonError("Il collegamento è scaduto. Richiedi un nuovo invito.", 410);
    }

    // Riutilizza un ticket ancora valido per questa stessa richiesta, anche in caso di retry.
    const { data: existingTicket, error: ticketLookupError } = await admin
      .from("registration_authorizations")
      .select("id")
      .eq("student_email", approvedRequest.child_email)
      .eq("authorization_type", "parental_consent")
      .eq("parental_consent_request_id", approvedRequest.id)
      .is("consumed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .maybeSingle();

    if (ticketLookupError) {
      console.error("[Parental consent] Could not check registration ticket", ticketLookupError.code);
      return jsonError("Non è stato possibile preparare l'invito. Riprova più tardi.", 503);
    }

    let ticketId = existingTicket?.id as string | undefined;

    if (!ticketId) {
      // Revoca eventuali ticket precedenti associati allo stesso indirizzo, poi ne crea uno nuovo.
      const { error: revokeError } = await admin
        .from("registration_authorizations")
        .update({ revoked_at: now.toISOString() })
        .eq("student_email", approvedRequest.child_email)
        .is("consumed_at", null)
        .is("revoked_at", null);

      if (revokeError) {
        console.error("[Parental consent] Could not rotate registration ticket", revokeError.code);
        return jsonError("Non è stato possibile preparare l'invito. Riprova più tardi.", 503);
      }

      const { data: newTicket, error: createTicketError } = await admin
        .from("registration_authorizations")
        .insert({
          student_email: approvedRequest.child_email,
          authorization_type: "parental_consent",
          parental_consent_request_id: approvedRequest.id,
          expires_at: ticketExpiry.toISOString(),
        })
        .select("id")
        .single();

      if (createTicketError || !newTicket) {
        console.error("[Parental consent] Could not create registration ticket", createTicketError?.code || "unknown");
        return jsonError("Non è stato possibile preparare l'invito. Riprova più tardi.", 503);
      }

      ticketId = newTicket.id;
    }

    const registrationUrl = new URL("/registrati", getPublicSiteUrl());
    registrationUrl.hash = `ticket=${ticketId}`;
    const safeName = escapeHtml(approvedRequest.child_display_name);
    const safeUrl = escapeHtml(registrationUrl.toString());

    try {
      await sendTransactionalEmail({
        to: approvedRequest.child_email,
        subject: "Puoi completare la registrazione a Notebook Scuola",
        idempotencyKey: `child-registration-ticket-${ticketId}`,
        text: [
          `Ciao ${approvedRequest.child_display_name},`,
          "Il genitore o tutore ha autorizzato la tua richiesta di registrazione a Notebook Scuola.",
          "Ora puoi creare il tuo account aprendo questo collegamento personale:",
          registrationUrl.toString(),
          "Il collegamento scade entro 24 ore. Dopo la scadenza dovrai richiedere un nuovo invito.",
        ].join("\n\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#20242a;max-width:600px">
            <h2>Autorizzazione ricevuta</h2>
            <p>Ciao ${safeName},</p>
            <p>Il genitore o tutore ha autorizzato la tua richiesta di registrazione a Notebook Scuola.</p>
            <p>Ora puoi creare il tuo account utilizzando il collegamento personale qui sotto:</p>
            <p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#1f2937;color:#fff;text-decoration:none;border-radius:8px">Completa la registrazione</a></p>
            <p>Il collegamento scade entro 24 ore. Dopo la scadenza dovrai richiedere un nuovo invito.</p>
            <p style="font-size:12px;color:#666">Notebook Scuola</p>
          </div>
        `,
      });
    } catch (emailError) {
      await admin
        .from("parental_consent_requests")
        .update({ status: "invite_failed" })
        .eq("id", approvedRequest.id);
      console.error("[Parental consent] Child invitation email failed", emailError instanceof Error ? emailError.message : "unknown");
      return jsonError("Il consenso è stato registrato, ma non è stato possibile inviare l'invito allo studente. Riprova.", 503);
    }

    const { error: sentUpdateError } = await admin
      .from("parental_consent_requests")
      .update({
        status: "invite_sent",
        invite_sent_at: now.toISOString(),
      })
      .eq("id", approvedRequest.id);

    if (sentUpdateError) {
      console.error("[Parental consent] Could not update invitation status", sentUpdateError.code);
      return jsonError("L'invito è stato inviato, ma non è stato possibile aggiornare lo stato. Contatta il supporto se lo studente non riceve il messaggio.", 503);
    }

    return NextResponse.json({
      status: "invite_sent",
      message: "Consenso registrato. Abbiamo inviato allo studente l'invito per completare la registrazione.",
    });
  } catch (error) {
    console.error("[Parental consent] Unexpected error", error instanceof Error ? error.message : "unknown");
    return jsonError("Servizio di autorizzazione momentaneamente non disponibile.", 503);
  }
}
