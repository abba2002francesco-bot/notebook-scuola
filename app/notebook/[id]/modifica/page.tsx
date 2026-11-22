"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Save, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getPublicImageUrl, isNotebookLmUrl, supabase } from "@/lib/supabase";
import { CONTENT_TYPES, LEVELS, SUBJECTS, type Notebook } from "@/lib/types";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type NotebookForm = {
  title: string;
  url: string;
  subject: string;
  level: string;
  topic: string;
  school: string;
  tags: string;
  description: string;
};

export default function EditNotebookPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [form, setForm] = useState<NotebookForm>({
    title: "", url: "", subject: "Matematica", level: "Superiori",
    topic: "", school: "", tags: "", description: "",
  });
  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [sourceCount, setSourceCount] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadNotebook() {
      if (authLoading) return;
      if (!supabase || !user) {
        if (active) setLoading(false);
        return;
      }
      const { data, error: loadError } = await supabase
        .from("notebooks")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!active) return;
      if (loadError) setError(loadError.message);
      if (data) {
        const row = data as Notebook;
        setNotebook(row);
        setForm({
          title: row.title,
          url: row.notebook_url,
          subject: row.subject,
          level: row.education_level,
          topic: row.topic ?? "",
          school: row.school ?? "",
          tags: (row.tags ?? []).join(", "),
          description: row.description,
        });
        setContentTypes(row.content_types ?? []);
        setSourceCount(row.source_count == null ? "" : String(row.source_count));
      }
      setLoading(false);
    }
    void loadNotebook();
    return () => { active = false; };
  }, [id, user, authLoading]);

  const keptImages = useMemo(
    () => (notebook?.image_paths ?? []).filter((path) => !removedImages.includes(path)),
    [notebook, removedImages],
  );

  function update(key: keyof NotebookForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleContentType(type: string) {
    setContentTypes((current) => current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type]);
  }

  function toggleImageRemoval(path: string) {
    setRemovedImages((current) => current.includes(path)
      ? current.filter((item) => item !== path)
      : [...current, path]);
  }

  function onChooseFiles(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    setNewFiles(chosen.slice(0, Math.max(0, 4 - keptImages.length)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase || !user || !notebook) return;
    if (notebook.user_id !== user.id) {
      setError("Non puoi modificare una pubblicazione di un altro utente.");
      return;
    }
    if (!isNotebookLmUrl(form.url)) {
      setError("Inserisci un link pubblico NotebookLM valido.");
      return;
    }
    if (form.title.trim().length < 4 || form.description.trim().length < 20) {
      setError("Controlla il titolo (almeno 4 caratteri) e la descrizione (almeno 20 caratteri).");
      return;
    }
    if (keptImages.length + newFiles.length > 4) {
      setError("Puoi conservare al massimo 4 immagini in totale. Rimuovine una o selezionane meno.");
      return;
    }
    if (newFiles.some((file) => file.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES.includes(file.type))) {
      setError("Le nuove immagini devono essere JPG, PNG o WebP e non superare 4 MB ciascuna.");
      return;
    }

    setBusy(true);
    const uploadedPaths: string[] = [];
    try {
      for (const file of newFiles) {
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
        const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("notebook-images")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
      }

      const updateValues = {
        title: form.title.trim(),
        notebook_url: form.url.trim(),
        subject: form.subject,
        education_level: form.level,
        topic: form.topic.trim() || null,
        school: form.school.trim() || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
        content_types: contentTypes,
        source_count: sourceCount === "" ? null : Number(sourceCount),
        description: form.description.trim(),
        image_paths: [...keptImages, ...uploadedPaths],
        updated_at: new Date().toISOString(),
      };

      const { data: updatedNotebook, error: updateError } = await supabase
        .from("notebooks")
        .update(updateValues)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!updatedNotebook) {
        throw new Error("Nessuna modifica confermata. Verifica di aver effettuato l'accesso con l'account che ha pubblicato questo notebook. Le immagini esistenti non sono state rimosse.");
      }

      // Only remove old files after Supabase confirms the database update.
      if (removedImages.length > 0) {
        const { error: removeError } = await supabase.storage.from("notebook-images").remove(removedImages);
        if (removeError) console.warn("Alcune immagini rimosse dal database ma non dallo storage:", removeError.message);
      }

      router.push(`/notebook/${id}?updated=1`);
      router.refresh();
    } catch (caught) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("notebook-images").remove(uploadedPaths);
      }
      setError(`Salvataggio non riuscito: ${caught instanceof Error ? caught.message : "errore imprevisto"}`);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <div className="container page"><div className="loading">Caricamento della pubblicazione…</div></div>;
  }
  if (!user) {
    return <div className="container page"><div className="panel auth-wrap"><h1>Accedi per continuare</h1><p>Per modificare un notebook devi accedere con l'account che lo ha pubblicato.</p><Link className="button button-primary" href={`/accedi?next=/notebook/${id}/modifica`}>Accedi</Link></div></div>;
  }
  if (!notebook) {
    return <div className="container page"><div className="panel auth-wrap"><h1>Notebook non trovato</h1><p>La pubblicazione potrebbe essere stata rimossa.</p><Link className="button button-primary" href="/?view=miei#risultati">I miei notebook</Link></div></div>;
  }
  if (notebook.user_id !== user.id) {
    return <div className="container page"><div className="panel auth-wrap"><h1>Modifica non consentita</h1><p>Puoi modificare soltanto i notebook pubblicati dal tuo account.</p><Link className="button button-primary" href={`/notebook/${id}`}>Torna al notebook</Link></div></div>;
  }

  return (
    <div className="container page">
      <div className="breadcrumb"><Link href={`/notebook/${id}`}>Torna al notebook</Link><span>›</span><span>Modifica</span></div>
      <div className="panel form-panel">
        <div className="form-heading">
          <span className="eyebrow"><Save size={14} /> Gestione pubblicazione</span>
          <h1>Modifica il notebook</h1>
          <p>Aggiorna le informazioni della tua scheda. Le modifiche saranno visibili a tutti dopo il salvataggio.</p>
        </div>
        <form onSubmit={submit}>
          <div className="field full">
            <label htmlFor="edit-url">Link pubblico NotebookLM *</label>
            <input id="edit-url" type="url" required value={form.url} onChange={(event) => update("url", event.target.value)} />
          </div>
          <div className="field full">
            <label htmlFor="edit-title">Titolo del notebook *</label>
            <input id="edit-title" required minLength={4} maxLength={100} value={form.title} onChange={(event) => update("title", event.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field"><label>Materia *</label><select value={form.subject} onChange={(event) => update("subject", event.target.value)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label>Livello *</label><select value={form.level} onChange={(event) => update("level", event.target.value)}>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label>Argomento</label><input maxLength={80} value={form.topic} onChange={(event) => update("topic", event.target.value)} /></div>
            <div className="field"><label>Indirizzo scolastico (facoltativo)</label><input maxLength={80} value={form.school} onChange={(event) => update("school", event.target.value)} /></div>
          </div>
          <div className="field full"><label htmlFor="edit-source-count">Numero di fonti</label><input id="edit-source-count" type="number" inputMode="numeric" min="0" max="1000" step="1" value={sourceCount} onChange={(event) => setSourceCount(event.target.value)} placeholder="Non indicato" /><small>Facoltativo per le pubblicazioni create prima dell'introduzione del conteggio fonti.</small></div>
          <div className="field full"><label>Che cosa contiene?</label><div className="checkbox-grid">{CONTENT_TYPES.map((item) => <label className="check-chip" key={item}><input type="checkbox" checked={contentTypes.includes(item)} onChange={() => toggleContentType(item)} />{item}</label>)}</div></div>
          <div className="field full"><label>Tag</label><input placeholder="Separali con una virgola" value={form.tags} onChange={(event) => update("tags", event.target.value)} /><small>Massimo 10 tag.</small></div>
          <div className="field full"><label htmlFor="edit-description">Descrizione *</label><textarea id="edit-description" required minLength={20} maxLength={1200} value={form.description} onChange={(event) => update("description", event.target.value)} /><small>{form.description.length}/1200 caratteri</small></div>

          <div className="field full">
            <label><ImagePlus size={14} style={{ verticalAlign: "-2px", marginRight: 5 }} />Immagini di anteprima</label>
            {notebook.image_paths.length > 0 && (
              <div className="edit-image-grid">
                {notebook.image_paths.map((path) => {
                  const removing = removedImages.includes(path);
                  return (
                    <label className={`edit-image-option ${removing ? "is-removed" : ""}`} key={path}>
                      <img src={getPublicImageUrl(path)} alt="Anteprima del notebook" />
                      <span><input type="checkbox" checked={removing} onChange={() => toggleImageRemoval(path)} /> Rimuovi questa immagine</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="upload-zone">
              <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>Aggiungi altre immagini</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Puoi avere al massimo 4 immagini in totale · JPG, PNG o WebP · 4 MB ciascuna</div>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => onChooseFiles(event.target.files)} />
              {newFiles.length > 0 && <small>Nuove immagini: {newFiles.map((file) => file.name).join(", ")}</small>}
              <small>{keptImages.length + newFiles.length} di 4 immagini dopo il salvataggio</small>
            </div>
          </div>

          <div className="notice"><ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} />Conserva soltanto link e immagini che hai diritto di condividere. Non inserire dati personali di altre persone.</div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="form-actions">
            <Link href={`/notebook/${id}`} className="button button-secondary"><ArrowLeft size={15} /> Annulla</Link>
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Salvataggio…" : "Salva modifiche"}<Save size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}
