"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, FileText, Layers, LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { STUDY_SUPABASE_URL, STUDY_SUPABASE_PUBLISHABLE_KEY } from "@/lib/study-api";

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

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SOURCE_BUCKET = "study-source-files";
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const studyStorageClient = createClient(STUDY_SUPABASE_URL, STUDY_SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

type Source = {
  id: string;
  workspace_id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  status: "uploaded" | "processing" | "extracted" | "ready" | "failed";
  page_count: number | null;
  extracted_char_count: number;
  chunk_count: number;
  chunked_at: string | null;
  failure_code: string | null;
  created_at: string;
  processed_at: string | null;
};

function formatFileSize(value: number) {
  if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

function sourceStatusLabel(source: Source) {
  if (source.status === "extracted" || source.status === "ready") return "Testo estratto";
  if (source.status === "processing") return "Elaborazione";
  if (source.status === "failed") return "Da riprovare";
  return "Caricato";
}

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
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [chunkingId, setChunkingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const loadSources = useCallback(async (workspaceId: string) => {
    setSourcesLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/sources?workspace_id=" + encodeURIComponent(workspaceId), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as { sources?: Source[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare i documenti.");
      setSources(result.sources ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento dei documenti.");
    } finally {
      setSourcesLoading(false);
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

  useEffect(() => {
    if (!selectedWorkspaceId || !user || loading) {
      setSources([]);
      return;
    }
    void loadSources(selectedWorkspaceId);
  }, [selectedWorkspaceId, user, loading, loadSources]);

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
      setSelectedWorkspaceId(result.workspace!.id);
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
      if (selectedWorkspaceId === workspace.id) {
        setSelectedWorkspaceId(null);
        setSources([]);
      }
      setSuccess("Notebook eliminato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eliminazione non riuscita.");
    } finally {
      setDeletingId(null);
    }
  }

  async function uploadSource(file: File) {
    if (!selectedWorkspaceId) {
      setError("Seleziona prima un notebook.");
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop() || "";
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType) {
      setError("Formato non supportato. Puoi caricare PDF, DOCX o PPTX.");
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      setError("Il file deve pesare al massimo 20 MB.");
      return;
    }

    setError("");
    setSuccess("");
    setUploading(true);

    try {
      const token = await getAccessToken();
      setUploadStage("Preparazione del caricamento…");

      const prepareResponse = await fetch("/api/studio/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          workspace_id: selectedWorkspaceId,
          filename: file.name,
          mime_type: mimeType,
          byte_size: file.size,
        }),
      });
      const prepared = await prepareResponse.json().catch(() => ({})) as {
        source?: Source;
        upload?: { path: string; token: string };
        error?: string;
      };

      if (!prepareResponse.ok || !prepared.source || !prepared.upload?.path || !prepared.upload.token) {
        throw new Error(prepared.error || "Non è stato possibile preparare il caricamento.");
      }

      setUploadStage("Caricamento del file…");
      const { error: storageError } = await studyStorageClient.storage
        .from(SOURCE_BUCKET)
        .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (storageError) {
        await fetch("/api/studio/sources", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ source_id: prepared.source.id }),
        }).catch(() => undefined);
        throw new Error("Il caricamento del file non è riuscito: " + storageError.message);
      }

      setUploadStage("Estrazione del testo e delle pagine…");
      const processResponse = await fetch("/api/studio/sources/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ source_id: prepared.source.id }),
      });
      const processed = await processResponse.json().catch(() => ({})) as { error?: string };

      await loadSources(selectedWorkspaceId);
      if (!processResponse.ok) {
        throw new Error(processed.error || "Il file è stato caricato ma l'estrazione non è riuscita.");
      }

      setSuccess("Documento caricato e testo estratto. L'indice semantico e l'assistente AI saranno aggiunti nella fase successiva.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Caricamento non riuscito.");
      if (selectedWorkspaceId) await loadSources(selectedWorkspaceId);
    } finally {
      setUploading(false);
      setUploadStage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }


  async function prepareSourceChunks(source: Source) {
    if (source.status !== "extracted") return;

    setError("");
    setSuccess("");
    setChunkingId(source.id);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/sources/chunk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ source_id: source.id }),
      });
      const result = await response.json().catch(() => ({})) as {
        chunk_count?: number;
        error?: string;
        embedding_status?: string;
      };

      if (!response.ok || !Number.isInteger(result.chunk_count)) {
        throw new Error(result.error || "Non è stato possibile creare i segmenti.");
      }

      if (selectedWorkspaceId) await loadSources(selectedWorkspaceId);
      setSuccess(
        "Testo suddiviso in " + result.chunk_count +
        " segmenti con riferimenti alle pagine. Nessuna chiamata AI o costo per modelli."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preparazione dei segmenti non riuscita.");
    } finally {
      setChunkingId(null);
    }
  }

  async function deleteSource(source: Source) {
    const confirmed = window.confirm("Vuoi eliminare il documento \"" + source.original_filename + "\" e il testo estratto?");
    if (!confirmed) return;

    setError("");
    setSuccess("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/sources", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ source_id: source.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Eliminazione non riuscita.");
      if (selectedWorkspaceId) await loadSources(selectedWorkspaceId);
      setSuccess("Documento eliminato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eliminazione non riuscita.");
    }
  }

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

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
                  <div className="notebook-card-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setSelectedWorkspaceId(workspace.id)}
                    >
                      <FileText size={15} /> Gestisci fonti
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {selectedWorkspace && (
            <section className="source-manager" aria-labelledby="study-sources-title">
              <div className="source-manager-heading">
                <div>
                  <span className="eyebrow">Fonti del notebook</span>
                  <h2 id="study-sources-title">{selectedWorkspace.title}</h2>
                  <p>Carica PDF, Word o PowerPoint. I documenti restano privati e vengono trasformati in testo consultabile per la fase AI successiva.</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Chiudi gestione fonti"
                  title="Chiudi"
                  onClick={() => { setSelectedWorkspaceId(null); setSources([]); setError(""); setSuccess(""); }}
                >
                  ×
                </button>
              </div>

              <div className="source-toolbar">
                <div className="notice" style={{ margin: 0 }}>
                  Massimo 20 MB per file · 25 file · 100 MB per notebook
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <LoaderCircle size={16} /> : <Upload size={16} />}
                  {uploading ? "Caricamento…" : "Carica documento"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  hidden
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadSource(file);
                  }}
                />
              </div>

              {uploading && (
                <div className="source-progress" role="status">
                  <LoaderCircle size={16} /> {uploadStage || "Elaborazione del documento…"}
                </div>
              )}

              {sourcesLoading ? (
                <div className="loading">Caricamento documenti…</div>
              ) : sources.length === 0 ? (
                <div className="empty-state source-empty">
                  <FileText size={26} />
                  <h3>Nessuna fonte ancora</h3>
                  <p>Carica il primo PDF, DOCX o PPTX per iniziare a costruire la raccolta di studio.</p>
                </div>
              ) : (
                <div className="source-list">
                  {sources.map((source) => (
                    <article className="source-row" key={source.id}>
                      <div className="source-icon"><FileText size={20} /></div>
                      <div className="source-main">
                        <strong>{source.original_filename}</strong>
                        <div className="source-meta">
                          <span>{formatFileSize(Number(source.byte_size))}</span>
                          <span>
                            {source.page_count
                              ? (source.mime_type === MIME_BY_EXTENSION.pptx
                                ? source.page_count + " diapositive"
                                : source.page_count + " pagine")
                              : "Paginazione non disponibile"}
                          </span>
                          {source.extracted_char_count > 0 && (
                            <span>{Number(source.extracted_char_count).toLocaleString("it-IT")} caratteri estratti</span>
                          )}
                          {source.chunk_count > 0 && (
                            <span>{source.chunk_count} segmenti pronti</span>
                          )}
                        </div>
                        {source.failure_code === "no_text_content" && (
                          <p className="source-warning">Non è stato trovato testo selezionabile. I PDF scansionati richiederanno OCR.</p>
                        )}
                        {source.status === "extracted" && (
                          <div style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                              disabled={chunkingId !== null}
                              onClick={() => void prepareSourceChunks(source)}
                            >
                              {chunkingId === source.id ? <LoaderCircle size={14} /> : <Layers size={14} />}
                              {chunkingId === source.id
                                ? "Preparazione…"
                                : source.chunk_count > 0 ? "Rigenera segmenti" : "Prepara segmenti"}
                            </button>
                          </div>
                        )}
                      </div>
                      <span className={"source-status source-status-" + source.status}>{sourceStatusLabel(source)}</span>
                      <button
                        type="button"
                        className="icon-button"
                        title="Elimina documento"
                        aria-label={"Elimina " + source.original_filename}
                        onClick={() => void deleteSource(source)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              )}

              <p className="source-next-step">
                Gli embedding, la ricerca semantica e la chat AI saranno attivati dopo la scelta e il collaudo del modello. In questa fase la segmentazione non effettua chiamate AI.
              </p>
            </section>
          )}
        </div>
      </section>

      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <Link href="/" className="button button-secondary"><ArrowLeft size={15} /> Torna al catalogo</Link>
      </div>
    </div>
  );
}
