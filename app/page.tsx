"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, AudioLines, BookOpen, Bookmark, BookmarkCheck, Brain, Calculator, FileText, FlaskConical, GraduationCap, Heart, Search, Sparkles, Star, Video, ClipboardList } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { isSupabaseConfigured, getPublicImageUrl, supabase } from "@/lib/supabase";
import { CONTENT_TYPES, LEVELS, SUBJECTS, type Notebook } from "@/lib/types";

const subjectIcons: Record<string, React.ReactNode> = {
  Matematica: <Calculator size={20} />, Fisica: <Sparkles size={20} />, Italiano: <BookOpen size={20} />,
  Storia: <GraduationCap size={20} />, Inglese: <FileText size={20} />, Filosofia: <Brain size={20} />,
  Chimica: <FlaskConical size={20} />, Biologia: <Sparkles size={20} />, Informatica: <ClipboardList size={20} />,
};

export default function HomePage() {
  const { user } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("Tutte");
  const [level, setLevel] = useState("Tutti i livelli");
  const [contentType, setContentType] = useState("Tutti i contenuti");
  const [order, setOrder] = useState("recenti");
  const [view, setView] = useState("tutti");
  const [loading, setLoading] = useState(true);
  const [usefulCounts, setUsefulCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "miei") setView("miei");
    if (params.get("view") === "salvati") setView("salvati");
  }, []);

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return; }
      setLoading(true);
      const [notebookResult, votesResult, commentsResult, favoritesResult] = await Promise.all([
        supabase.from("notebooks").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(150),
        supabase.from("notebook_votes").select("notebook_id"),
        supabase.from("notebook_comments").select("notebook_id"),
        user ? supabase.from("notebook_favorites").select("notebook_id").eq("user_id", user.id) : Promise.resolve({ data: [] as { notebook_id: string }[] }),
      ]);
      if (notebookResult.error) console.error(notebookResult.error.message);
      setNotebooks((notebookResult.data ?? []) as Notebook[]);
      const useful: Record<string, number> = {};
      (votesResult.data ?? []).forEach((v) => { useful[v.notebook_id] = (useful[v.notebook_id] ?? 0) + 1; });
      const comments: Record<string, number> = {};
      (commentsResult.data ?? []).forEach((c) => { comments[c.notebook_id] = (comments[c.notebook_id] ?? 0) + 1; });
      setUsefulCounts(useful);
      setCommentCounts(comments);
      setSavedIds((favoritesResult.data ?? []).map((f) => f.notebook_id));
      setLoading(false);
    }
    void load();
  }, [user]);

  const visible = useMemo(() => {
    let rows = [...notebooks];
    const needle = query.trim().toLowerCase();
    if (needle) rows = rows.filter((n) => [n.title, n.topic, n.description, n.subject, ...(n.tags ?? [])].some((v) => (v ?? "").toLowerCase().includes(needle)));
    if (subject !== "Tutte") rows = rows.filter((n) => n.subject === subject);
    if (level !== "Tutti i livelli") rows = rows.filter((n) => n.education_level === level);
    if (contentType !== "Tutti i contenuti") rows = rows.filter((n) => (n.content_types ?? []).includes(contentType));
    if (view === "miei") rows = rows.filter((n) => n.user_id === user?.id);
    if (view === "salvati") rows = rows.filter((n) => savedIds.includes(n.id));
    if (order === "utili") rows.sort((a, b) => (usefulCounts[b.id] ?? 0) - (usefulCounts[a.id] ?? 0));
    else if (order === "commentati") rows.sort((a, b) => (commentCounts[b.id] ?? 0) - (commentCounts[a.id] ?? 0));
    else rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return rows;
  }, [notebooks, query, subject, level, contentType, order, view, savedIds, user, usefulCounts, commentCounts]);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <span className="eyebrow"><Sparkles size={14} /> La biblioteca condivisa degli studenti</span>
          <h1>Studiare meglio,<br /><span>insieme.</span></h1>
          <p className="hero-copy">Scopri notebook NotebookLM già pronti, creati e condivisi da altri studenti. Cerca quello che ti serve, guarda l’anteprima e inizia a studiare.</p>
          <div className="search-wrap">
            <div className="search-box">
              <Search size={20} color="#85899a" />
              <input aria-label="Cerca notebook" placeholder="Cerca una materia, un argomento o una parola chiave…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="button button-primary" onClick={() => document.getElementById("risultati")?.scrollIntoView({ behavior: "smooth" })}>Cerca <ArrowRight size={15} /></button>
            </div>
          </div>
          <div className="hero-stats">
            <div><strong>{notebooks.length}</strong>Notebook condivisi</div>
            <div><strong>{new Set(notebooks.map((n) => n.subject)).size}</strong>Materie</div>
            <div><strong>Gratis</strong>Da esplorare</div>
          </div>
        </div>
      </section>

      <section className="section" id="risultati">
        <div className="container">
          <div className="section-head">
            <div><h2 className="section-title">Esplora i notebook</h2><p className="section-subtitle">Risorse selezionate e condivise dalla community.</p></div>
            <Link href="/carica" className="button button-primary"><PlusIcon /> Condividi il tuo</Link>
          </div>
          <div className="subject-rail">
            <button className={`subject-chip ${subject === "Tutte" ? "active" : ""}`} onClick={() => setSubject("Tutte")}>Tutte le materie</button>
            {SUBJECTS.map((s) => <button key={s} className={`subject-chip ${subject === s ? "active" : ""}`} onClick={() => setSubject(s)}>{s}</button>)}
          </div>
          <div className="toolbar">
            <div className="tabs">
              <button className={`tab ${view === "tutti" ? "active" : ""}`} onClick={() => setView("tutti")}>Tutti</button>
              <button className={`tab ${view === "salvati" ? "active" : ""}`} onClick={() => setView("salvati")}><Bookmark size={13} style={{ verticalAlign: "-2px" }} /> Salvati</button>
              <button className={`tab ${view === "miei" ? "active" : ""}`} onClick={() => setView("miei")}>I miei</button>
            </div>
            <div className="filter-row">
              <select className="filter-select" aria-label="Filtra per livello" value={level} onChange={(e) => setLevel(e.target.value)}><option>Tutti i livelli</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
              <select className="filter-select" aria-label="Filtra per contenuto" value={contentType} onChange={(e) => setContentType(e.target.value)}><option>Tutti i contenuti</option>{CONTENT_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
              <select className="filter-select" aria-label="Ordina notebook" value={order} onChange={(e) => setOrder(e.target.value)}><option value="recenti">Più recenti</option><option value="utili">Più utili</option><option value="commentati">Più commentati</option></select>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 14px" }}>{visible.length} {visible.length === 1 ? "risultato" : "risultati"}</p>
          <div className="grid">
            {!isSupabaseConfigured ? (
              <div className="empty-state"><BookOpen size={30} /><h3>Collega il database per iniziare</h3><p>Segui il file README incluso nel progetto: in pochi passaggi il sito sarà collegato a Supabase.</p></div>
            ) : loading ? <div className="empty-state"><p>Sto caricando i notebook…</p></div> : visible.length === 0 ? (
              <div className="empty-state"><Search size={30} /><h3>{view === "miei" ? "Non hai ancora condiviso notebook" : view === "salvati" ? "Non hai ancora salvato notebook" : "Nessun notebook trovato"}</h3><p>{view === "miei" || view === "salvati" ? "Quando aggiungerai o salverai una risorsa, la troverai qui." : "Prova a cambiare la ricerca o i filtri. Puoi anche essere il primo a condividere una risorsa."}</p><Link href="/carica" className="button button-primary" style={{ marginTop: 12 }}>Condividi un notebook</Link></div>
            ) : visible.map((n) => (
              <NotebookCard key={n.id} notebook={n} saved={savedIds.includes(n.id)} useful={usefulCounts[n.id] ?? 0} comments={commentCounts[n.id] ?? 0} icon={subjectIcons[n.subject] ?? <BookOpen size={20} />} />
            ))}
          </div>
          <div className="notice" style={{ marginTop: 25 }}><strong>Un progetto indipendente.</strong> I notebook restano su NotebookLM: qui trovi la scheda informativa e il collegamento pubblicato dal suo autore. Prima di aprire una risorsa, controlla sempre descrizione e anteprima.</div>
        </div>
      </section>
    </>
  );
}

