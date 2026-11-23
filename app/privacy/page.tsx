import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Informativa privacy | Notebook Scuola",
  description: "Informativa sul trattamento dei dati personali e sull’uso facoltativo dei servizi Google e Gemini in Notebook Scuola.",
};

const updatedAt = "23 novembre 2026";

export default function PrivacyPage() {
  return (
    <div className="container page">
      <article className="panel form-panel" style={{ maxWidth: 900, margin: "0 auto" }}>
        <span className="eyebrow">Trasparenza e protezione dei dati</span>
        <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "clamp(28px, 5vw, 38px)", letterSpacing: -1, lineHeight: 1.15 }}>
          Informativa sulla privacy
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Ultimo aggiornamento: {updatedAt}</p>

        <div style={{ color: "var(--ink)", lineHeight: 1.75, overflowWrap: "anywhere" }}>
          <h2>1. Titolare del trattamento e contatti</h2>
          <p>
            Il titolare del trattamento dei dati personali raccolti attraverso Notebook Scuola, disponibile all’indirizzo <strong>https://notebookscuola.it</strong>, è <strong>Francesco Abba</strong> (di seguito, il “Titolare”).
          </p>
          <p>
            Email di contatto: <a href="mailto:abbafre08@gmail.com">abbafre08@gmail.com</a>.
            <br />
            Recapito postale del Titolare: <strong>Via del Melograno 16B, 41012 Carpi (MO), Italia</strong>.
          </p>
          <p>
            Per richieste relative ai dati personali, all’esercizio dei diritti o alla rimozione di contenuti è possibile scrivere all’indirizzo email indicato sopra. 
          </p>

          <h2>2. Che cos’è Notebook Scuola</h2>
          <p>
            Notebook Scuola è una community indipendente che permette agli utenti di consultare e condividere schede pubbliche contenenti collegamenti a notebook di Google NotebookLM, descrizioni, argomenti, tag e immagini di anteprima. I notebook originali e le relative fonti rimangono nei servizi Google: Notebook Scuola ospita le schede, i collegamenti e le immagini caricate dagli utenti e non è affiliato, sponsorizzato o approvato da Google o NotebookLM.
          </p>

          <h2>3. Quali dati trattiamo</h2>
          <h3>3.1 Dati dell’account e del profilo</h3>
          <p>
            Quando una persona crea un account o accede al servizio, vengono trattati l’indirizzo email e i dati tecnici necessari all’autenticazione, gestiti tramite Supabase Auth. La tabella pubblica dei profili contiene il nome visualizzato e il nome utente; non contiene l’indirizzo email. Il nome visualizzato e il nome utente sono consultabili dagli altri visitatori insieme ai contenuti pubblicati dall’utente.
          </p>

          <h3>3.1-b Registrazione, verifica dell’età e consenso genitoriale</h3>
          <p>
            Per avviare la registrazione vengono richiesti il nome visualizzato, l’indirizzo email e la data di nascita dichiarata. La data di nascita è utilizzata per individuare il percorso di registrazione e non viene salvata nella richiesta di autorizzazione genitoriale. Per le persone di almeno 14 anni viene inviato un link personale di verifica all’indirizzo dello studente. Per chi dichiara meno di 14 anni, la richiesta viene inviata all’indirizzo email del genitore o tutore: prima della creazione dell’account, la persona che esercita la responsabilità genitoriale deve dichiarare il proprio ruolo, indicare il nome e il rapporto con lo studente ed esprimere il consenso.
          </p>
          <p>
            Per gestire e documentare questa procedura vengono trattati il nome visualizzato e l’email dello studente, l’email del genitore o tutore, il nome e il rapporto dichiarati da quest’ultimo, la versione del testo di consenso, l’esito della dichiarazione e le date della richiesta e dell’autorizzazione. I token dei link sono conservati nel database sotto forma di hash e non in chiaro. Il link al genitore scade dopo 48 ore; il link per lo studente di almeno 14 anni scade dopo 30 minuti, mentre quello inviato dopo il consenso genitoriale scade entro 24 ore. Le email transazionali sono inviate tramite Resend.
          </p>

          <h3>3.2 Contenuti pubblicati e attività della community</h3>
          <p>Quando un utente pubblica o interagisce con una scheda, il servizio può trattare:</p>
          <ul>
            <li>titolo, link pubblico NotebookLM, materia, livello scolastico, argomento e, se inserita, scuola;</li>
            <li>tag, tipi di contenuto selezionati, descrizione e numero delle fonti;</li>
            <li>immagini di anteprima caricate dall’utente (il sistema accetta immagini JPEG, PNG o WebP, entro i limiti mostrati nel modulo);</li>
            <li>commenti, voti di utilità, preferiti e segnalazioni, inclusi i relativi dati di account, data e contenuto della segnalazione.</li>
          </ul>
          <p>
            Le schede dei notebook, i commenti, i nomi utente, i nomi visualizzati e le immagini di anteprima sono destinati alla consultazione pubblica. I preferiti sono personali. Le segnalazioni non sono mostrate agli altri utenti e sono accessibili al Titolare per la loro gestione. Prima di pubblicare, l’utente deve verificare che il link e i materiali possano essere condivisi e non deve inserire dati personali, immagini identificabili o informazioni riservate di altre persone, in particolare di minori.
          </p>

          <h3>3.3 Collegamento facoltativo a Google e lettura dei notebook</h3>
          <p>
            Se l’utente sceglie di collegare il proprio account Google, Notebook Scuola avvia una procedura OAuth con il permesso di sola lettura <code>https://www.googleapis.com/auth/notebook.readonly</code>. Il servizio legge l’elenco dei notebook di proprietà dell’account collegato e, per il notebook selezionato, il titolo e i metadati delle fonti (nome visualizzato, tipo e stato), per compilare il titolo e contare le fonti. Il servizio non modifica né elimina notebook o fonti e non scarica il testo integrale dei documenti, le conversazioni o gli artefatti generati.
          </p>
          <p>
            Il codice attuale non scarica il testo integrale dei documenti sorgente, le conversazioni di NotebookLM o gli artefatti generati. Il token di rinnovo restituito da Google viene cifrato con AES-256-GCM e conservato in un cookie <code>HttpOnly</code>, <code>Secure</code> in produzione e <code>SameSite=Lax</code>, con durata tecnica massima configurata di 60 giorni; il cookie temporaneo che protegge la procedura OAuth dura 10 minuti. Quando l’utente scollega Google dal sito, Notebook Scuola tenta di revocare il token presso Google e cancella il cookie locale; l’utente può inoltre revocare l’accesso dalle impostazioni del proprio Account Google. La connessione è facoltativa e i campi possono essere compilati manualmente. Durante la Public Preview della Gemini Notebook API sono supportati gli account Google personali; gli account Google Workspace non sono attualmente supportati.
          </p>

          <h3>3.4 Suggerimenti generati con Gemini</h3>
          <p>
            Soltanto se l’utente seleziona la casella di autorizzazione facoltativa e richiede i suggerimenti, al servizio Gemini API di Google vengono inviati il titolo del notebook e fino a 100 elementi di metadati delle fonti (nome visualizzato, tipo e stato). Non vengono inviati tramite questa funzione i testi integrali dei documenti, le conversazioni o gli artefatti del notebook. Gemini restituisce suggerimenti per materia, livello, argomento, descrizione e tag; l’utente deve controllarli e può modificarli prima della pubblicazione. La generazione AI non decide automaticamente se una persona possa accedere al servizio e non produce decisioni con effetti giuridici sull’utente.
          </p>
          <p>
            L’invio a Gemini è facoltativo e subordinato a una scelta separata, non preselezionata, nell’interfaccia. Se non viene autorizzato, i campi possono essere compilati manualmente. Le condizioni di trattamento di Google dipendono dal livello Gemini API effettivamente applicato: per il Free Tier Google indica che i prompt possono essere utilizzati per migliorare i prodotti; per il Paid Tier indica che i prompt non vengono utilizzati a tale scopo. Il Titolare deve mantenere allineato il livello del progetto alle informazioni mostrate all’utente. Notebook Scuola non vende i dati Google e non li usa per pubblicità.
          </p>

          <h3>3.5 Dati tecnici e statistiche</h3>
          <p>
            Il sito è ospitato su Vercel e integra Vercel Web Analytics. Secondo la documentazione del fornitore, Web Analytics non utilizza cookie di terze parti e genera statistiche aggregate a partire da dati anonimizzati o pseudonimizzati, che possono includere data e ora della visualizzazione, pagina visitata, provenienza, area geografica approssimativa, tipo di dispositivo, sistema operativo e browser. Vercel descrive un identificatore di visita basato su hash con durata di sessione limitata. Per i dettagli aggiornati si rinvia alla <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noreferrer">documentazione privacy di Vercel Analytics</a>.
          </p>
          <p>
            Il sito carica inoltre i caratteri tipografici DM Sans e Manrope tramite Google Fonts: quando il browser richiede tali risorse, Google può ricevere i dati tecnici necessari a effettuare la richiesta, come l’indirizzo IP e le informazioni del browser. La sessione di accesso gestita da Supabase viene mantenuta nel browser tramite l’archiviazione locale prevista dalla libreria Supabase. Per limitare gli abusi, le richieste di registrazione e le generazioni AI utilizzano identificatori hash derivati da elementi come IP ed email; i provider di hosting possono inoltre trattare log tecnici secondo le proprie informative.
          </p>

          <h2>4. Finalità e basi giuridiche</h2>
          <ul>
            <li><strong>Creare e gestire account, autenticare gli utenti, mantenere profili e consentire pubblicazione, modifica, commenti, voti e preferiti:</strong> esecuzione del servizio richiesto e delle condizioni d’uso, art. 6, par. 1, lett. b) GDPR.</li>
            <li><strong>Proteggere il sito, prevenire abusi, gestire segnalazioni e mantenere sicurezza e funzionamento:</strong> legittimo interesse del Titolare, art. 6, par. 1, lett. f) GDPR, da bilanciare con i diritti degli utenti.</li>
            <li><strong>Collegare l’account Google e leggere i metadati del notebook selezionato:</strong> richiesta volontaria dell’utente e autorizzazione OAuth Google; il collegamento può essere interrotto in qualsiasi momento.</li>
            <li><strong>Inviare a Gemini il titolo e i metadati delle fonti per generare suggerimenti:</strong> consenso facoltativo dell’utente, art. 6, par. 1, lett. a) GDPR, revocabile interrompendo l’uso della funzione e modificando la scelta nell’interfaccia, ove disponibile.</li>
            <li><strong>Rispettare obblighi di legge e richieste legittime delle autorità:</strong> adempimento di obblighi legali, art. 6, par. 1, lett. c) GDPR, quando applicabile.</li>
            <li><strong>Misurare in forma aggregata l’utilizzo del sito:</strong> interesse a comprendere il funzionamento e migliorare il servizio; la base giuridica e l’eventuale necessità di ulteriori misure devono essere confermate dal Titolare prima del lancio.</li>
          </ul>

          <h2>5. Natura dei dati e conseguenze del mancato conferimento</h2>
          <p>
            L’indirizzo email e i dati strettamente necessari all’autenticazione sono necessari per creare e utilizzare un account. Senza tali dati non è possibile offrire le funzioni riservate agli utenti registrati. La connessione Google e l’invio di metadati a Gemini sono facoltativi: senza di essi l’utente può compilare manualmente i campi della scheda, nei limiti delle funzioni disponibili. I campi indicati come facoltativi nel modulo non sono necessari per inviare una scheda.
          </p>

          <h2>6. Destinatari e fornitori</h2>
          <p>I dati possono essere trattati, secondo le rispettive funzioni e condizioni contrattuali, dai seguenti fornitori:</p>
          <ul>
            <li><strong>Supabase:</strong> autenticazione, database e archiviazione delle immagini di anteprima;</li>
            <li><strong>Vercel:</strong> hosting, distribuzione del sito e statistiche Web Analytics;</li>
            <li><strong>Google:</strong> autenticazione OAuth, Gemini Notebook API per leggere i notebook e i metadati autorizzati dall’utente, Gemini API per i suggerimenti AI facoltativi e Google Fonts;</li>
            <li><strong>Resend:</strong> invio delle email di verifica, inviti agli studenti e richieste di consenso genitoriale;</li>
            <li><strong>OVHcloud:</strong> registrazione e gestione del dominio e dei relativi DNS.</li>
          </ul>
          <p>
            I ruoli dei singoli fornitori (responsabile del trattamento o titolare autonomo) sono determinati in base ai servizi effettivamente utilizzati e alla documentazione contrattuale applicabile. I fornitori trattano i dati secondo le proprie informative, condizioni di servizio e, ove applicabile, gli accordi sul trattamento dei dati.
          </p>

          <h2>7. Trasferimenti fuori dallo Spazio economico europeo</h2>
          <p>
            Il progetto Supabase utilizzato da Notebook Scuola è ospitato nella regione <strong>eu-west-1 (Irlanda)</strong>. I fornitori possono utilizzare infrastrutture o sub-responsabili anche al di fuori dello Spazio economico europeo; gli eventuali trasferimenti sono disciplinati dalle condizioni contrattuali dei singoli fornitori e, quando necessario, da decisioni di adeguatezza o garanzie appropriate previste dal GDPR, incluse le clausole contrattuali standard. Le informazioni aggiornate su localizzazione, sub-responsabili e garanzie sono contenute nelle informative e negli accordi dei fornitori.
          </p>

          <h2>8. Tempi di conservazione</h2>
          <ul>
            <li><strong>Account e profilo:</strong> per il tempo in cui l’account rimane attivo; in caso di richiesta di cancellazione, i dati vengono eliminati o resi non identificabili, salvo ciò che deve essere conservato per obbligo di legge o per accertare, esercitare o difendere un diritto.</li>
            <li><strong>Schede e immagini pubblicate:</strong> fino alla cancellazione da parte dell’autore o alla rimozione da parte del Titolare; eventuali copie tecniche di backup seguono i tempi dei rispettivi fornitori.</li>
            <li><strong>Commenti, voti e preferiti:</strong> per il tempo necessario a fornire le relative funzioni e fino alla loro cancellazione o alla cancellazione dell’account, fatte salve eventuali esigenze legali.</li>
            <li><strong>Segnalazioni:</strong> per il tempo necessario a esaminarle e documentare la gestione, poi cancellate o rese non identificabili quando non più necessarie.</li>
            <li><strong>Collegamento Google:</strong> il cookie cifrato ha una durata tecnica massima configurata di 60 giorni, salvo scollegamento anticipato; il cookie temporaneo OAuth dura 10 minuti. La revoca presso Google può essere effettuata anche dalle impostazioni dell’Account Google.</li>
            <li><strong>Richieste di registrazione e consenso genitoriale:</strong> i link di autorizzazione hanno le scadenze indicate sopra; i dati della richiesta e la prova del consenso sono conservati per la durata necessaria a gestire la registrazione, documentare l’autorizzazione e tutelare eventuali diritti, e successivamente cancellati o resi non identificabili quando non più necessari.</li>
            <li><strong>Identificatori anti-abuso:</strong> gli identificatori hash utilizzati per i limiti alle richieste sono associati a finestre temporali di un’ora e sono conservati per il tempo necessario alla protezione del servizio.</li>
            <li><strong>Statistiche:</strong> secondo i periodi e le modalità indicati da Vercel per Web Analytics; il fornitore descrive un identificatore di visita di sessione eliminato dopo 24 ore e dati statistici aggregati.</li>
          </ul>
          <p>
            Le copie di backup e i log tecnici possono permanere per i periodi operativi previsti dai fornitori, anche dopo la cancellazione dai sistemi attivi; vengono gestiti secondo le procedure tecniche di sicurezza e cancellazione dei rispettivi servizi.
          </p>

          <h2>9. Diritti degli interessati</h2>
          <p>
            Nei casi previsti dal GDPR, l’interessato può chiedere accesso ai dati, rettifica, cancellazione, limitazione del trattamento, portabilità e può opporsi ai trattamenti basati sul legittimo interesse. Quando il trattamento si basa sul consenso, questo può essere revocato in qualsiasi momento senza pregiudicare la liceità del trattamento precedente alla revoca.
          </p>
          <p>
            Le richieste possono essere inviate a <a href="mailto:abbafre08@gmail.com">abbafre08@gmail.com</a>. L’interessato ha inoltre diritto di proporre reclamo al <a href="https://www.garanteprivacy.it/" target="_blank" rel="noreferrer">Garante per la protezione dei dati personali</a>. Il Titolare può chiedere informazioni aggiuntive ragionevoli per verificare l’identità del richiedente.
          </p>

          <h2>10. Minori e contenuti scolastici</h2>
          <p>
            Notebook Scuola è rivolto alla condivisione di risorse di studio e può essere utilizzato da persone in età scolastica. Per gli utenti che dichiarano meno di 14 anni, il sistema non consente di creare l’account prima che un genitore o tutore abbia ricevuto la richiesta, dichiarato la propria responsabilità ed espresso il consenso; solo dopo viene inviato allo studente il link personale per completare la registrazione. Per gli utenti di almeno 14 anni viene inviato un link personale di verifica alla casella dello studente. La data di nascita viene utilizzata per individuare il percorso e non è salvata nella richiesta di autorizzazione genitoriale. Gli utenti non devono pubblicare dati personali, immagini identificabili, voti, documenti scolastici o altre informazioni riservate di terzi, soprattutto di minori.
          </p>

          <h2>11. Sicurezza</h2>
          <p>
            Il progetto utilizza controlli di accesso al database (Row Level Security), sessioni di autenticazione gestite da Supabase e, per il collegamento Google, un token cifrato in un cookie protetto. Nessuna misura tecnica può garantire una sicurezza assoluta; gli utenti devono proteggere le credenziali del proprio account e non condividere dati riservati nelle schede o nei commenti.
          </p>

          <h2>12. Modifiche all’informativa</h2>
          <p>
            Questa informativa può essere aggiornata in caso di modifiche al sito, ai fornitori o alle modalità di trattamento. La versione vigente sarà pubblicata su questa pagina con la relativa data di aggiornamento.
          </p>

        </div>

        <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link className="button button-secondary" href="/termini">Leggi i termini di servizio</Link>
          <Link className="button button-primary" href="/">Torna alla raccolta</Link>
        </p>
      </article>
    </div>
  );
}