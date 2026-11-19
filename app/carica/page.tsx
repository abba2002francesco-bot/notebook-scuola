"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Link2, ShieldCheck, UploadCloud } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { isNotebookLmUrl, supabase } from "@/lib/supabase";
import { CONTENT_TYPES, LEVELS, SUBJECTS } from "@/lib/types";

export default function UploadPage() {
  const { user, loading } = useAuth(); const router = useRouter();
  const [form, setForm] = useState({title:"",url:"",subject:"Matematica",level:"Superiori",topic:"",school:"",tags:"",description:""});
  const [contentTypes,setContentTypes] = useState<string[]>([]); const [files,setFiles] = useState<File[]>([]); const [consent,setConsent] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  const update = (key:string,value:string) => setForm((f)=>({...f,[key]:value}));
  const toggle = (t:string) => setContentTypes((c)=>c.includes(t)?c.filter(x=>x!==t):[...c,t]);
  async function submit(e:FormEvent) {
    e.preventDefault(); setError("");
    if(!supabase){setError("Database non configurato. Segui il README.");return;}
    if(!user){router.push("/accedi?next=/carica");return;}
    if(!isNotebookLmUrl(form.url)){setError("Inserisci un link pubblico NotebookLM (notebooklm.google.com o notebooklm.link.google).");return;}
    if(!consent){setError("Conferma di avere il diritto di condividere link e immagini.");return;}
    if(files.length>4||files.some(f=>f.size>4*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type))){setError("Carica massimo 4 immagini JPG, PNG o WebP, ognuna entro 4 MB.");return;}
    setBusy(true); const paths:string[]=[];
    try {
      for(const file of files){const path=`${user.id}/${crypto.randomUUID()}-${file.name.toLowerCase().replace(/[^a-z0-9.-]/g,"-")}`;const {error}=await supabase.storage.from("notebook-images").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});if(error)throw error;paths.push(path);}
      const {data,error}=await supabase.from("notebooks").insert({user_id:user.id,title:form.title.trim(),notebook_url:form.url.trim(),subject:form.subject,education_level:form.level,topic:form.topic.trim()||null,school:form.school.trim()||null,tags:form.tags.split(",").map(t=>t.trim()).filter(Boolean).slice(0,10),content_types:contentTypes,description:form.description.trim(),image_paths:paths}).select("id").single();
      if(error)throw error; router.push(`/notebook/${data.id}?created=1`);
    } catch(err){if(paths.length)await supabase.storage.from("notebook-images").remove(paths);setError(`Pubblicazione non riuscita: ${err instanceof Error?err.message:"errore imprevisto"}`);} finally{setBusy(false);}
  }
  if(loading)return <div className="container page"><div className="loading">Controllo dell'accesso…</div></div>;
  if(!user)return <div className="container page"><div className="panel auth-wrap"><span className="eyebrow">La community</span><h1>Accedi per condividere</h1><p>Per pubblicare e gestire le tue risorse serve un account gratuito.</p><Link className="button button-primary" href="/accedi?next=/carica">Accedi</Link><p className="auth-switch">Non hai un account? <Link href="/registrati">Registrati</Link></p></div></div>;
  return <div className="container page"><div className="breadcrumb"><Link href="/">Esplora</Link><span>›</span><span>Condividi un notebook</span></div><div className="panel form-panel">
    <div className="form-heading"><span className="eyebrow"><UploadCloud size={14}/> Condividi con la community</span><h1>Pubblica il tuo notebook</h1><p>Racconta cosa contiene: una scheda chiara aiuta gli altri a trovare la risorsa giusta.</p></div>
    <form onSubmit={submit}>
      <div className="field full"><label htmlFor="url"><Link2 size={14} style={{verticalAlign:"-2px",marginRight:5}}/>Link pubblico NotebookLM *</label><input id="url" type="url" required placeholder="https://notebooklm.link.google/…" value={form.url} onChange={e=>update("url",e.target.value)}/><small>In NotebookLM abilita l'accesso pubblico prima di copiare il link.</small></div>
      <div className="field full"><label htmlFor="title">Titolo del notebook *</label><input id="title" required minLength={4} maxLength={100} placeholder="Es. Rivoluzione francese — ripasso completo" value={form.title} onChange={e=>update("title",e.target.value)}/></div>
      <div className="form-grid">
        <div className="field"><label>Materia *</label><select value={form.subject} onChange={e=>update("subject",e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Livello *</label><select value={form.level} onChange={e=>update("level",e.target.value)}>{LEVELS.map(x=><option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Argomento</label><input maxLength={80} placeholder="Es. Prima guerra mondiale" value={form.topic} onChange={e=>update("topic",e.target.value)}/></div>
        <div className="field"><label>Indirizzo scolastico (facoltativo)</label><input maxLength={80} placeholder="Es. Liceo scientifico" value={form.school} onChange={e=>update("school",e.target.value)}/><small>Evita il nome preciso della scuola e dati personali.</small></div>
      </div>
      <div className="field full"><label>Che cosa contiene?</label><div className="checkbox-grid">{CONTENT_TYPES.map(t=><label className="check-chip" key={t}><input type="checkbox" checked={contentTypes.includes(t)} onChange={()=>toggle(t)}/>{t}</label>)}</div><small>Puoi scegliere più caratteristiche.</small></div>
      <div className="field full"><label>Tag</label><input placeholder="Es. maturità, algebra, verifica (separati da virgola)" value={form.tags} onChange={e=>update("tags",e.target.value)}/><small>Massimo 10 tag.</small></div>
      <div className="field full"><label htmlFor="description">Descrizione *</label><textarea id="description" required minLength={20} maxLength={1200} placeholder="Spiega cosa si trova nel notebook, quali argomenti tratta e a chi può essere utile…" value={form.description} onChange={e=>update("description",e.target.value)}/><small>{form.description.length}/1200 caratteri</small></div>
      <div className="field full"><label><ImagePlus size={14} style={{verticalAlign:"-2px",marginRight:5}}/>Immagini di anteprima (facoltative)</label><div className="upload-zone"><ImagePlus size={24}/><div style={{marginTop:8,fontWeight:700,color:"var(--ink)",fontSize:13}}>Mostra cosa troveranno nel notebook</div><div style={{fontSize:12,marginTop:4}}>Fino a 4 immagini JPG, PNG o WebP · massimo 4 MB ciascuna</div><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,4))}/></div>{files.length>0&&<small>{files.length} immagini selezionate: {files.map(f=>f.name).join(", ")}</small>}</div>
      <label className="check-chip" style={{alignItems:"flex-start",lineHeight:1.5,marginBottom:14}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Confermo di avere il diritto di condividere il link e le immagini, di non includere dati personali di terzi e di non violare diritti d'autore. *</span></label>
      <div className="notice"><ShieldCheck size={15} style={{verticalAlign:"-3px",marginRight:5}}/>Il notebook resta ospitato su NotebookLM. Qui pubblichi soltanto il link, le informazioni e le immagini di anteprima. Non caricare scansioni o materiali protetti che non hai il diritto di ridistribuire.</div>
      {error&&<div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-actions"><Link href="/" className="button button-secondary"><ArrowLeft size={15}/>Annulla</Link><button className="button button-primary" type="submit" disabled={busy}>{busy?"Pubblicazione…":"Pubblica notebook"}<UploadCloud size={16}/></button></div>
    </form>
  </div></div>;
}
