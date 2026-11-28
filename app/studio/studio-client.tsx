"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

type Workspace = {
  id: string;
  title: string;
  subject: string | null;
  education_level: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

const SUBJECTS = [
  "Matematica", "Fisica", "Italiano", "Storia", "Inglese", "Filosofia",
  "Chimica", "Biologia", "Informatica", "Economia", "Diritto", "Arte",
  "Geografia", "Scienze", "Altro",
];

const LEVELS = ["Medie", "Superiori", "Università", "Altro"];

export default function StudioClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Matematica");
  const [level, setLevel] = useState("Superiori");
  const [description, setDescription] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const getAccessToken = useCallback(async () => {
    if (!supabase) throw new Error("Supabase non è configurato.");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      throw new Error("La sessione è scaduta. Accedi nuovamente.");
    }
    return data.session.access_token;
  }, []);

  const loadWorkspaces = useCallback(async () => {
    setListLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as {
        workspaces?: Workspace[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare i notebook.");
      setWorkspaces(result.workspaces ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento.");
    } finally {
      setListLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/accedi?next=/studio");
      return;
    }
    void loadWorkspaces();
  }, [loading, user, router, loadWorkspaces]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          subject: subject || null,
          education_level: level || null,
          description: description.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({})) as {
        workspace?: Workspace;
        error?: string;
      };
      if (!response.ok || !result.workspace) {
        throw new Error(result.error || "Non è stato possibile creare il notebook.");
      }
      setWorkspaces((current) => [result.workspace!, ...current]);
      setTitle("");
      setSubject("Matematica");
      setLevel("Superiori");
      setDescription("");
      setShowCreateForm(false);
      setSuccess("Notebook personale creato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Creazione non riuscita.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkspace(workspace: Workspace) {
    const confirmed = window.confirm(`Vuoi eliminare "${workspace.title}"? Questa operazione eliminerà anche le fonti e le conversazioni collegate.`);
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingId(workspace.id);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/workspaces", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspace_id: workspace.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Eliminazione non riuscita.");
      setWorkspaces((current) => current.filter((item) => item.id !== workspace.id));
      setSuccess("Notebook eliminato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eliminazione non riuscita.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || (user && listLoading && workspaces.length === 0)) {
    return <div className="container page"><div className="loading">Caricamento area studio…</div></div>;
  }

  if (!user) {
    return <div className="container page"><div className="loading">Reindirizzamento all'accesso…</div></div>;
  }

  return (
    <div className="container page">
      <div className="breadcrumb">
        <Link href="/">Esplora</Link><span>›</span><span>Il mio spazio di studio</span>
      </div>

      <section className="panel form-panel">
        <div className="form-heading">
          <span className="eyebrow"><BookOpen size={14} /> Area personale · Beta privata</span>
          <h1>Il tuo spazio di studio.</h1>
          <p>Crea un notebook personale per raccogliere le tue fonti e prepararti a studiare con l'assistente AI. In questa prima versione stiamo attivando le fondamenta: gestione dei notebook, poi documenti e chat.</p>
        </div>

        <div className="form-actions" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <div className="notice" style={{ margin: 0 }}>Nella beta puoi creare fino a 5 notebook personali.</div>
          <button type="button" className="button button-primary" onClick={() => { setShowCreateForm((value) => !value); setError(""); }}>
            <Plus size={16} /> Nuovo notebook
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={createWorkspace} style={{ marginTop: 24 }}>
            <div className="field full">
              <label htmlFor="study-title">Nome del notebook *</label>
              <input
                id="study-title"
                required
                minLength={1}
                maxLength={120}
                placeholder="Es. Analisi matematica — esame"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="study-subject">Materia</label>
                <select id="study-subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
                  {SUBJECTS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="study-level">Livello</label>
                <select id="study-level" value={level} onChange={(event) => setLevel(event.target.value)}>
                  {LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="field full">
              <label htmlFor="study-description">Descrizione (facoltativa)</label>
              <textarea
                id="study-description"
                maxLength={1200}
                rows={3}
                placeholder="Quali argomenti vuoi studiare?"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="button button-secondary" onClick={() => setShowCreateForm(false)}>Annulla</button>
              <button type="submit" className="button button-primary" disabled={saving}>
                {saving ? <LoaderCircle size={16} /> : <Plus size={16} />}
                {saving ? "Creazione…" : "Crea notebook"}
              </button>
            </div>
          </form>
        )}

        {error && <div className="alert alert-error" role="alert" style={{ marginTop: 18 }}>{error}</div>}
        {success && <div className="alert alert-success" role="status" style={{ marginTop: 18 }}>{success}</div>}

        <div style={{ marginTop: 28 }}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">I tuoi contenuti</span>
              <h2 style={{ marginBottom: 0 }}>Notebook personali</h2>
            </div>
            <span className="count-pill">{workspaces.length}/5</span>
          </div>

          {listLoading ? (
            <div className="loading">Aggiornamento elenco…</div>
          ) : workspaces.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 16 }}>
              <BookOpen size={28} />
              <h3>Ancora nessun notebook</h3>
              <p>Crea il primo spazio personale. In seguito potrai aggiungere documenti, porre domande e generare strumenti di studio.</p>
            </div>
          ) : (
            <div className="notebook-grid" style={{ marginTop: 18 }}>
              {workspaces.map((workspace) => (
                <article className="panel notebook-card" key={workspace.id}>
                  <div className="notebook-card-top">
                    <span className="eyebrow">{workspace.subject || "Materia non impostata"}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Elimina ${workspace.title}`}
                      title="Elimina notebook"
                      disabled={deletingId === workspace.id}
                      onClick={() => void deleteWorkspace(workspace)}
                    >
                      {deletingId === workspace.id ? <LoaderCircle size={16} /> : <Trash2 size={16} />}
                    </button>
                  </div>
                  <h3>{workspace.title}</h3>
                  <p>{workspace.description || "Spazio personale pronto per le tue fonti di studio."}</p>
                  <div className="notebook-card-meta">
                    <span>{workspace.education_level || "Livello non impostato"}</span>
                    <span>{new Date(workspace.created_at).toLocaleDateString("it-IT")}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <Link href="/" className="button button-secondary"><ArrowLeft size={15} /> Torna al catalogo</Link>
      </div>
    </div>
  );
}
