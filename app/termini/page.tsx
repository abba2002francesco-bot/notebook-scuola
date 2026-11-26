import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termini di servizio | Notebook Scuola",
  description: "Termini di utilizzo della community indipendente Notebook Scuola.",
  alternates: { canonical: "/termini" },
};

const updatedAt = "23 novembre 2026";

export default function TermsPage() {
  return (
    <div className="container page">
      <article className="panel form-panel" style={{ maxWidth: 900, margin: "0 auto" }}>
        <span className="eyebrow">Regole del servizio</span>
        <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "clamp(28px, 5vw, 38px)", letterSpacing: -1, lineHeight: 1.15 }}>
          Termini di servizio
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Ultimo aggiornamento: {updatedAt}</p>

        <div style={{ color: "var(--ink)", lineHeight: 1.75, overflowWrap: "anywhere" }}>
          <h2>1. Chi gestisce Notebook Scuola</h2>
          <p>
            Notebook Scuola è un servizio indipendente gestito da <strong>Francesco Abba</strong> (il “Gestore” o il “Titolare”), contattabile all’indirizzo <a href="mailto:abbafre08@gmail.com">abbafre08@gmail.com</a>.
          </p>
          <p>
            Recapito postale: <strong>Via del Melograno 16B, 41012 Carpi (MO), Italia</strong>.
          </p>
          <p>
            Notebook Scuola non è affiliato, sponsorizzato o approvato da Google, Google NotebookLM o Vercel. I nomi e i marchi di terzi appartengono ai rispettivi titolari.
          </p>

          <h2>2. Oggetto del servizio</h2>
          <p>
            Notebook Scuola mette a disposizione una raccolta indipendente di schede pubbliche che descrivono e collegano notebook di Google NotebookLM condivisi dagli utenti. Il sito ospita le schede, i link e le immagini di anteprima caricate dagli utenti; i notebook originali e le loro fonti rimangono nei servizi Google. Il servizio comprende, tra le altre funzioni disponibili, ricerca e filtri, profili, pubblicazione e modifica delle proprie schede, commenti, voti di utilità, preferiti e segnalazioni.
          </p>

          <h2>3. Account e uso del servizio</h2>
          <ul>
            <li>Per utilizzare le funzioni riservate occorre creare un account con un indirizzo email valido e custodire con cura le credenziali.</li>
            <li>L’utente deve fornire informazioni corrette e mantenere aggiornati i dati del profilo.</li>
            <li>L’utente è responsabile delle attività svolte tramite il proprio account, salvo uso non autorizzato tempestivamente segnalato.</li>
            <li>Il collegamento Google è facoltativo e richiede un’autorizzazione separata. L’utente può revocarlo dal sito o dalle impostazioni del proprio Account Google.</li>
            <li>Per chi dichiara meno di 14 anni, la creazione dell’account avviene soltanto dopo la conferma e il consenso di un genitore o tutore. Per gli utenti di almeno 14 anni è prevista la verifica personale dell’indirizzo email.</li>
            <li>Durante la Public Preview della Gemini Notebook API, il collegamento è attualmente disponibile con account Google personali; gli account Google Workspace non sono supportati.</li>
          </ul>

          <h2>4. Contenuti pubblicati dagli utenti</h2>
          <p>
            L’utente conserva i diritti sui contenuti che crea e carica. Pubblicando una scheda, un’immagine, un commento o un altro contenuto, dichiara di avere i diritti e le autorizzazioni necessari per condividerlo e autorizza il Gestore, senza esclusiva e senza corrispettivo, a ospitarlo, riprodurlo, visualizzarlo e renderlo disponibile all’interno di Notebook Scuola nella misura necessaria a fornire, mantenere e promuovere il servizio.
          </p>
          <p>L’utente si impegna a:</p>
          <ul>
            <li>condividere soltanto notebook che ha il diritto di rendere pubblici e verificare che le impostazioni di condivisione Google consentano l’accesso al link;</li>
            <li>non caricare scansioni, libri, dispense, immagini o altri materiali protetti da diritto d’autore senza autorizzazione o altra base legittima;</li>
            <li>non pubblicare dati personali, documenti, fotografie identificabili o informazioni riservate di altre persone, soprattutto di minori, senza una base giuridica e le autorizzazioni necessarie;</li>
            <li>non inserire contenuti illegali, diffamatori, discriminatori, minacciosi, offensivi, ingannevoli, promozionali non autorizzati o che violino diritti di terzi;</li>
            <li>fornire titoli, descrizioni, materie, tag e numero delle fonti ragionevolmente accurati e aggiornati.</li>
          </ul>
          <p>
            I dati della scheda, il profilo pubblico, le immagini di anteprima e i commenti sono visibili agli altri visitatori. Prima di pubblicare, l’utente deve quindi controllare che non siano presenti dati che intende mantenere privati. I preferiti sono personali; le segnalazioni sono destinate al Gestore.
          </p>

          <h2>5. Suggerimenti generati con l’intelligenza artificiale</h2>
          <p>
            Se l’utente autorizza la funzione, Notebook Scuola può inviare a Gemini il titolo del notebook e i metadati delle fonti (nome, tipo e stato) per ricevere suggerimenti su materia, livello, argomento, descrizione e tag. La funzione, secondo l’integrazione attuale, non legge né invia a Gemini il testo integrale delle fonti, le conversazioni o gli artefatti di NotebookLM. I suggerimenti possono essere incompleti o inesatti: l’utente deve verificarli e correggerli prima della pubblicazione. L’utente rimane responsabile dei contenuti che decide di pubblicare.
          </p>

          <h2>6. Contenuti e servizi di terzi</h2>
          <p>
            I link a Google NotebookLM e ad altri servizi esterni portano a piattaforme gestite da terzi, soggette alle loro condizioni, informative, disponibilità e impostazioni di accesso. Il Gestore non controlla i contenuti originali ospitati su tali piattaforme e non garantisce che un link resti funzionante o che un notebook rimanga pubblico. L’utente deve rispettare anche le condizioni dei servizi terzi.
          </p>

          <h2>7. Segnalazioni, richieste di rimozione e moderazione</h2>
          <p>
            Gli utenti possono utilizzare la funzione di segnalazione presente nelle schede o contattare il Gestore all’indirizzo <a href="mailto:abbafre08@gmail.com">abbafre08@gmail.com</a>, indicando il link del contenuto, il motivo della richiesta e le informazioni necessarie a valutarla. Il Gestore può rimuovere o limitare la visibilità di contenuti che ritiene contrari a questi termini, alla legge o ai diritti di terzi, e può sospendere account in caso di abusi.
          </p>
          <p>
            Le segnalazioni sono esaminate dal Gestore; il sito non dispone attualmente di un pannello pubblico di moderazione né garantisce una rimozione automatica o immediata. Per richieste relative a copyright o dati personali, fornire elementi sufficienti a identificare il contenuto e il diritto che si ritiene violato.
          </p>

          <h2>8. Disponibilità e modifiche del servizio</h2>
          <p>
            Notebook Scuola è un progetto indipendente e può essere aggiornato, sospeso o modificato per ragioni tecniche, di sicurezza, legali o organizzative. Il Gestore si impegna a mantenere il servizio con ragionevole cura, ma non garantisce disponibilità continua, assenza di errori, conservazione permanente dei contenuti o compatibilità con ogni dispositivo. Restano fermi i diritti inderogabili riconosciuti dalla legge.
          </p>

          <h2>9. Sospensione e cessazione</h2>
          <p>
            Il Gestore può limitare o sospendere l’accesso, o rimuovere contenuti, quando necessario per prevenire abusi, proteggere gli utenti, rispettare la legge o tutelare diritti di terzi. L’utente può eliminare le proprie schede tramite le funzioni disponibili e può chiedere la cancellazione dell’account scrivendo a <a href="mailto:abbafre08@gmail.com">abbafre08@gmail.com</a>. La cancellazione può comportare la rimozione dei contenuti collegati all’account, fatte salve le informazioni che devono essere conservate per obblighi di legge o per la gestione di contestazioni.
          </p>

          <h2>10. Minori</h2>
          <p>
            Il servizio è dedicato alla condivisione di risorse di studio e può essere utilizzato da persone in età scolastica. Gli utenti devono evitare di pubblicare dati personali o immagini identificabili di altri studenti. Per gli utenti che dichiarano meno di 14 anni, l’account viene creato soltanto dopo la dichiarazione e il consenso esplicito di un genitore o tutore attraverso il link inviato alla sua email; lo studente riceve poi un link personale per completare la registrazione. Per gli utenti di almeno 14 anni è prevista la verifica personale dell’indirizzo email. Le presenti condizioni non sostituiscono le regole nazionali sulla capacità del minore di concludere contratti.
          </p>

          <h2>11. Responsabilità</h2>
          <p>
            L’utente è responsabile dei contenuti che pubblica, dei diritti necessari alla loro condivisione e delle impostazioni di visibilità dei notebook originali su Google. Nei limiti consentiti dalla legge, il Gestore non è responsabile dei contenuti, dei servizi o delle interruzioni delle piattaforme di terzi, né dell’uso che altri fanno delle informazioni rese pubbliche dall’utente. Nessuna disposizione di questi termini esclude o limita responsabilità o diritti che non possono essere esclusi o limitati per legge.
          </p>

          <h2>12. Privacy</h2>
          <p>
            Il trattamento dei dati personali è descritto nell’<Link href="/privacy">Informativa sulla privacy</Link>, che costituisce documento separato e deve essere letta prima di utilizzare le funzioni che comportano il trattamento di dati personali.
          </p>

          <h2>13. Modifiche ai termini</h2>
          <p>
            I termini possono essere aggiornati per modifiche normative, tecniche o del servizio. La versione vigente è pubblicata su questa pagina con la data dell’ultimo aggiornamento. Le modifiche sostanziali saranno comunicate attraverso il sito, ove ragionevolmente possibile.
          </p>

          <h2>14. Legge applicabile e contatti</h2>
          <p>
            I presenti termini sono predisposti in lingua italiana. Salve le norme inderogabili applicabili, il rapporto è disciplinato dalla legge italiana. Per gli utenti che agiscono come consumatori restano fermi i criteri di competenza e le tutele inderogabili previsti dalla normativa applicabile.
          </p>
          <p>
            Per domande o richieste: <a href="mailto:abbafre08@gmail.com">abbafre08@gmail.com</a> — Francesco Abba. Recapito postale: <strong>Via del Melograno 16B, 41012 Carpi (MO), Italia</strong>.
          </p>
        </div>

        <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link className="button button-secondary" href="/privacy">Leggi l’informativa privacy</Link>
          <Link className="button button-primary" href="/">Torna alla raccolta</Link>
        </p>
      </article>
    </div>
  );
}