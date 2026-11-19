"use client";
import Link from "next/link";
import {useParams,useRouter} from "next/navigation";
import {FormEvent,useEffect,useState} from "react";
import {ArrowLeft,ArrowUpRight,Bookmark,BookmarkCheck,ExternalLink,Flag,Heart,MessageCircle,Star,Trash2} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {formatDate,getPublicImageUrl,isNotebookLmUrl,supabase} from "@/lib/supabase";
import type {Notebook,NotebookComment} from "@/lib/types";

export default function NotebookDetailPage(){
 const params=useParams<{id:string}>();const id=params.id;const router=useRouter();const {user}=useAuth();
 const [notebook,setNotebook]=useState<Notebook|null>(null);const [comments,setComments]=useState<NotebookComment[]>([]);const [comment,setComment]=useState("");const [hasVoted,setHasVoted]=useState(false);const [usefulCount,setUsefulCount]=useState(0);const [saved,setSaved]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [reportReason,setReportReason]=useState("Link non funzionante");const [reportNote,setReportNote]=useState("");const [showReport,setShowReport]=useState(false);const [notice,setNotice]=useState("");const [loading,setLoading]=useState(true);
 async function load(){if(!supabase){setLoading(false);return;}setLoading(true);const [{data:n,error:nError},{data:c},{data:v},{data:f},{data:mine}] = await Promise.all([
  supabase.from("notebooks").select("*, profiles(display_name)").eq("id",id).maybeSingle(),
  supabase.from("notebook_comments").select("*, profiles(display_name)").eq("notebook_id",id).order("created_at",{ascending:false}),
  supabase.from("notebook_votes").select("id,user_id").eq("notebook_id",id),
  user?supabase.from("notebook_favorites").select("id").eq("notebook_id",id).eq("user_id",user.id).maybeSingle():Promise.resolve({data:null}),
  user?supabase.from("notebook_votes").select("id").eq("notebook_id",id).eq("user_id",user.id).maybeSingle():Promise.resolve({data:null}),
 ]);
 if(nError)console.error(nError.message);setNotebook(n as Notebook|null);setComments((c??[]) as NotebookComment[]);setUsefulCount(v?.length??0);setSaved(Boolean(f));setHasVoted(Boolean(mine));setLoading(false);
 }
 useEffect(()=>{void load();},[id,user]);
 useEffect(()=>{if(new URLSearchParams(window.location.search).get("created")==="1")setNotice("Notebook pubblicato! La tua risorsa è ora visibile nella raccolta.");},[]);
 async function toggleVote(){if(!user){router.push("/accedi");return;}if(!supabase)return;setBusy(true);const {data:existing}=await supabase.from("notebook_votes").select("id").eq("notebook_id",id).eq("user_id",user.id).maybeSingle();if(existing){const {error}=await supabase.from("notebook_votes").delete().eq("id",existing.id);if(error)setError(error.message);else{setHasVoted(false);setUsefulCount(x=>Math.max(0,x-1));}}else{const {error}=await supabase.from("notebook_votes").insert({notebook_id:id,user_id:user.id});if(error)setError(error.message);else{setHasVoted(true);setUsefulCount(x=>x+1);}}setBusy(false);}
 async function toggleSave(){if(!user){router.push("/accedi");return;}if(!supabase)return;setBusy(true);if(saved){const {error}=await supabase.from("notebook_favorites").delete().eq("notebook_id",id).eq("user_id",user.id);if(error)setError(error.message);else setSaved(false);}else{const {error}=await supabase.from("notebook_favorites").insert({notebook_id:id,user_id:user.id});if(error)setError(error.message);else setSaved(true);}setBusy(false);}
 async function addComment(e:FormEvent){e.preventDefault();if(!user){router.push("/accedi");return;}if(!supabase||comment.trim().length<2)return;setBusy(true);const {error}=await supabase.from("notebook_comments").insert({notebook_id:id,user_id:user.id,content:comment.trim()});if(error)setError(error.message);else{setComment("");await load();}setBusy(false);}
 async function report(e:FormEvent){e.preventDefault();if(!user){router.push("/accedi");return;}if(!supabase)return;setBusy(true);const {error}=await supabase.from("notebook_reports").insert({notebook_id:id,user_id:user.id,reason:reportReason,details:reportNote.trim()||null});setBusy(false);if(error)setError(error.message);else{setNotice("Grazie: la segnalazione è stata inviata.");setShowReport(false);setReportNote("");}}
 async function removeNotebook(){if(!user||!notebook||user.id!==notebook.user_id||!supabase)return;if(!window.confirm("Vuoi eliminare definitivamente questo notebook?"))return;setBusy(true);if(notebook.image_paths?.length)await supabase.storage.from("notebook-images").remove(notebook.image_paths);const {error}=await supabase.from("notebooks").delete().eq("id",id);setBusy(false);if(error)setError(error.message);else router.push("/");}
 if(loading)return <div className="container page"><div className="loading">Caricamento notebook…</div></div>;
 if(!notebook)return <div className="container page"><div className="panel auth-wrap"><h1>Notebook non trovato</h1><p>Il link potrebbe essere stato rimosso oppure la risorsa non è più disponibile.</p><Link className="button button-primary" href="/">Torna alla raccolta</Link></div></div>;
 const author=notebook.profiles?.display_name||"Studente";
 return <div className="container page"><div className="breadcrumb"><Link href="/">Esplora</Link><span>›</span><span>{notebook.subject}</span></div>
  {notice&&<div className="alert alert-success">{notice}</div>}{error&&<div className="alert alert-error">{error}</div>}
  <div className="detail-layout"><article className="panel detail-main">
   <div className="card-top"><span className="card-pill">{notebook.subject}</span><span className="card-pill">{notebook.education_level}</span></div>
   <h1 className="detail-title">{notebook.title}</h1><p className="detail-lead">{notebook.description}</p>
   <div className="detail-tags">{notebook.topic&&<span className="tag">{notebook.topic}</span>}{(notebook.tags??[]).map(t=><span className="tag" key={t}>#{t}</span>)}{(notebook.content_types??[]).map(t=><span className="tag" key={t}>{t}</span>)}</div>
   <div className="card-meta"><span>Condiviso da <strong style={{color:"var(--ink)"}}>{author}</strong></span><span>·</span><span>{formatDate(notebook.created_at)}</span></div>
   {notebook.image_paths?.length>0&&<section className="detail-section"><h2>Anteprima del notebook</h2><div className="image-grid">{notebook.image_paths.map((p,i)=><a key={p} href={getPublicImageUrl(p)} target="_blank" rel="noreferrer"><img className="preview-image" src={getPublicImageUrl(p)} alt={`Immagine di anteprima ${i+1} di ${notebook.title}`}/></a>)}</div></section>}
   <section className="detail-section"><h2><MessageCircle size={18} style={{verticalAlign:"-3px",marginRight:7}}/>Commenti ({comments.length})</h2>
    <form onSubmit={addComment} className="inline-form"><textarea maxLength={500} placeholder="Condividi un parere o un consiglio utile…" value={comment} onChange={e=>setComment(e.target.value)}/><button className="button button-primary" type="submit" disabled={busy||comment.trim().length<2}>Invia</button></form>
    {comments.length===0?<p style={{color:"var(--muted)",fontSize:13,marginTop:18}}>Ancora nessun commento. Puoi essere il primo.</p>:comments.map(c=><div className="comment" key={c.id}><div className="comment-head"><strong>{c.profiles?.display_name||"Studente"}</strong><span>{formatDate(c.created_at)}</span></div><p>{c.content}</p></div>)}
   </section>
   {user?.id===notebook.user_id&&<section className="detail-section"><button className="button button-danger" onClick={removeNotebook} disabled={busy}><Trash2 size={15}/>Elimina il mio notebook</button></section>}
  </article>
  <aside className="panel detail-side"><h3>Pronto per studiare?</h3><p>Apri il notebook originale su NotebookLM. Il contenuto è ospitato da Google e può richiedere un account Google.</p>
   <a className="button button-primary" style={{width:"100%"}} href={notebook.notebook_url} target="_blank" rel="noopener noreferrer" onClick={e=>{if(!isNotebookLmUrl(notebook.notebook_url)){e.preventDefault();setError("Il collegamento non sembra un link valido di NotebookLM.");}}}>Apri su NotebookLM <ArrowUpRight size={16}/></a>
   <div className="side-info"><div><span>Materia</span><span>{notebook.subject}</span></div><div><span>Livello</span><span>{notebook.education_level}</span></div>{notebook.school&&<div><span>Indirizzo</span><span>{notebook.school}</span></div>}<div><span>Autore</span><span>{author}</span></div><div><span>Valutazioni utili</span><span>{usefulCount}</span></div></div>
   <div className="side-buttons"><button className="button button-secondary" onClick={toggleVote} disabled={busy}><Star size={16} fill={hasVoted?"currentColor":"none"}/>{hasVoted?"Hai trovato utile":"Utile"} · {usefulCount}</button><button className="button button-secondary" onClick={toggleSave} disabled={busy}>{saved?<BookmarkCheck size={16}/>:<Bookmark size={16} />}{saved?"Salvato":"Salva tra i preferiti"}</button><button className="button button-ghost" onClick={()=>setShowReport(s=>!s)}><Flag size={15}/>Segnala contenuto</button></div>
   {showReport&&<form onSubmit={report} style={{marginTop:12}}><div className="field"><label>Motivo</label><select value={reportReason} onChange={e=>setReportReason(e.target.value)}><option>Link non funzionante</option><option>Contenuto non appropriato</option><option>Violazione del copyright</option><option>Informazioni personali esposte</option><option>Spam o contenuto ingannevole</option><option>Altro</option></select></div><div className="field"><label>Dettagli (facoltativi)</label><textarea value={reportNote} maxLength={500} onChange={e=>setReportNote(e.target.value)} placeholder="Descrivi il problema…"/></div><button className="button button-primary" style={{width:"100%"}} disabled={busy}>Invia segnalazione</button></form>}
   <p style={{marginTop:15}}>Il progetto non è affiliato a Google. La segnalazione aiuta a mantenere la raccolta affidabile.</p>
  </aside></div>
 </div>;
}
