"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Flag,
  MessageCircle,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  formatDate,
  getPublicImageUrl,
  isNotebookLmUrl,
  supabase,
} from "@/lib/supabase";
import type { Notebook, NotebookComment } from "@/lib/types";

type ProfileRow = {
  id: string;
  display_name: string | null;
  username?: string | null;
};

export default function NotebookDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [comments, setComments] = useState<NotebookComment[]>([]);
  const [comment, setComment] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [usefulCount, setUsefulCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reportReason, setReportReason] = useState("Link non funzionante");
  const [reportNote, setReportNote] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    // IMPORTANT: load the notebook independently. A failed profile relationship
    // must not make an existing notebook appear as "not found".
    const notebookResult = await supabase
      .from("notebooks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (notebookResult.error) {
      console.error("Errore caricamento notebook:", notebookResult.error);
      setError(`Non riesco a leggere questa pubblicazione: ${notebookResult.error.message}`);
      setNotebook(null);
      setComments([]);
      setLoading(false);
      return;
    }

    const row = notebookResult.data as Notebook | null;
    if (!row) {
      setNotebook(null);
      setComments([]);
      setLoading(false);
      return;
    }

    // Profile data is optional. Try username first, then fall back to the
    // original display_name field if the username column is not available.
    let authorProfile: ProfileRow | null = null;
    const profileResult = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .eq("id", row.user_id)
      .maybeSingle();

    if (!profileResult.error && profileResult.data) {
      authorProfile = profileResult.data as ProfileRow;
    } else {
      const fallbackProfile = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", row.user_id)
        .maybeSingle();
      if (fallbackProfile.data) {
        authorProfile = fallbackProfile.data as ProfileRow;
      }
    }

    setNotebook({ ...row, profiles: authorProfile });

    // Comments are loaded separately from profiles for the same reason.
    const commentsResult = await supabase
      .from("notebook_comments")
      .select("*")
      .eq("notebook_id", id)
      .order("created_at", { ascending: false });

    if (commentsResult.error) {
      console.warn("Commenti non disponibili:", commentsResult.error.message);
      setComments([]);
    } else {
      const commentRows = commentsResult.data ?? [];
      const authorIds = Array.from(
        new Set(commentRows.map((item) => item.user_id).filter(Boolean)),
      );
      const commentProfiles = new Map<string, ProfileRow>();

      if (authorIds.length) {
        const commentProfileResult = await supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", authorIds);

        if (!commentProfileResult.error) {
          for (const profile of (commentProfileResult.data ?? []) as ProfileRow[]) {
            commentProfiles.set(profile.id, profile);
          }
        } else {
          const fallbackCommentsProfiles = await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", authorIds);
          for (const profile of (fallbackCommentsProfiles.data ?? []) as ProfileRow[]) {
            commentProfiles.set(profile.id, profile);
          }
        }
      }

      setComments(
        commentRows.map((item) => ({
          ...item,
          profiles: commentProfiles.get(item.user_id) ?? null,
        })) as NotebookComment[],
      );
    }

    const [votesResult, favoriteResult, myVoteResult] = await Promise.all([
      supabase.from("notebook_votes").select("id").eq("notebook_id", id),
      user
        ? supabase
            .from("notebook_favorites")
            .select("id")
            .eq("notebook_id", id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from("notebook_votes")
            .select("id")
            .eq("notebook_id", id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    setUsefulCount(votesResult.data?.length ?? 0);
    setSaved(Boolean(favoriteResult.data));
    setHasVoted(Boolean(myVoteResult.data));
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("created") === "1") {
      setNotice("Notebook pubblicato! La tua risorsa è ora visibile nella raccolta.");
    }
    if (searchParams.get("updated") === "1") {
      setNotice("Modifiche salvate correttamente.");
    }
  }, []);

  async function toggleVote() {
    if (!user) {
      router.push("/accedi");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const { data: existing, error: lookupError } = await supabase
      .from("notebook_votes")
      .select("id")
      .eq("notebook_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      setError(lookupError.message);
    } else if (existing) {
      const { error: deleteError } = await supabase
        .from("notebook_votes")
        .delete()
        .eq("id", existing.id);
      if (deleteError) setError(deleteError.message);
      else {
        setHasVoted(false);
        setUsefulCount((count) => Math.max(0, count - 1));
      }
    } else {
      const { error: insertError } = await supabase
        .from("notebook_votes")
        .insert({ notebook_id: id, user_id: user.id });
      if (insertError) setError(insertError.message);
      else {
        setHasVoted(true);
        setUsefulCount((count) => count + 1);
      }
    }
    setBusy(false);
  }

  async function toggleSave() {
    if (!user) {
      router.push("/accedi");
      return;
    }
    if (!supabase) return;
    setBusy(true);

    if (saved) {
      const { error: deleteError } = await supabase
        .from("notebook_favorites")
        .delete()
        .eq("notebook_id", id)
        .eq("user_id", user.id);
      if (deleteError) setError(deleteError.message);
      else setSaved(false);
    } else {
      const { error: insertError } = await supabase
        .from("notebook_favorites")
        .insert({ notebook_id: id, user_id: user.id });
      if (insertError) setError(insertError.message);
      else setSaved(true);
    }
    setBusy(false);
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      router.push("/accedi");
      return;
    }
    if (!supabase || comment.trim().length < 2) return;

    setBusy(true);
    const { error: insertError } = await supabase
      .from("notebook_comments")
      .insert({ notebook_id: id, user_id: user.id, content: comment.trim() });
    if (insertError) setError(insertError.message);
    else {
      setComment("");
      await load();
    }
    setBusy(false);
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      router.push("/accedi");
      return;
    }
    if (!supabase) return;

    setBusy(true);
    const { error: reportError } = await supabase.from("notebook_reports").insert({
      notebook_id: id,
      user_id: user.id,
      reason: reportReason,
      details: reportNote.trim() || null,
    });
    setBusy(false);

    if (reportError) {
      setError(reportError.message);
    } else {
      setNotice("Grazie: la segnalazione è stata inviata.");
      setShowReport(false);
      setReportNote("");
    }
  }

  async function removeNotebook() {
    if (!user || !notebook || user.id !== notebook.user_id || !supabase) return;
    if (!window.confirm("Vuoi eliminare definitivamente questo notebook?")) return;

    setBusy(true);
    if (notebook.image_paths?.length) {
      await supabase.storage.from("notebook-images").remove(notebook.image_paths);
    }
    const { error: deleteError } = await supabase
      .from("notebooks")
      .delete()
      .eq("id", id);
    setBusy(false);

    if (deleteError) setError(deleteError.message);
    else router.push("/");
  }

  if (loading) {
    return <div className="container page"><div className="loading">Caricamento notebook…</div></div>;
  }

  if (!notebook) {
    return (
      <div className="container page">
        <div className="panel auth-wrap">
          <h1>Notebook non disponibile</h1>
          {error ? (
            <p>{error}</p>
          ) : (
            <p>Non trovo una pubblicazione con questo identificativo. Torna alla raccolta e riprova ad aprirla.</p>
          )}
          <Link className="button button-primary" href="/">Torna alla raccolta</Link>
        </div>
      </div>
    );
  }

  const author = notebook.profiles?.display_name || "Studente";
  const authorUsername = notebook.profiles?.username;

  return (
    <div className="container page">
      <div className="breadcrumb">
        <Link href="/">Esplora</Link><span>›</span><span>{notebook.subject}</span>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="detail-layout">
        <article className="panel detail-main">
          <div className="card-top">
            <span className="card-pill">{notebook.subject}</span>
            <span className="card-pill">{notebook.education_level}</span>
          </div>
          <h1 className="detail-title">{notebook.title}</h1>
          <p className="detail-lead">{notebook.description}</p>
          <div className="detail-tags">
            {notebook.topic && <span className="tag">{notebook.topic}</span>}
            {(notebook.tags ?? []).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
            {(notebook.content_types ?? []).map((type) => <span className="tag" key={type}>{type}</span>)}
          </div>
          <div className="card-meta">
            <span>Condiviso da <strong style={{ color: "var(--ink)" }}>{author}{authorUsername ? ` · @${authorUsername}` : ""}</strong></span>
            <span>·</span>
            <span>{formatDate(notebook.created_at)}</span>
          </div>

          {notebook.image_paths?.length > 0 && (
            <section className="detail-section">
              <h2>Anteprima del notebook</h2>
              <div className="image-grid">
                {notebook.image_paths.map((path, index) => (
                  <a key={path} href={getPublicImageUrl(path)} target="_blank" rel="noreferrer">
                    <img className="preview-image" src={getPublicImageUrl(path)} alt={`Immagine di anteprima ${index + 1} di ${notebook.title}`} />
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="detail-section">
            <h2><MessageCircle size={18} style={{ verticalAlign: "-3px", marginRight: 7 }} />Commenti ({comments.length})</h2>
            <form onSubmit={addComment} className="inline-form">
              <textarea maxLength={500} placeholder="Condividi un parere o un consiglio utile…" value={comment} onChange={(event) => setComment(event.target.value)} />
              <button className="button button-primary" type="submit" disabled={busy || comment.trim().length < 2}>Invia</button>
            </form>
            {comments.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 18 }}>Ancora nessun commento. Puoi essere il primo.</p>
            ) : comments.map((item) => (
              <div className="comment" key={item.id}>
                <div className="comment-head">
                  <strong>{item.profiles?.display_name || "Studente"}{item.profiles?.username ? ` · @${item.profiles.username}` : ""}</strong>
                  <span>{formatDate(item.created_at)}</span>
                </div>
                <p>{item.content}</p>
              </div>
            ))}
          </section>

          {user?.id === notebook.user_id && (
            <section className="detail-section">
              <h2>Gestisci la tua pubblicazione</h2>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -4 }}>Puoi correggere titolo, descrizione, link, tag e immagini senza dover eliminare la scheda.</p>
              <div className="owner-actions">
                <Link className="button button-primary" href={`/notebook/${id}/modifica`}><Pencil size={15} />Modifica notebook</Link>
                <button className="button button-danger" onClick={removeNotebook} disabled={busy}><Trash2 size={15} />Elimina</button>
              </div>
            </section>
          )}
        </article>

        <aside className="panel detail-side">
          <h3>Pronto per studiare?</h3>
          <p>Apri il notebook originale su NotebookLM. Il contenuto è ospitato da Google e può richiedere un account Google.</p>
          <a
            className="button button-primary"
            style={{ width: "100%" }}
            href={notebook.notebook_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              if (!isNotebookLmUrl(notebook.notebook_url)) {
                event.preventDefault();
                setError("Il collegamento non sembra un link valido di NotebookLM.");
              }
            }}
          >
            Apri su NotebookLM <ArrowUpRight size={16} />
          </a>

          <div className="side-info">
            <div><span>Materia</span><span>{notebook.subject}</span></div>
            <div><span>Livello</span><span>{notebook.education_level}</span></div>
            {notebook.school && <div><span>Indirizzo</span><span>{notebook.school}</span></div>}
            <div><span>Autore</span><span>{author}</span></div>
            <div><span>Valutazioni utili</span><span>{usefulCount}</span></div>
          </div>

          <div className="side-buttons">
            <button className="button button-secondary" onClick={toggleVote} disabled={busy}><Star size={16} fill={hasVoted ? "currentColor" : "none"} />{hasVoted ? "Hai trovato utile" : "Utile"} · {usefulCount}</button>
            <button className="button button-secondary" onClick={toggleSave} disabled={busy}>{saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{saved ? "Salvato" : "Salva tra i preferiti"}</button>
            <button className="button button-ghost" onClick={() => setShowReport((current) => !current)}><Flag size={15} />Segnala contenuto</button>
          </div>

          {showReport && (
            <form onSubmit={report} style={{ marginTop: 12 }}>
              <div className="field">
                <label>Motivo</label>
                <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                  <option>Link non funzionante</option>
                  <option>Contenuto non appropriato</option>
                  <option>Violazione del copyright</option>
                  <option>Informazioni personali esposte</option>
                  <option>Spam o contenuto ingannevole</option>
                  <option>Altro</option>
                </select>
              </div>
              <div className="field">
                <label>Dettagli (facoltativi)</label>
                <textarea value={reportNote} maxLength={500} onChange={(event) => setReportNote(event.target.value)} placeholder="Descrivi il problema…" />
              </div>
              <button className="button button-primary" style={{ width: "100%" }} disabled={busy}>Invia segnalazione</button>
            </form>
          )}
          <p style={{ marginTop: 15 }}>Il progetto non è affiliato a Google. La segnalazione aiuta a mantenere la raccolta affidabile.</p>
        </aside>
      </div>
    </div>
  );
}
