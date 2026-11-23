"use client";

import { FormEvent, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

export default function ParentConsentPage() {
  const [token, setToken] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("genitore");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const value = fragment.get("token") || query.get("token") || "";
    setToken(value);
    if (fragment.has("token")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  async function decline() {
    setError("");
    setSuccess("");
    if (!token) {
      setError("Il collegamento non contiene un codice valido.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/registrazioni/consenso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "decline" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Non è stato possibile rifiutare la richiesta.");
        return;
      }
      setSuccess(result.message || "La richiesta è stata rifiutata.");
    } catch {
      setError("Connessione non disponibile. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Il collegamento non contiene un codice valido. Apri nuovamente il link ricevuto via email.");
      return;
    }
    if (!accepted) {
      setError("Per proseguire devi confermare la tua responsabilità e autorizzare la registrazione.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/registrazioni/consenso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          guardianName,
          guardianRelationship,
          accepted,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Non è stato possibile registrare l'autorizzazione.");
        return;
      }
      setSuccess(result.message || "Autorizzazione registrata.");
    } catch {
      setError("Connessione non disponibile. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <div className="panel auth-wrap">
        <span className="eyebrow"><ShieldCheck size={14} /> Autorizzazione genitoriale</span>
        <h1>Autorizza la registrazione.</h1>
        <p>
          La richiesta riguarda uno studente che ha dichiarato di avere meno di 14 anni.
          L'account non viene creato prima della tua autorizzazione.
        </p>

        {success ? (
          <div className="alert alert-success">{success}</div>
        ) : (
          <>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="guardian-name">Nome e cognome</label>
              <input
                id="guardian-name"
                type="text"
                autoComplete="name"
                maxLength={100}
                required
                value={guardianName}
                onChange={(event) => setGuardianName(event.target.value)}
                placeholder="Il tuo nome e cognome"
              />
            </div>

            <div className="field">
              <label htmlFor="guardian-relationship">Rapporto con lo studente</label>
              <select
                id="guardian-relationship"
                required
                value={guardianRelationship}
                onChange={(event) => setGuardianRelationship(event.target.value)}
              >
                <option value="genitore">Genitore</option>
                <option value="tutore">Tutore</option>
                <option value="affidatario">Affidatario</option>
              </select>
            </div>

            <div className="field">
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontWeight: 500, lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  required
                  style={{ width: 17, minWidth: 17, marginTop: 2, accentColor: "var(--accent)" }}
                />
                <span>
                  Dichiaro di esercitare la responsabilità genitoriale o tutoriale nei confronti
                  dello studente e autorizzo la creazione del suo account su Notebook Scuola.
                </span>
              </label>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button className="button button-primary" style={{ width: "100%" }} disabled={busy || !token}>
              {busy ? "Registrazione dell'autorizzazione…" : "Autorizza e invia l'invito"}
              <ShieldCheck size={16} />
            </button>
          </form>
          <button
            type="button"
            className="button button-secondary"
            style={{ width: "100%", marginTop: 10 }}
            disabled={busy || !token}
            onClick={decline}
          >
            Non autorizzo questa richiesta
          </button>
          </>
        )}

        {!token && !success && (
          <div className="alert alert-error">
            Non trovo il codice di autorizzazione. Apri il collegamento completo ricevuto via email.
          </div>
        )}

        <p className="auth-switch">
          Se non hai richiesto questa procedura o non sei la persona responsabile dello studente,
          non confermare l'autorizzazione.
        </p>
      </div>
    </div>
  );
}
