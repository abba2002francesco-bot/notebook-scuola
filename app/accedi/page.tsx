"use client";
import Link from "next/link";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {useEffect} from "react";
import {LockKeyhole,LogIn} from "lucide-react";
import {supabase} from "@/lib/supabase";
export default function LoginPage(){
 const router=useRouter();const [next,setNext]=useState("/");
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 useEffect(()=>{const candidate=new URLSearchParams(window.location.search).get("next");if(candidate?.startsWith("/")&&!candidate.startsWith("//"))setNext(candidate);},[]);
 async function submit(e:FormEvent){e.preventDefault();setError("");if(!supabase){setError("Il sito non è ancora collegato a Supabase.");return;}setBusy(true);const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});setBusy(false);if(error){setError("Email o password non corretti. Se hai appena creato l'account, controlla la casella email.");return;}router.push(next);router.refresh();}
 return <div className="container page"><div className="panel auth-wrap"><span className="eyebrow"><LockKeyhole size={14}/> Area studenti</span><h1>Bentornato.</h1><p>Accedi per salvare i notebook, commentare o condividere le tue risorse.</p><form onSubmit={submit}><div className="field"><label>Email</label><input type="email" required autoComplete="email" placeholder="nome@email.com" value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Password</label><input type="password" required autoComplete="current-password" placeholder="La tua password" value={password} onChange={e=>setPassword(e.target.value)}/></div>{error&&<div className="alert alert-error">{error}</div>}<button className="button button-primary" style={{width:"100%"}} disabled={busy}>{busy?"Accesso…":"Accedi"}<LogIn size={16}/></button></form><div className="auth-switch">Non hai un account? <Link href="/registrati">Registrati gratis</Link></div></div></div>;
}
