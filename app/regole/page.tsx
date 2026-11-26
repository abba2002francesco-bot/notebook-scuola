import type { Metadata } from "next";
import Link from "next/link";
import {ShieldCheck} from "lucide-react";

export const metadata: Metadata = {
  title: "Regole della community | Notebook Scuola",
  description: "Le regole per condividere notebook di studio in modo utile, corretto e sicuro su Notebook Scuola.",
  alternates: { canonical: "/regole" },
};

export default function RulesPage(){return <div className="container page"><div className="panel form-panel"><span className="eyebrow"><ShieldCheck size={14}/> Community</span><h1 style={{fontFamily:"Manrope,sans-serif",fontSize:32,letterSpacing:-1}}>Regole della community</h1><p style={{color:"var(--muted)",lineHeight:1.7}}>Notebook Scuola è una raccolta indipendente di link a notebook NotebookLM condivisi dagli utenti. Per mantenere il servizio utile e sicuro:</p><ol style={{color:"var(--muted)",lineHeight:1.9,paddingLeft:20}}><li>Condividi soltanto notebook che hai il diritto di rendere pubblici.</li><li>Non caricare scansioni di libri, dispense o immagini protette da copyright senza autorizzazione.</li><li>Non inserire dati personali, fotografie o informazioni identificabili di altre persone, soprattutto minori.</li><li>Scrivi titoli e descrizioni accurati: non pubblicare spam, pubblicità ingannevole o contenuti offensivi.</li><li>Segnala i collegamenti non funzionanti o i contenuti che ritieni inappropriati.</li><li>Il notebook originale resta su NotebookLM: l'autore è responsabile delle impostazioni di condivisione e dei contenuti collegati.</li></ol><div className="notice">Prima di aprire il sito al pubblico, completa le pagine legali con i dati del titolare del progetto, l'informativa privacy, le informazioni sui cookie e un recapito per richieste di rimozione. Questa pagina di regole non sostituisce tali documenti.</div><p><Link className="button button-primary" href="/">Torna alla raccolta</Link></p></div></div>}