function PlusIcon() { return <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>; }

function NotebookCard({ notebook, saved, useful, comments, icon }: { notebook: Notebook; saved: boolean; useful: number; comments: number; icon: React.ReactNode }) {
  const firstImage = notebook.image_paths?.[0] ? getPublicImageUrl(notebook.image_paths[0]) : "";
  return (
    <Link href={`/notebook/${notebook.id}`} className="notebook-card">
      <div className="card-top">
        <span className="subject-icon">{firstImage ? <img src={firstImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 14 }} /> : icon}</span>
        <span className="card-pill">{notebook.education_level}</span>
      </div>
      <div className="card-title">{notebook.title}</div>
      <p className="card-desc">{notebook.description}</p>
      <div className="card-tags"><span className="tag">{notebook.subject}</span>{notebook.topic && <span className="tag">{notebook.topic}</span>}{(notebook.content_types ?? []).slice(0, 2).map((t) => <span className="tag" key={t}>{t}</span>)}{saved && <span className="tag"><BookmarkCheck size={10} style={{ verticalAlign: "-1px" }} /> Salvato</span>}</div>
      <div className="card-bottom"><div className="card-meta"><span><Star size={12} /> {useful}</span><span><Heart size={12} /> {comments}</span></div><span className="card-meta">{notebook.profiles?.display_name || "Studente"} <ArrowRight size={13} /></span></div>
    </Link>
  );
}
