"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, AtSign, KeyRound, Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

type ProfileRow = { display_name: string; username: string };

export default function ProfileSettingsPage() {
  const { user, loading: authLoading, updateDisplayName } = useAuth();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [passwordCurrentPassword, setPasswordCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      if (authLoading) return;
      if (!user || !supabase) {
        setLoadingProfile(false);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setProfileError(`Non riesco a leggere il profilo: ${error.message}. Verifica di aver eseguito la migrazione SQL del profilo.`);
      }
      const row = data as ProfileRow | null;
      setDisplayName(row?.display_name ?? String(user.user_metadata?.display_name ?? "Studente"));
      setUsername(row?.username ?? "");
      setLoadingProfile(false);
    }
    void loadProfile();
    return () => { active = false; };
  }, [user, authLoading]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    if (!supabase || !user) return;
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      setProfileError("Il nome utente deve contenere da 3 a 24 caratteri: solo lettere minuscole, numeri e trattino basso.");
      return;
    }
    if (displayName.trim().length < 1 || displayName.trim().length > 40) {
      setProfileError("Il nome visualizzato deve contenere da 1 a 40 caratteri.");
      return;
    }

    setProfileBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), username: cleanUsername })
      .eq("id", user.id);
    if (error) {
      setProfileBusy(false);
      setProfileError(error.message.toLowerCase().includes("duplicate")
        ? "Questo nome utente è già utilizzato. Scegline un altro."
        : `Non è stato possibile salvare il profilo: ${error.message}`);
      return;
    }

    const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
    updateDisplayName(displayName.trim());
    setProfileBusy(false);
    setProfileMessage(metadataError
      ? "Profilo aggiornato. Il nome nel menu potrebbe aggiornarsi al prossimo accesso."
      : "Profilo aggiornato correttamente.");
    setUsername(cleanUsername);
  }

  async function verifyCurrentPassword(passwordToCheck: string) {
    if (!supabase || !user?.email) throw new Error("L'account non ha un indirizzo email utilizzabile per la verifica.");
    if (!passwordToCheck) throw new Error("Inserisci la password attuale per confermare la modifica.");
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: passwordToCheck });
    if (error) throw new Error("La password attuale non è corretta.");
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountError("");
    setAccountMessage("");
    if (!supabase || !user) return;
    const email = newEmail.trim().toLowerCase();
    if (!email || email === user.email?.toLowerCase()) {
      setAccountError("Inserisci un indirizzo email diverso da quello attuale.");
      return;
    }
    setEmailBusy(true);
    try {
      await verifyCurrentPassword(emailCurrentPassword);
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      setAccountMessage("Richiesta inviata. Controlla la nuova casella email e segui il messaggio di conferma di Supabase; in base alle impostazioni potresti ricevere una conferma anche sull'indirizzo attuale.");
      setNewEmail("");
      setEmailCurrentPassword("");
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : "Non è stato possibile cambiare l'email.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountError("");
    setAccountMessage("");
    if (!supabase || !user) return;
    if (newPassword.length < 8) {
      setAccountError("La nuova password deve contenere almeno 8 caratteri.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAccountError("Le due nuove password non coincidono.");
      return;
    }
    setPasswordBusy(true);
    try {
      await verifyCurrentPassword(passwordCurrentPassword);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setAccountMessage("Password aggiornata correttamente. La password non viene mostrata né salvata nel profilo.");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordCurrentPassword("");
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : "Non è stato possibile cambiare la password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  if (authLoading || loadingProfile) {
    return <div className="container page"><div className="loading">Caricamento delle impostazioni…</div></div>;
  }
  if (!user) {
    return <div className="container page"><div className="panel auth-wrap"><h1>Accedi al tuo profilo</h1><p>Le impostazioni sono disponibili soltanto dopo l'accesso.</p><Link className="button button-primary" href="/accedi?next=/profilo">Accedi</Link></div></div>;
  }

  return (
    <div className="container page">
      <div className="breadcrumb"><Link href="/">Esplora</Link><span>›</span><span>Impostazioni profilo</span></div>
      <div className="profile-page-heading">
        <span className="eyebrow"><UserRound size={14} /> Il tuo account</span>
        <h1>Impostazioni del profilo</h1>
        <p>Gestisci il nome che vedono gli altri e le credenziali private del tuo account.</p>
      </div>

      <div className="profile-settings-grid">
        <section className="panel profile-settings-card">
          <h2><UserRound size={18} /> Profilo pubblico</h2>
          <p>Queste informazioni possono essere mostrate accanto ai notebook e ai commenti che pubblichi.</p>
          <form onSubmit={saveProfile}>
            <div className="field">
              <label htmlFor="display-name">Nome visualizzato</label>
              <input id="display-name" required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              <small>È il nome che appare agli altri utenti.</small>
            </div>
            <div className="field">
              <label htmlFor="username"><AtSign size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Nome utente</label>
              <input id="username" required minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="es. studente_2026" />
              <small>Deve essere unico. Usa 3–24 caratteri: lettere, numeri o _ . Non è la credenziale per accedere: per accedere continui a usare la tua email.</small>
            </div>
            {profileError && <div className="alert alert-error" role="alert">{profileError}</div>}
            {profileMessage && <div className="alert alert-success" role="status">{profileMessage}</div>}
            <button className="button button-primary" type="submit" disabled={profileBusy}><Save size={15} />{profileBusy ? "Salvataggio…" : "Salva profilo"}</button>
          </form>
        </section>

        <section className="panel profile-settings-card">
          <h2><ShieldCheck size={18} /> Credenziali private</h2>
          <p>Email e password sono gestite da Supabase Authentication e non vengono mostrate agli altri utenti. La password attuale non è mai leggibile dal sito.</p>
          <div className="private-account-row">
            <span>Email attuale</span><strong>{user.email ?? "Non disponibile"}</strong>
          </div>

          <form onSubmit={changeEmail} className="account-form-section">
            <h3><Mail size={16} /> Cambia indirizzo email</h3>
            <div className="field"><label htmlFor="new-email">Nuova email</label><input id="new-email" type="email" autoComplete="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="nuovoindirizzo@email.it" /></div>
            <div className="field"><label htmlFor="email-current-password">Password attuale</label><input id="email-current-password" type="password" required autoComplete="current-password" value={emailCurrentPassword} onChange={(event) => setEmailCurrentPassword(event.target.value)} /></div>
            <button className="button button-secondary" type="submit" disabled={emailBusy}>{emailBusy ? "Invio richiesta…" : "Richiedi cambio email"}</button>
          </form>

          <form onSubmit={changePassword} className="account-form-section">
            <h3><KeyRound size={16} /> Cambia password</h3>
            <div className="field"><label htmlFor="password-current">Password attuale</label><input id="password-current" type="password" required autoComplete="current-password" value={passwordCurrentPassword} onChange={(event) => setPasswordCurrentPassword(event.target.value)} /></div>
            <div className="field"><label htmlFor="new-password">Nuova password</label><input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Almeno 8 caratteri" /></div>
            <div className="field"><label htmlFor="confirm-password">Ripeti la nuova password</label><input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
            <button className="button button-secondary" type="submit" disabled={passwordBusy}>{passwordBusy ? "Aggiornamento…" : "Aggiorna password"}</button>
          </form>
          {accountError && <div className="alert alert-error" role="alert">{accountError}</div>}
          {accountMessage && <div className="alert alert-success" role="status">{accountMessage}</div>}
          <div className="notice">Non condividere mai la password. Per motivi di sicurezza non è possibile recuperare o visualizzare quella attuale: puoi solo cambiarla.</div>
        </section>
      </div>
      <div className="profile-back-link"><Link href="/?view=miei#risultati" className="button button-ghost"><ArrowLeft size={15} /> Torna ai miei notebook</Link></div>
    </div>
  );
}
