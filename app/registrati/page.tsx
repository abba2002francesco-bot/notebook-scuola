"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";

function getDeclaredAge(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== value) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  if (value > `${values.year}-${values.month}-${values.day}`) return null;

  let age = year - birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth() + 1;
  const birthDay = birthDate.getUTCDate();
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;

  return age >= 0 && age <= 120 ? age : null;
}

function ConsentRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [ageDeclarationAccepted, setAgeDeclarationAccepted] = useState(false);
  const [registrationTicket, setRegistrationTicket] = useState("");
  const [invitationFlow, setInvitationFlow] = useState<"parent" | "age" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const ticket = params.get("ticket") || "";
    const invitedEmail = params.get("email") || "";
    const invitedName = params.get("name") || "";
    const flow = params.get("flow");
    if (ticket && invitedEmail && (flow === "parent" || flow === "age")) {
      setRegistrationTicket(ticket);
      setInvitationFlow(flow);
      setEmail(invitedEmail);
      if (invitedName) setName(invitedName);
    }
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const invitedByInvitation = Boolean(registrationTicket && invitationFlow);
  const declaredAge = getDeclaredAge(birthDate);
  const needsGuardian = !invitedByInvitation && declaredAge !== null && declaredAge < 14;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!supabase) {
      setError("Il sito non è ancora collegato a Supabase.");
      return;
    }
    if (password.length < 8) {
      setError("La password deve contenere almeno 8 caratteri.");
      return;
    }

    setBusy(true);
    try {
      let ticket = registrationTicket;

      if (!ticket) {
        const requestResponse = await fetch("/api/registrazioni/richiesta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: name.trim(),
            email: email.trim(),
            birthDate,
            ageDeclarationAccepted,
            guardianEmail: needsGuardian ? guardianEmail.trim() : undefined,
          }),
        });
        const requestResult = await requestResponse.json().catch(() => ({}));

        if (!requestResponse.ok) {
          setError(requestResult.error || "Non è stato possibile avviare la registrazione.");
          return;
        }

        // Nessun ticket viene restituito al browser: lo studente deve aprire
        // il link personale inviato alla propria casella email.
        setSuccess(requestResult.message || "Controlla la tua casella email per proseguire.");
        return;
      }

      if (!invitationFlow) {
        setError("Il collegamento personale non è valido. Avvia nuovamente la procedura di registrazione.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: name.trim(),
            registration_ticket: ticket,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session) {
        router.push("/");
        router.refresh();
      } else {
        setSuccess("Richiesta di creazione account completata. Controlla la tua email e conferma l'indirizzo prima di accedere.");
      }
    } catch {
      setError("Connessione non disponibile. Riprova tra qualche minuto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <div className="panel auth-wrap">
        <span className="eyebrow"><UserPlus size={14} /> Entra nella community</span>
        <h1>Crea il tuo account.</h1>
        <p>È gratuito. Potrai condividere notebook, salvare quelli utili e partecipare alla community.</p>

        {invitedByInvitation && (
          <div className="alert alert-success">
            {invitationFlow === "parent"
              ? "Il genitore o tutore ha autorizzato la registrazione. Completa i dati per creare il tuo account."
              : "Hai aperto il link personale inviato al tuo indirizzo email. Completa i dati per creare il tuo account."}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="register-name">Nome visualizzato</label>
            <input
              id="register-name"
              required
              maxLength={40}
              placeholder="Come vuoi apparire sul sito"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              placeholder="nome@email.com"
              readOnly={invitedByInvitation}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {!invitedByInvitation && (
            <>
              <div className="field">
                <label htmlFor="register-birth-date">Data di nascita</label>
                <input
                  id="register-birth-date"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  autoComplete="bday"
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                />
              </div>

              {needsGuardian && (
                <div className="field">
                  <label htmlFor="register-guardian-email">Email del genitore o tutore</label>
                  <input
                    id="register-guardian-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="genitore@email.com"
                    value={guardianEmail}
                    onChange={(event) => setGuardianEmail(event.target.value)}
                  />
                  <small>L'account non verrà creato prima dell'autorizzazione del genitore o tutore.</small>
                </div>
              )}

              <div className="field">
                <label style={{ display: "flex", alignItems: "flex-start", gap: 9, fontWeight: 500, lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    required
                    checked={ageDeclarationAccepted}
                    onChange={(event) => setAgeDeclarationAccepted(event.target.checked)}
                    style={{ width: 17, minWidth: 17, marginTop: 2, accentColor: "var(--accent)" }}
                  />
                  <span>Confermo che la data di nascita indicata è corretta.</span>
                </label>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Almeno 8 caratteri"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <button className="button button-primary" style={{ width: "100%" }} disabled={busy}>
            {busy
              ? "Elaborazione…"
              : invitedByInvitation
                ? "Crea account e invia conferma"
                : needsGuardian
                  ? "Invia richiesta al genitore"
                  : "Invia link di verifica"}
            <UserPlus size={16} />
          </button>
        </form>

        <div className="auth-switch">
          Hai già un account? <Link href="/accedi">Accedi</Link>
        </div>
      </div>
    </div>
  );
}

const CONSENT_REGISTRATION_ENABLED = false;

function LegacyRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!supabase) {
      setError("Il sito non è ancora collegato a Supabase.");
      return;
    }
    if (password.length < 8) {
      setError("La password deve contenere almeno 8 caratteri.");
      return;
    }

    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setSuccess("Account creato. Controlla la tua email e conferma la registrazione prima di accedere.");
    }
  }

  return (
    <div className="container page">
      <div className="panel auth-wrap">
        <span className="eyebrow"><UserPlus size={14} /> Entra nella community</span>
        <h1>Crea il tuo account.</h1>
        <p>È gratuito. Potrai condividere notebook, salvare quelli utili e partecipare alla community.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="legacy-register-name">Nome visualizzato</label>
            <input id="legacy-register-name" required maxLength={40} placeholder="Come vuoi apparire sul sito" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="legacy-register-email">Email</label>
            <input id="legacy-register-email" type="email" required autoComplete="email" placeholder="nome@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="legacy-register-password">Password</label>
            <input id="legacy-register-password" type="password" required minLength={8} autoComplete="new-password" placeholder="Almeno 8 caratteri" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <button className="button button-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Creazione account…" : "Crea account gratuito"}
            <UserPlus size={16} />
          </button>
        </form>
        <div className="auth-switch">Hai già un account? <Link href="/accedi">Accedi</Link></div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  // Attivare solo dopo aver eseguito lo script SQL e configurato il Before User Created Hook su Supabase.
  return CONSENT_REGISTRATION_ENABLED ? <ConsentRegisterPage /> : <LegacyRegisterPage />;
}
