
"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Notebook = {
  id: string;
  user_id: string;
  title: string;
  notebook_url: string | null;
  subject: string | null;
  education_level: string | null;
  topic: string | null;
  school: string | null;
  tags: string[] | null;
  content_types: string[] | null;
  description: string | null;
  image_paths: string[] | null;
  created_at: string;
  updated_at: string | null;
  source_count: number | null;
};

type CommentRow = {
  id: string;
  notebook_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ReportRow = {
  id: string;
  notebook_id: string;
  user_id: string;
  reason: string;
  details: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  username: string;
};

type EditDraft = {
  title: string;
  subject: string;
  education_level: string;
  topic: string;
  school: string;
  description: string;
  tags: string;
  source_count: string;
};

type Tab = "notebooks" | "comments" | "reports";
type PageStatus = "checking" | "admin" | "signed-out" | "denied" | "error";

const emptyDraft: EditDraft = {
  title: "",
  subject: "",
  education_level: "",
  topic: "",
  school: "",
  description: "",
  tags: "",
  source_count: "",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("it-IT");
}

export default function AdminPage() {
  const [status, setStatus] = useState<PageStatus>("checking");
  const [pageError, setPageError] = useState("");
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<Tab>("notebooks");
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Notebook | null>(null);
  const [draft, setDraft] = useState<EditDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");

  const loadData = useCallback(async () => {
    if (!supabase) {
      setPageError("Il collegamento a Supabase non è configurato.");
      setStatus("error");
      return;
    }

    setStatus("checking");
    setPageError("");
    setWarning("");

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setStatus("signed-out");
      return;
    }

    setEmail(authData.user.email ?? "");

    const { data: adminResult, error: adminError } =
      await supabase.rpc("is_app_admin");

    if (adminError) {
      setPageError(
        `Non riesco a verificare il ruolo amministratore: ${adminError.message}`
      );
      setStatus("error");
      return;
    }

    if (adminResult !== true) {
      setStatus("denied");
      return;
    }

    const [notebookResult, commentResult, reportResult] = await Promise.all([
      supabase
        .from("notebooks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),

      supabase
        .from("notebook_comments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),

      supabase
        .from("notebook_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (notebookResult.error) {
      setPageError(
        `Errore nel caricamento dei notebook: ${notebookResult.error.message}`
      );
      setStatus("error");
      return;
    }

    const notebookRows = (notebookResult.data ?? []) as Notebook[];
    const commentRows = (commentResult.data ?? []) as CommentRow[];
    const reportRows = (reportResult.data ?? []) as ReportRow[];

    setNotebooks(notebookRows);
    setComments(commentRows);
    setReports(reportRows);

    const profileIds = Array.from(
      new Set([
        ...notebookRows.map((row) => row.user_id),
        ...commentRows.map((row) => row.user_id),
        ...reportRows.map((row) => row.user_id),
      ])
    );

    if (profileIds.length) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", profileIds);

      if (!profileError && profileData) {
        const mapped: Record<string, ProfileRow> = {};

        (profileData as ProfileRow[]).forEach((profile) => {
          mapped[profile.id] = profile;
        });

        setProfiles(mapped);
      }
    } else {
      setProfiles({});
    }

    if (commentResult.error || reportResult.error) {
      const parts = [
        commentResult.error
          ? `commenti: ${commentResult.error.message}`
          : "",
        reportResult.error
          ? `segnalazioni: ${reportResult.error.message}`
          : "",
      ].filter(Boolean);

      setWarning(`Alcuni elenchi non sono disponibili (${parts.join("; ")}).`);
    }

    setStatus("admin");
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredNotebooks = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return notebooks;

    return notebooks.filter((notebook) => {
      const author = profiles[notebook.user_id];

      const values = [
        notebook.title,
        notebook.subject,
        notebook.topic,
        notebook.school,
        notebook.description,
        author?.display_name,
        author?.username,
        notebook.user_id,
      ];

      return values.some((value) =>
        value?.toLowerCase().includes(query)
      );
    });
  }, [notebooks, profiles, search]);

  const notebookTitles = useMemo(() => {
    const mapped: Record<string, string> = {};

    notebooks.forEach((notebook) => {
      mapped[notebook.id] = notebook.title;
    });

    return mapped;
  }, [notebooks]);

  function openEditor(notebook: Notebook) {
    setEditing(notebook);

    setDraft({
      title: notebook.title ?? "",
      subject: notebook.subject ?? "",
      education_level: notebook.education_level ?? "",
      topic: notebook.topic ?? "",
      school: notebook.school ?? "",
      description: notebook.description ?? "",
      tags: (notebook.tags ?? []).join(", "),
      source_count:
        notebook.source_count == null
          ? ""
          : String(notebook.source_count),
    });

    setNotice("");
  }

  async function saveNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !editing) return;

    if (!draft.title.trim()) {
      setNotice("Il titolo non può essere vuoto.");
      return;
    }

    const sourceCount =
      draft.source_count.trim() === ""
        ? null
        : Number(draft.source_count);

    if (
      sourceCount !== null &&
      (!Number.isInteger(sourceCount) || sourceCount < 0)
    ) {
      setNotice(
        "Il numero delle fonti deve essere un intero positivo o vuoto."
      );
      return;
    }

    setBusy(true);
    setNotice("");

    const { error } = await supabase
      .from("notebooks")
      .update({
        title: draft.title.trim(),
        subject: draft.subject.trim() || null,
        education_level: draft.education_level.trim() || null,
        topic: draft.topic.trim() || null,
        school: draft.school.trim() || null,
        description: draft.description.trim() || null,
        tags: draft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        source_count: sourceCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id);

    setBusy(false);

    if (error) {
      setNotice(`Modifica non riuscita: ${error.message}`);
      return;
    }

    setNotice("Notebook aggiornato correttamente.");
    setEditing(null);

    await loadData();
  }

  async function deleteNotebook(notebook: Notebook) {
    if (!supabase) return;

    const confirmed = window.confirm(
      `Vuoi eliminare definitivamente il notebook “${notebook.title}”? \n\nL'operazione non è annullabile. La rimozione della scheda non garantisce da sola la cancellazione degli eventuali file già presenti in Storage.`
    );

    if (!confirmed) return;

    setBusy(true);
    setNotice("");

    const { error } = await supabase
      .from("notebooks")
      .delete()
      .eq("id", notebook.id);

    setBusy(false);

    if (error) {
      setNotice(`Eliminazione non riuscita: ${error.message}`);
      return;
    }

    setNotice(
      "Notebook eliminato. Gli eventuali file Storage vanno verificati separatamente."
    );

    if (editing?.id === notebook.id) {
      setEditing(null);
    }

    await loadData();
  }

  async function deleteComment(comment: CommentRow) {
    if (!supabase) return;

    const confirmed = window.confirm(
      "Vuoi eliminare definitivamente questo commento?"
    );

    if (!confirmed) return;

    setBusy(true);
    setNotice("");

    const { error } = await supabase
      .from("notebook_comments")
      .delete()
      .eq("id", comment.id);

    setBusy(false);

    if (error) {
      setNotice(`Eliminazione commento non riuscita: ${error.message}`);
      return;
    }

    setComments((current) =>
      current.filter((item) => item.id !== comment.id)
    );

    setNotice("Commento eliminato.");
  }

  if (status === "checking") {
    return (
      <main className="admin-page">
        <div className="admin-shell">
          <p>Verifica dei permessi amministratore…</p>
        </div>
      </main>
    );
  }

  if (status === "signed-out") {
    return (
      <main className="admin-page">
        <div className="admin-shell admin-message">
          <h1>Area amministratore</h1>
          <p>Per accedere devi prima effettuare il login.</p>
          <Link
            className="admin-button admin-button-primary"
            href="/accedi"
          >
            Vai all'accesso
          </Link>
        </div>
      </main>
    );
  }

  if (status === "denied") {
    return (
      <main className="admin-page">
        <div className="admin-shell admin-message">
          <h1>Accesso non autorizzato</h1>
          <p>
            Questo account non dispone dei permessi amministrativi di
            Notebook Scuola.
          </p>
          <Link className="admin-button" href="/">
            Torna alla homepage
          </Link>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="admin-page">
        <div className="admin-shell admin-message">
          <h1>Area amministratore</h1>
          <p className="admin-error">{pageError}</p>
          <button
            className="admin-button"
            onClick={() => void loadData()}
          >
            Riprova
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <style jsx>{`
        .admin-page {
          min-height: 100vh;
          padding: 28px 16px 56px;
          background: #f5f7fb;
          color: #172033;
        }

        .admin-shell {
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 24px;
        }

        .admin-kicker {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #53627a;
        }

        .admin-title {
          font-size: clamp(27px, 4vw, 38px);
          line-height: 1.1;
          margin: 7px 0 8px;
        }

        .admin-muted {
          color: #64748b;
          font-size: 14px;
          line-height: 1.55;
        }

        .admin-chip {
          display: inline-flex;
          align-items: center;
          padding: 7px 11px;
          border-radius: 999px;
          background: #e7f7ed;
          color: #17683a;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }

        .admin-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 20px 0;
        }

        .admin-stat,
        .admin-card,
        .admin-editor {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.035);
        }

        .admin-stat strong {
          display: block;
          font-size: 26px;
          margin-top: 5px;
        }

        .admin-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin: 20px 0 14px;
        }

        .admin-tab,
        .admin-button {
          border: 1px solid #d5dce7;
          border-radius: 10px;
          padding: 10px 14px;
          background: #fff;
          color: #172033;
          font-weight: 650;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 14px;
        }

        .admin-tab[aria-selected="true"],
        .admin-button-primary {
          background: #173b70;
          border-color: #173b70;
          color: #fff;
        }

        .admin-toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 14px;
        }

        .admin-input,
        .admin-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 11px 12px;
          background: #fff;
          color: #172033;
          font: inherit;
          font-size: 14px;
        }

        .admin-textarea {
          min-height: 100px;
          resize: vertical;
        }

        .admin-list {
          display: grid;
          gap: 12px;
        }

        .admin-card-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .admin-card h3 {
          font-size: 17px;
          line-height: 1.35;
          margin: 0 0 7px;
          overflow-wrap: anywhere;
        }

        .admin-meta {
          font-size: 12px;
          color: #64748b;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .admin-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 13px;
        }

        .admin-field {
          display: grid;
          gap: 6px;
          margin: 12px 0;
        }

        .admin-field label {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
        }

        .admin-editor {
          margin: 15px 0;
          border-color: #9db8dc;
        }

        .admin-notice {
          padding: 11px 13px;
          border-radius: 10px;
          background: #eff6ff;
          color: #1e40af;
          font-size: 13px;
          margin: 14px 0;
          overflow-wrap: anywhere;
        }

        .admin-warning {
          padding: 11px 13px;
          border-radius: 10px;
          background: #fff7ed;
          color: #9a3412;
          font-size: 13px;
          margin: 14px 0;
        }

        .admin-error {
          color: #b91c1c;
        }

        .admin-message {
          max-width: 620px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px;
          margin: 8vh auto;
        }

        .admin-empty {
          padding: 24px;
          text-align: center;
          color: #64748b;
          background: #fff;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
        }

        @media (max-width: 640px) {
          .admin-page {
            padding: 18px 12px 40px;
          }

          .admin-header {
            display: block;
          }

          .admin-chip {
            margin-top: 10px;
          }

          .admin-stats {
            grid-template-columns: 1fr 1fr;
          }

          .admin-stat:last-child {
            grid-column: 1 / -1;
          }

          .admin-card-head {
            display: block;
          }

          .admin-actions .admin-button {
            flex: 1 1 130px;
          }

          .admin-toolbar {
            display: block;
          }

          .admin-toolbar > * {
            margin-bottom: 8px;
            width: 100%;
          }

          .admin-tab {
            flex: 1 1 auto;
          }
        }
      `}</style>

      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <div className="admin-kicker">
              Notebook Scuola · Gestione
            </div>

            <h1 className="admin-title">
              Area amministratore
            </h1>

            <p className="admin-muted">
              Gestisci notebook, commenti e segnalazioni della community.
            </p>

            <p className="admin-meta">
              Connesso come {email}
            </p>
          </div>

          <span className="admin-chip">
            Super Admin
          </span>
        </header>

        <section className="admin-stats" aria-label="Riepilogo">
          <div className="admin-stat">
            <span className="admin-meta">
              Notebook caricati (ultimi 300)
            </span>
            <strong>{notebooks.length}</strong>
          </div>

          <div className="admin-stat">
            <span className="admin-meta">
              Commenti (ultimi 300)
            </span>
            <strong>{comments.length}</strong>
          </div>

          <div className="admin-stat">
            <span className="admin-meta">
              Segnalazioni (ultime 300)
            </span>
            <strong>{reports.length}</strong>
          </div>
        </section>

        {notice && (
          <div className="admin-notice" role="status">
            {notice}
          </div>
        )}

        {warning && (
          <div className="admin-warning" role="status">
            {warning}
          </div>
        )}

        <nav className="admin-tabs" aria-label="Sezioni amministratore">
          <button
            className="admin-tab"
            aria-selected={tab === "notebooks"}
            onClick={() => setTab("notebooks")}
          >
            Notebook ({notebooks.length})
          </button>

          <button
            className="admin-tab"
            aria-selected={tab === "comments"}
            onClick={() => setTab("comments")}
          >
            Commenti ({comments.length})
          </button>

          <button
            className="admin-tab"
            aria-selected={tab === "reports"}
            onClick={() => setTab("reports")}
          >
            Segnalazioni ({reports.length})
          </button>
        </nav>

        {tab === "notebooks" && (
          <>
            <div className="admin-toolbar">
              <input
                className="admin-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca per titolo, materia, autore o argomento…"
                aria-label="Cerca notebook"
              />

              <button
                className="admin-button"
                onClick={() => void loadData()}
                disabled={busy}
              >
                Aggiorna elenco
              </button>
            </div>

            {editing && (
              <section className="admin-editor">
                <div className="admin-card-head">
                  <div>
                    <div className="admin-kicker">
                      Modifica notebook
                    </div>
                    <h2>{editing.title}</h2>
                  </div>

                  <button
                    className="admin-button"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    Chiudi
                  </button>
                </div>

                <form onSubmit={saveNotebook}>
                  <div className="admin-field">
                    <label htmlFor="admin-title">Titolo</label>
                    <input
                      id="admin-title"
                      className="admin-input"
                      required
                      maxLength={180}
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-subject">Materia</label>
                    <input
                      id="admin-subject"
                      className="admin-input"
                      value={draft.subject}
                      onChange={(event) =>
                        setDraft({ ...draft, subject: event.target.value })
                      }
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-topic">Argomento</label>
                    <input
                      id="admin-topic"
                      className="admin-input"
                      value={draft.topic}
                      onChange={(event) =>
                        setDraft({ ...draft, topic: event.target.value })
                      }
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-level">Livello scolastico</label>
                    <input
                      id="admin-level"
                      className="admin-input"
                      value={draft.education_level}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          education_level: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-school">Scuola</label>
                    <input
                      id="admin-school"
                      className="admin-input"
                      value={draft.school}
                      onChange={(event) =>
                        setDraft({ ...draft, school: event.target.value })
                      }
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-description">Descrizione</label>
                    <textarea
                      id="admin-description"
                      className="admin-textarea"
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          description: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-tags">
                      Tag (separati da virgola)
                    </label>
                    <input
                      id="admin-tags"
                      className="admin-input"
                      value={draft.tags}
                      onChange={(event) =>
                        setDraft({ ...draft, tags: event.target.value })
                      }
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-sources">Numero fonti</label>
                    <input
                      id="admin-sources"
                      className="admin-input"
                      type="number"
                      min="0"
                      step="1"
                      value={draft.source_count}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          source_count: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="admin-actions">
                    <button
                      className="admin-button admin-button-primary"
                      type="submit"
                      disabled={busy}
                    >
                      {busy ? "Salvataggio…" : "Salva modifiche"}
                    </button>

                    <button
                      className="admin-button"
                      type="button"
                      onClick={() => setEditing(null)}
                      disabled={busy}
                    >
                      Annulla
                    </button>
                  </div>
                </form>
              </section>
            )}

            <div className="admin-list">
              {filteredNotebooks.map((notebook) => {
                const author = profiles[notebook.user_id];

                return (
                  <article className="admin-card" key={notebook.id}>
                    <div className="admin-card-head">
                      <div>
                        <h3>{notebook.title}</h3>

                        <div className="admin-meta">
                          {notebook.subject || "Materia non indicata"} ·{" "}
                          {notebook.topic || "Argomento non indicato"}
                        </div>

                        <div className="admin-meta">
                          Autore: {author?.display_name || "Studente"}
                          {author?.username
                            ? ` (@${author.username})`
                            : ""}{" "}
                          · Pubblicato: {formatDate(notebook.created_at)}
                        </div>

                        <div className="admin-meta">
                          ID autore: {notebook.user_id}
                        </div>
                      </div>

                      <span className="admin-chip">
                        {notebook.source_count ?? 0} fonti
                      </span>
                    </div>

                    {notebook.description && (
                      <p className="admin-muted">
                        {notebook.description}
                      </p>
                    )}

                    <div className="admin-meta">
                      Tag: {(notebook.tags ?? []).join(", ") || "Nessuno"}
                    </div>

                    <div className="admin-actions">
                      <button
                        className="admin-button admin-button-primary"
                        onClick={() => openEditor(notebook)}
                        disabled={busy}
                      >
                        Modifica
                      </button>

                      <Link
                        className="admin-button"
                        href={`/notebook/${notebook.id}`}
                      >
                        Apri notebook
                      </Link>

                      <button
                        className="admin-button"
                        onClick={() => void deleteNotebook(notebook)}
                        disabled={busy}
                      >
                        Elimina
                      </button>
                    </div>
                  </article>
                );
              })}

              {filteredNotebooks.length === 0 && (
                <div className="admin-empty">
                  Nessun notebook trovato.
                </div>
              )}
            </div>
          </>
        )}

        {tab === "comments" && (
          <div className="admin-list">
            {comments.map((comment) => {
              const author = profiles[comment.user_id];

              return (
                <article className="admin-card" key={comment.id}>
                  <div className="admin-card-head">
                    <div>
                      <h3>
                        {author?.display_name || "Studente"}
                        {author?.username
                          ? ` (@${author.username})`
                          : ""}
                      </h3>

                      <div className="admin-meta">
                        Notebook:{" "}
                        {notebookTitles[comment.notebook_id] ||
                          comment.notebook_id}
                      </div>

                      <div className="admin-meta">
                        {formatDate(comment.created_at)}
                      </div>
                    </div>
                  </div>

                  <p>{comment.content}</p>

                  <div className="admin-actions">
                    <Link
                      className="admin-button"
                      href={`/notebook/${comment.notebook_id}`}
                    >
                      Apri notebook
                    </Link>

                    <button
                      className="admin-button"
                      onClick={() => void deleteComment(comment)}
                      disabled={busy}
                    >
                      Elimina commento
                    </button>
                  </div>
                </article>
              );
            })}

            {comments.length === 0 && (
              <div className="admin-empty">
                Nessun commento trovato.
              </div>
            )}
          </div>
        )}

        {tab === "reports" && (
          <div className="admin-list">
            {reports.map((report) => {
              const author = profiles[report.user_id];

              return (
                <article className="admin-card" key={report.id}>
                  <h3>{report.reason || "Segnalazione"}</h3>

                  <div className="admin-meta">
                    Notebook:{" "}
                    {notebookTitles[report.notebook_id] ||
                      report.notebook_id}
                  </div>

                  <div className="admin-meta">
                    Segnalata da: {author?.display_name || "Utente"}
                    {author?.username
                      ? ` (@${author.username})`
                      : ""}{" "}
                    · {formatDate(report.created_at)}
                  </div>

                  {report.details && <p>{report.details}</p>}

                  <div className="admin-actions">
                    <Link
                      className="admin-button"
                      href={`/notebook/${report.notebook_id}`}
                    >
                      Esamina notebook
                    </Link>
                  </div>
                </article>
              );
            })}

            {reports.length === 0 && (
              <div className="admin-empty">
                Nessuna segnalazione trovata.
              </div>
            )}
          </div>
        )}

        <footer className="admin-meta" style={{ marginTop: 24 }}>
          Per ragioni di sicurezza, i permessi vengono verificati da Supabase.
          L'eliminazione di una scheda non garantisce la rimozione automatica
          degli eventuali file archiviati in Storage.
        </footer>
      </div>
    </main>
  );
}
