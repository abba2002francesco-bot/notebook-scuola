"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ImagePlus, Link2, LoaderCircle, LogOut, ShieldCheck, Sparkles, UploadCloud, WandSparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { isNotebookLmUrl, supabase } from "@/lib/supabase";
import { CONTENT_TYPES, LEVELS, SUBJECTS } from "@/lib/types";

type GoogleCandidate = { name: string; displayName: string; createTime: string | null };
type SourcePreview = { displayName: string; mimeType: string; state: string };
type InspectResponse = {
  status?: "complete" | "needs_selection";
  error?: string;
  message?: string;
  candidates?: GoogleCandidate[];
  title?: string;
  source_count?: number;
  sources?: SourcePreview[];
  suggestions?: { subject?: string; education_level?: string; topic?: string; description?: string; tags?: string[] } | null;
  aiWarning?: string | null;
  metadataNote?: string;
};

export default function UploadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ title: "", url: "", subject: "Matematica", level: "Superiori", topic: "", school: "", tags: "", description: "" });
  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [sourceCount, setSourceCount] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleMessage, setGoogleMessage] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [googleCandidates, setGoogleCandidates] = useState<GoogleCandidate[]>([]);
  const [selectedGoogleNotebook, setSelectedGoogleNotebook] = useState("");
  const [sourcePreview, setSourcePreview] = useState<SourcePreview[]>([]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (type: string) => setContentTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);

  async function getSupabaseAccessToken() {
    if (!supabase) throw new Error("Supabase non è configurato.");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) throw new Error("La sessione è scaduta. Esci e accedi di nuovo a Notebook Scuola.");
    return data.session.access_token;
  }

  useEffect(() => {
    if (!user || !supabase) return;
    let active = true;
    async function checkGoogleConnection() {
      setGoogleStatusLoading(true);
      try {
        const token = await getSupabaseAccessToken();
        const response = await fetch("/api/google/status", { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const data = await response.json().catch(() => ({})) as { connected?: boolean };
        if (active) setGoogleConnected(Boolean(response.ok && data.connected));
      } catch {
        if (active) setGoogleConnected(false);
      } finally {
        if (active) setGoogleStatusLoading(false);
      }
    }
    void checkGoogleConnection();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    if (result === "connected") setGoogleMessage("Account Google collegato. Ora puoi leggere il tuo notebook.");
    else if (result === "denied") setGoogleError("Hai annullato il collegamento Google.");
    else if (result === "refresh_missing") setGoogleError("Google non ha restituito il token di rinnovo. Riprova il collegamento e autorizza l'accesso offline.");
    else setGoogleError("Il collegamento Google non è riuscito. Controlla la configurazione OAuth su Google Cloud e riprova.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function connectGoogle() {
    setGoogleBusy(true); setGoogleError(""); setGoogleMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/google/connect", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Non è stato possibile avviare Google.");
      window.location.assign(data.url);
    } catch (caught) {
      setGoogleError(caught instanceof Error ? caught.message : "Collegamento Google non riuscito.");
      setGoogleBusy(false);
    }
  }

  async function disconnectGoogle() {
    setGoogleBusy(true); setGoogleError("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/google/disconnect", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Non è stato possibile scollegare Google.");
      setGoogleConnected(false);
      setGoogleMessage("Account Google scollegato.");
      setGoogleCandidates([]); setSourcePreview([]);
    } catch (caught) {
      setGoogleError(caught instanceof Error ? caught.message : "Non è stato possibile scollegare Google.");
    } finally { setGoogleBusy(false); }
  }

  async function inspectNotebook(selectedNotebookName?: string) {
    setGoogleBusy(true); setGoogleError(""); setGoogleMessage(""); setSourcePreview([]);
    try {
      if (!isNotebookLmUrl(form.url)) throw new Error("Incolla prima un link pubblico valido di NotebookLM.");
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/notebooklm/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: form.url.trim(), generateAi: aiConsent, ...(selectedNotebookName ? { selectedNotebookName } : {}) }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as InspectResponse;
      if (!response.ok) throw new Error(data.error || "Non è stato possibile leggere il notebook.");
      if (data.status === "needs_selection") {
        setGoogleCandidates(data.candidates ?? []);
        setSelectedGoogleNotebook(data.candidates?.[0]?.name ?? "");
        setGoogleMessage(data.message || "Seleziona il notebook corrispondente al link.");
        return;
      }
      if (!data.title || typeof data.source_count !== "number") throw new Error("Google non ha restituito titolo o numero delle fonti.");
      setGoogleCandidates([]); setSelectedGoogleNotebook(""); setSourcePreview(data.sources ?? []);
      setSourceCount(String(data.source_count));
      setForm((current) => ({
        ...current,
        title: data.title || current.title,
        subject: SUBJECTS.includes(data.suggestions?.subject || "") ? data.suggestions!.subject! : current.subject,
        level: LEVELS.includes(data.suggestions?.education_level || "") ? data.suggestions!.education_level! : current.level,
        topic: data.suggestions?.topic || current.topic,
        description: data.suggestions?.description || current.description,
        tags: data.suggestions?.tags?.join(", ") ?? current.tags,
      }));
      if (data.aiWarning) setGoogleMessage(data.aiWarning);
      else setGoogleMessage("Titolo e numero delle fonti letti da Google; materia, argomento, descrizione e tag sono suggerimenti AI da controllare.");
      if (data.metadataNote) setGoogleMessage((current) => `${current} ${data.metadataNote}`);
    } catch (caught) {
      setGoogleError(caught instanceof Error ? caught.message : "Non è stato possibile completare la lettura.");
    } finally { setGoogleBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!supabase) { setError("Database non configurato. Controlla le variabili Supabase su Vercel."); return; }
    if (!user) { router.push("/accedi?next=/carica"); return; }
    if (!isNotebookLmUrl(form.url)) { setError("Inserisci un link pubblico NotebookLM valido."); return; }
    if (sourceCount === "" || !Number.isInteger(Number(sourceCount)) || Number(sourceCount) < 0 || Number(sourceCount) > 1000) { setError("Indica il numero di fonti del notebook (da 0 a 1000)."); return; }
    if (!consent) { setError("Conferma di avere il diritto di condividere link e immagini."); return; }
    if (files.length > 4 || files.some((file) => file.size > 4 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setError("Carica massimo 4 immagini JPG, PNG o WebP, ognuna entro 4 MB."); return; }

    setBusy(true); const paths: string[] = [];
    try {
      for (const file of files) {
        const path = `${user.id}/${crypto.randomUUID()}-${file.name.toLowerCase().replace(/[^a-z0-9.-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage.from("notebook-images").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        paths.push(path);
      }
      const { data, error: insertError } = await supabase.from("notebooks").insert({
        user_id: user.id, title: form.title.trim(), notebook_url: form.url.trim(), subject: form.subject,
        education_level: form.level, topic: form.topic.trim() || null, school: form.school.trim() || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
        content_types: contentTypes, description: form.description.trim(), image_paths: paths,
        source_count: Number(sourceCount),
      }).select("id").single();
      if (insertError) throw insertError;
      router.push(`/notebook/${data.id}?created=1`);
    } catch (caught) {
      if (paths.length) await supabase.storage.from("notebook-images").remove(paths);
      setError(`Pubblicazione non riuscita: ${caught instanceof Error ? caught.message : "errore imprevisto"}`);
    } finally { setBusy(false); }
  }

  if (loading) return <div className="container page"><div className="loading">Controllo dell'accesso…</div></div>;
  if (!user) return <div className="container page"><div className="panel auth-wrap"><span className="eyebrow">La community</span><h1>Accedi per condividere</h1><p>Per pubblicare e gestire le tue risorse serve un account gratuito.</p><Link className="button button-primary" href="/accedi?next=/carica">Accedi</Link><p className="auth-switch">Non hai un account? <Link href="/registrati">Registrati</Link></p></div></div>;

  return (
    <div className="container page">
      <div className="breadcrumb"><Link href="/">Esplora</Link><span>›</span><span>Condividi un notebook</span></div>
      <div className="panel form-panel">
        <div className="form-heading"><span className="eyebrow"><UploadCloud size={14} /> Condividi con la community</span><h1>Pubblica il tuo notebook</h1><p>Incolla il link pubblico. Google può leggere il titolo e contare le fonti; con il tuo consenso, Gemini propone una bozza dei campi descrittivi da controllare.</p></div>

        <form onSubmit={submit}>
          <div className="field full"><label htmlFor="url"><Link2 size={14} style={{ verticalAlign: "-2px", marginRight: 5 }} />Link pubblico NotebookLM *</label><input id="url" type="url" required placeholder="https://notebooklm.link.google/…" value={form.url} onChange={(event) => update("url", event.target.value)} /><small>In NotebookLM abilita l'accesso pubblico prima di copiare il link.</small></div>

        <section className="notice" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <strong><Sparkles size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />Assistente di pubblicazione</strong>
            {googleConnected ? <span style={{ color: "#23694d", fontWeight: 700, fontSize: 12 }}><CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Google collegato</span> : <span style={{ color: "var(--muted)", fontSize: 12 }}>{googleStatusLoading ? "Controllo…" : "Google non collegato"}</span>}
          </div>
          <p style={{ margin: "9px 0 12px", lineHeight: 1.55 }}>L'accesso richiesto è di sola lettura. Il sito non può modificare o cancellare i tuoi notebook Google. Puoi scollegare l'account quando vuoi.</p>
          <p style={{ margin: "0 0 12px", lineHeight: 1.55 }}>Durante la Public Preview della Gemini Notebook API sono supportati gli account Google personali; gli account Google Workspace scolastici non sono attualmente supportati. Prima di collegare Google, leggi l'<Link href="/privacy" style={{ color: "var(--accent)", fontWeight: 700 }}>informativa privacy</Link>.</p>
          <label className="check-chip" style={{ alignItems: "flex-start", lineHeight: 1.5, marginBottom: 12 }}>
            <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
            <span>Autorizzo l'invio a Gemini del titolo e dei nomi, tipi e stati delle fonti per suggerire materia, argomento, descrizione e tag. I testi integrali dei documenti non vengono inviati. Nel livello gratuito di Gemini API i prompt possono essere usati da Google per migliorare i prodotti; non inserire dati personali o riservati.</span>
          </label>
          <div className="form-actions" style={{ marginTop: 0 }}>
            {!googleConnected ? <button type="button" className="button button-secondary" onClick={connectGoogle} disabled={googleBusy || googleStatusLoading}>{googleBusy ? <LoaderCircle size={15} /> : <Link2 size={15} />}Collega account Google</button> : <button type="button" className="button button-secondary" onClick={disconnectGoogle} disabled={googleBusy}><LogOut size={15} />Scollega Google</button>}
            <button type="button" className="button button-primary" onClick={() => void inspectNotebook()} disabled={!googleConnected || googleBusy || !form.url.trim()}>{googleBusy ? <LoaderCircle size={15} /> : <WandSparkles size={15} />}Leggi e compila i campi</button>
          </div>
          {googleCandidates.length > 0 && <div className="field" style={{ marginTop: 16, marginBottom: 0 }}><label htmlFor="google-notebook-choice">Seleziona il notebook corrispondente al link</label><select id="google-notebook-choice" value={selectedGoogleNotebook} onChange={(event) => setSelectedGoogleNotebook(event.target.value)}>{googleCandidates.map((item) => <option key={item.name} value={item.name}>{item.displayName}{item.createTime ? ` — ${new Date(item.createTime).toLocaleDateString("it-IT")}` : ""}</option>)}</select><button type="button" className="button button-primary" style={{ marginTop: 10 }} onClick={() => void inspectNotebook(selectedGoogleNotebook)} disabled={!selectedGoogleNotebook || googleBusy}>Usa questo notebook</button></div>}
          {googleMessage && <div className="alert alert-success" style={{ marginBottom: 0 }} role="status">{googleMessage}</div>}
          {googleError && <div className="alert alert-error" style={{ marginBottom: 0 }} role="alert">{googleError}</div>}
          {sourcePreview.length > 0 && <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Visualizza le {sourcePreview.length} fonti lette</summary><ul style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.7 }}>{sourcePreview.map((source, index) => <li key={`${source.displayName}-${index}`}>{source.displayName} <span style={{ color: "var(--muted)" }}>({source.mimeType}, {source.state})</span></li>)}</ul></details>}
          <small style={{ display: "block", marginTop: 10, lineHeight: 1.5 }}>Il numero di fonti e il titolo vengono letti da Google. Le categorie Audio, Video, Quiz e Flashcard vanno verificate e selezionate manualmente. Puoi lasciare deselezionata l'autorizzazione AI e compilare gli altri campi a mano.</small>
        </section>
          <div className="field full"><label htmlFor="title">Titolo del notebook *</label><input id="title" required minLength={4} maxLength={100} placeholder="Es. Rivoluzione francese — ripasso completo" value={form.title} onChange={(event) => update("title", event.target.value)} /></div>
          <div className="form-grid">
            <div className="field"><label>Materia *</label><select value={form.subject} onChange={(event) => update("subject", event.target.value)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label>Livello *</label><select value={form.level} onChange={(event) => update("level", event.target.value)}>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="source-count">Numero di fonti *</label><input id="source-count" type="number" inputMode="numeric" min="0" max="1000" step="1" required value={sourceCount} onChange={(event) => setSourceCount(event.target.value)} placeholder="Es. 12" /><small>Compilato automaticamente quando Google riesce a leggere il notebook; puoi correggerlo.</small></div>
            <div className="field"><label>Argomento</label><input maxLength={80} placeholder="Es. Prima guerra mondiale" value={form.topic} onChange={(event) => update("topic", event.target.value)} /></div>
            <div className="field"><label>Indirizzo scolastico (facoltativo)</label><input maxLength={80} placeholder="Es. Liceo scientifico" value={form.school} onChange={(event) => update("school", event.target.value)} /><small>Evita il nome preciso della scuola e dati personali.</small></div>
          </div>
          <div className="field full"><label>Che cosa contiene?</label><div className="checkbox-grid">{CONTENT_TYPES.map((item) => <label className="check-chip" key={item}><input type="checkbox" checked={contentTypes.includes(item)} onChange={() => toggle(item)} />{item}</label>)}</div><small>Seleziona soltanto gli strumenti/artefatti effettivamente presenti nel notebook. L'API Google non fornisce questo elenco.</small></div>
          <div className="field full"><label>Tag</label><input placeholder="Es. maturità, algebra, verifica (separati da virgola)" value={form.tags} onChange={(event) => update("tags", event.target.value)} /><small>Massimo 10 tag.</small></div>
          <div className="field full"><label htmlFor="description">Descrizione *</label><textarea id="description" required minLength={20} maxLength={1200} placeholder="Spiega cosa si trova nel notebook, quali argomenti tratta e a chi può essere utile…" value={form.description} onChange={(event) => update("description", event.target.value)} /><small>{form.description.length}/1200 caratteri. Controlla sempre la bozza AI prima di pubblicare.</small></div>
          <div className="field full"><label><ImagePlus size={14} style={{ verticalAlign: "-2px", marginRight: 5 }} />Immagini di anteprima (facoltative)</label><div className="upload-zone"><ImagePlus size={24} /><div style={{ marginTop: 8, fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>Mostra cosa troveranno nel notebook</div><div style={{ fontSize: 12, marginTop: 4 }}>Fino a 4 immagini JPG, PNG o WebP · massimo 4 MB ciascuna</div><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 4))} /></div>{files.length > 0 && <small>{files.length} immagini selezionate: {files.map((file) => file.name).join(", ")}</small>}</div>
          <label className="check-chip" style={{ alignItems: "flex-start", lineHeight: 1.5, marginBottom: 14 }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Confermo di avere il diritto di condividere il link e le immagini, di non includere dati personali di terzi e di non violare diritti d'autore. *</span></label>
          <div className="notice"><ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} />Il notebook resta ospitato su NotebookLM. Qui pubblichi soltanto il link, le informazioni, il conteggio delle fonti e le immagini di anteprima.</div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="form-actions"><Link href="/" className="button button-secondary"><ArrowLeft size={15} />Annulla</Link><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Pubblicazione…" : "Pubblica notebook"}<UploadCloud size={16} /></button></div>
        </form>
      </div>
    </div>
  );
}
