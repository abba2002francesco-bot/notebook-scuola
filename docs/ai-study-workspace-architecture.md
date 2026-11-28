# Architettura — Notebook Scuola: area studio indipendente

Stato: proposta tecnica iniziale, da validare prima di migrazioni o rilascio.
Ramo di lavoro: `feature/independent-study-workspace`.

## Obiettivo

Aggiungere a Notebook Scuola un ambiente personale per creare notebook di studio a partire da documenti caricati direttamente dagli utenti. Il motore deve essere indipendente da Google NotebookLM e non deve richiedere nuovi scope Google OAuth.

Il catalogo pubblico esistente resta separato e invariato.

## Principi architetturali

1. **Separazione dal prodotto esistente**: nuove pagine, API, tabelle e bucket con prefisso `study_` o equivalente; nessuna modifica alle tabelle del catalogo esistente nella prima fase.
2. **Provider AI sostituibile**: chiamate AI solo dal server, con un'interfaccia interna neutrale e modello configurabile via variabili d'ambiente. Mistral Small 4 e Gemini Flash-Lite sono candidati da confrontare, non una scelta definitiva.
3. **Fonti prima della generazione**: le risposte basate sul notebook devono recuperare estratti dai documenti e riportare riferimenti a documento e pagina. Se non c'è evidenza sufficiente, il sistema deve dichiararlo.
4. **Privacy by default**: documenti in storage privato; accesso limitato al proprietario; chiavi AI e chiavi amministrative mai esposte al browser.
5. **Costi controllati**: quote per utente, limiti file/token, limite globale di spesa e possibilità di sospendere le richieste AI.
6. **Rilascio progressivo**: prima ambiente beta chiuso, poi test misurabili, infine apertura pubblica.

## Componenti

- **Frontend**: Next.js App Router, con area personale non collegata alla navigazione pubblica fino al completamento dei test.
- **Autenticazione**: riutilizzare l'account Supabase Auth attuale di Notebook Scuola. Il nuovo progetto dati non crea account paralleli e non cambia i flussi di registrazione o consenso.
- **API**: Next.js Route Handlers verificano il token dell'utente sul Supabase Auth principale e inoltrano le richieste a una Edge Function nel progetto dati isolato. La Edge Function riverifica il token prima di utilizzare il proprio service role.
- **Database**: PostgreSQL Supabase; nuove tabelle dedicate all'area studio.
- **File**: Supabase Storage con bucket privato; nessun accesso diretto anonimo/autenticato al progetto dati. La Edge Function crea URL firmati a scadenza breve dopo aver verificato il proprietario.
- **Ricerca semantica**: pgvector, con query sempre filtrate per notebook e proprietario.
- **AI**: Vercel AI SDK + AI Gateway, dopo aver verificato versione installata, modello/ID esatto e policy del provider.

## Modello dati proposto

Questi nomi sono concettuali; tipi, chiavi esterne e policy saranno definiti nella migrazione dopo aver verificato lo schema attivo.

- `study_workspaces`: proprietario, titolo, materia, livello, impostazioni e date.
- `study_sources`: notebook, path storage, nome file, MIME, dimensione, stato elaborazione, metadati e diagnostica.
- `study_source_chunks`: fonte, indice chunk, testo, intervallo pagine, embedding e metadati.
- `study_conversations`: notebook, proprietario, titolo e date.
- `study_messages`: conversazione, ruolo, contenuto, citazioni strutturate, modello e token usati.
- `study_usage_events`: utente, richiesta, modello, token input/output, costo stimato e data.
- `study_jobs` (se necessario): elaborazioni documenti con stato, tentativi e messaggi d'errore non sensibili.

RLS è attivo su tutte le tabelle, ma il progetto dati non concede privilegi di lettura/scrittura ai ruoli `anon` e `authenticated`: l'accesso passa soltanto dalla Edge Function server-side. Il `user_id` memorizzato è l'UUID dell'utente verificato sul progetto Auth principale e non ha una FK verso `auth.users` del progetto dati (i due progetti hanno identità e chiavi JWT distinte). Ogni query amministrativa deve sempre filtrare per `user_id` verificato; le chiavi `secret/service_role` non escono mai dalla Edge Function. Per Storage, il percorso del file non sostituisce il controllo di proprietà.

## Flusso documenti

1. L'utente crea un workspace e carica un documento.
2. Il server autentica l'utente e controlla quota, formato, dimensione e tipo effettivo del file.
3. Il file originale viene salvato in un bucket privato.
4. Un processo estrae il testo mantenendo riferimenti a pagine e sezioni.
5. Il testo viene suddiviso in blocchi con sovrapposizione controllata; i blocchi e gli embedding vengono salvati.
6. Lo stato passa a pronto soltanto se l'indicizzazione è terminata; errori e file non leggibili vengono comunicati all'utente.

Prima versione: PDF testuali, DOCX e PPTX. PDF scansiti e immagini con OCR sono previsti in una fase successiva; niente promessa di estrazione perfetta da formule, grafici o impaginazioni complesse.

## Flusso domande e risposte (RAG)

1. Next.js verifica la sessione dell'account principale; la Edge Function riverifica il token con `auth.getUser()` sullo stesso progetto.
2. La Edge Function ricava `user.id` dal token verificato, senza accettare un `user_id` dal client; applica limiti e verifica del budget.
3. Recupera i blocchi più pertinenti, filtrati per workspace e proprietario.
4. Invia al modello solo la domanda e gli estratti necessari.
5. Richiede una risposta didattica che distingua fatti presenti nelle fonti da spiegazioni aggiuntive.
6. Restituisce citazioni tracciabili a fonte e pagina.
7. Registra metadati di utilizzo e costo senza duplicare inutilmente il contenuto dei documenti nei log.

Il sistema non deve presentare come citazione un passaggio che non è stato effettivamente recuperato.

## MVP

1. Creazione, modifica e cancellazione dei notebook personali.
2. Upload e indicizzazione dei primi tre formati.
3. Chat con fonti e citazioni.
4. Riassunto, quiz e flashcard generati dalle fonti.
5. Dashboard interna di consumo e limiti.

Non includere nella prima versione: collaborazione, condivisione pubblica, podcast, generazione audio, OCR generalizzato e mappe concettuali avanzate.

## Valutazione dei modelli

Prima di fissare il modello di produzione, preparare un benchmark ripetibile con domande italiane provenienti da documenti di scuola secondaria e università. Misurare separatamente:

- correttezza rispetto alle fonti;
- precisione delle citazioni;
- qualità e chiarezza della spiegazione;
- ragionamento matematico e scientifico;
- gestione dell'incertezza e rifiuto di inventare;
- latenza e costo per attività.

Candidati iniziali: Mistral Small 4 e Gemini 3.1 Flash-Lite. La scelta dipenderà dai test, non soltanto dal prezzo per token. Evitare piani gratuiti le cui condizioni consentano di utilizzare documenti e prompt degli utenti per migliorare i modelli.

## Beta gratuita controllata

La beta iniziale deve avere accesso limitato e quote rigide: numero di utenti/tester, notebook per utente, dimensione e quantità di file, richieste AI, token per richiesta e budget globale. Il limite di spesa deve essere verificato lato server; non basta nascondere il pulsante quando il credito è esaurito.

Il costo zero assoluto non può essere garantito se si esauriscono i crediti gratuiti o se i piani cambiano. In caso di budget esaurito, il servizio AI deve fermarsi in modo esplicito, senza passare a consumo illimitato.

## Salvaguardie Google e rilascio

- Non modificare durante la verifica in corso brand OAuth, schermata di consenso, domini, redirect URI o scope.
- Il nuovo motore non deve chiamare Google NotebookLM API né richiedere scope aggiuntivi.
- Sviluppo e test sul ramo dedicato e su deployment di anteprima; nessun merge in `main` senza verifica.
- Prima della beta pubblica: aggiornare privacy policy e informazioni sul trattamento dei documenti, definire tempi di conservazione/cancellazione e verificare la procedura applicabile agli utenti minorenni.
- Le migrazioni Supabase non vanno eseguite sul progetto attivo finché schema, RLS, Storage e piano di rollback non sono stati revisionati.

## Decisioni ancora aperte

- Limiti esatti di upload e quote della beta.
- Politica di conservazione dei file e cancellazione.
- Provider/modello AI definitivo e relativo contratto/DPA.
- Pipeline per elaborazioni lunghe e necessità di una coda.
- Criteri del benchmark e soglia minima di qualità.


## Controllo iniziale del Supabase principale — 28 novembre 2026

Questa sezione riporta il controllo iniziale sul progetto Supabase collegato a `notebookscuola.it`; in seguito l'ambiente Studio è stato creato separatamente come descritto più sotto.

- Vercel: il progetto di produzione corretto è `free-notebook`; il ramo di sviluppo è separato da `main`.
- Il progetto Supabase principale è stato controllato prima di creare l'ambiente dedicato. Le tabelle del catalogo e di Auth sono rimaste separate.
- Al controllo iniziale non esistevano tabelle `study_*` nel progetto principale.
- Il bucket pubblico `notebook-images` è destinato alle anteprime del catalogo e non viene riutilizzato per documenti privati.
- La cronologia migrazioni Supabase registra attualmente una sola migrazione (`registration_authorization_hook`), mentre lo schema applicativo esistente include altre tabelle già operative. Ogni futura migrazione deve quindi essere additiva e controllata; non tentare di ricreare lo schema di base.

### Modello embedding proposto

Per i primi test si propone `mistral-embed`: la documentazione Mistral indica vettori a 1024 dimensioni e un prezzo pubblicato di $0,10 per milione di token in ingresso. La proposta SQL usa quindi `extensions.vector(1024)`, ma la scelta resta soggetta a test di recupero in italiano e verifica del contratto dati. Fonti: https://docs.mistral.ai/inference/embeddings/text-embeddings e https://docs.mistral.ai/inference/pricing.

La ricerca iniziale non crea subito un indice HNSW: nella beta chiusa confronteremo la ricerca esatta su dataset piccoli, precisione dei risultati e latenza. Aumenteremo la complessità solo quando i test mostreranno che serve.

### Prima proposta di schema e sicurezza

File di riferimento: `supabase/drafts/study_workspace_schema.proposal.sql`. È un documento di proposta, **non una migration e non va eseguito**.

La proposta prevede:
- sei tabelle nuove: workspace, fonti, chunk, conversazioni, messaggi e utilizzi AI;
- chiavi esterne composte che impediscono di associare un figlio al workspace di un altro proprietario;
- RLS con lettura limitata al proprietario;
- nessuna scrittura diretta dal browser sulle tabelle di studio: le Route Handlers verificano il token con `auth.getUser(token)`, controllano la proprietà e solo allora usano la chiave amministrativa;
- bucket separato e privato `study-source-files`;
- l'upload è consentito soltanto per un percorso file già prenotato da una riga fonte valida e non scaduta, così l'utente non può usare il bucket come spazio libero non conteggiato;
- funzione di ricerca vettoriale `SECURITY INVOKER`, filtrata per `auth.uid()` e workspace.

### Avvisi di sicurezza già presenti, da non confondere con questa nuova funzione

Il controllo Supabase del 28 novembre ha rilevato avvisi preesistenti:
- RLS attivo ma nessuna policy su `app_admins`, `parental_consent_requests`, `registration_authorizations` e `registration_rate_limit_buckets`. Alcune tabelle possono essere intenzionalmente accessibili soltanto al backend, ma va verificato che i privilegi siano coerenti.
- Funzioni `SECURITY DEFINER` in schema pubblico (`handle_new_user()` e `is_app_admin()`) eseguibili da ruoli autenticati e/o anonimi: va esaminata la necessità di restringerne l'esecuzione.
- Protezione Supabase contro password compromesse attualmente disattivata.

Questi avvisi appartengono alla configurazione preesistente. Non vengono modificati in questa fase per non rischiare di interrompere registrazione, consenso genitoriale o pannello amministrativo. Dovranno essere affrontati in una revisione di sicurezza separata prima dell'apertura pubblica della nuova area.


### Verifica catalogo modelli AI — 28 novembre 2026

Il catalogo live di Vercel AI Gateway restituisce questi identificativi esatti:

| Candidato | ID Gateway | Input / 1M token | Output / 1M token | Dati/endpoint |
|---|---|---:|---:|---|
| Mistral Small 4 | `mistral/mistral-small` | $0,15 | $0,60 | Endpoint Mistral: ZDR e no-training dichiarati |
| Gemini 3.1 Flash Lite | `google/gemini-3.1-flash-lite` | $0,25 | $1,50 | Endpoint Vertex EU: ZDR e no-training dichiarati; tariffa regionale $0,275 / $1,65 |
| Gemini 2.5 Flash Lite | `google/gemini-2.5-flash-lite` | $0,10 | $0,40 | Endpoint Vertex EU: ZDR e no-training dichiarati |

Il catalogo Gateway specifica che `mistral/mistral-small` attualmente esegue Mistral Small 4. Per Gemini, quando la protezione dei documenti è un requisito, il confronto va fatto sull'endpoint Vertex con regione UE esplicita, non assumendo che tutti gli endpoint Google abbiano le stesse garanzie. I flag zero-data-retention e no-training descrivono le caratteristiche dichiarate dal provider nel catalogo; prima del rilascio dovremo comunque verificare termini, DPA e trasferimenti di dati effettivi.

Esempio puramente comparativo: 1.000 richieste con 10.000 token input e 1.000 token output ciascuna costerebbero circa $2,10 con Mistral Small 4, $4,40 con Gemini 3.1 Flash Lite su Vertex EU e $1,40 con Gemini 2.5 Flash Lite su Vertex EU. Non include embedding, eventuali caching, imposte o altre componenti. Il modello più economico non è automaticamente quello da scegliere: la decisione dipende dal benchmark didattico.

Per gli embedding, il catalogo Gateway espone `mistral/mistral-embed` a $0,10 per milione di token; la documentazione Mistral dichiara 1024 dimensioni. La proposta SQL ora memorizza la dimensione di ogni embedding separatamente, invece di fissare il tipo vector a 1024: questa scelta evita di legare definitivamente l'architettura a un unico embedding model. Il modello iniziale proposto resta Mistral Embed, da verificare su testi scolastici italiani.


## Ambiente di sviluppo creato e schema applicato — 28 novembre 2026

Il progetto Supabase separato `notebook-scuola-ai-dev` è stato creato nell'organizzazione esistente, nella regione `eu-west-1`, con preventivo di creazione $0/mese. Project ref: `bgdocyhfcejbutnvsyxl`. È `ACTIVE_HEALTHY`.

La prima struttura di studio è stata applicata a questo progetto vuoto, non al database in produzione. L'Auth rimane quello del progetto principale; il progetto dati non contiene account duplicati. Sono presenti sette tabelle nuove:
- `study_workspaces`
- `study_sources`
- `study_source_pages` (testo estratto, per pagina o diapositiva)
- `study_source_chunks` (predisposta per i chunk con embedding; indicizzazione non ancora attiva)
- `study_conversations`
- `study_messages`
- `study_usage_events`

È installato pgvector 0.8.2 nello schema `extensions`. Il bucket `study-source-files` è privato, ammette PDF/DOCX/PPTX ed è limitato a 20 MiB per file.

### Verifiche svolte

- RLS è attivo su tutte e sette le tabelle; i ruoli `anon` e `authenticated` non hanno privilegi diretti sulle tabelle di studio. Il servizio usa il solo `service_role` nell'Edge Function.
- Il ruolo `service_role` ha privilegi per le operazioni server-side; la tabella `study_source_pages` ha anche una policy esplicita riservata a questo ruolo.
- Le funzioni SQL di ricerca e quota sono eseguibili soltanto da `service_role`, non da `anon` né da `authenticated`.
- La funzione di ricerca vettoriale ha superato uno smoke test con zero risultati su un workspace inesistente; gli embeddings non sono ancora generati.
- Il bucket `study-source-files` è privato. Upload e download usano URL firmati emessi dopo la verifica della proprietà; non sono state create policy Storage per accesso diretto dal browser.
- Supabase Security Advisors restituisce `lints: []` sulle nuove tabelle e policy.

Un primo controllo aveva rilevato privilegi SELECT ereditati dal ruolo `anon`; sono stati revocati esplicitamente e i privilegi minimi sono stati concessi nuovamente. Il controllo successivo ha confermato: anon SELECT = false; authenticated SELECT = true; authenticated INSERT = false; service_role INSERT = true.

### Test ancora necessari

Lo smoke test non sostituisce un test end-to-end con due utenti autenticati distinti. Prima di aprire la beta occorre verificare che utente A non possa leggere file, workspace, chunk e conversazioni di utente B, e provare upload, scadenza del ticket di upload, cancellazione e quote dal backend.

Il file SQL in `supabase/drafts/` resta la specifica leggibile della struttura applicata; non è ancora una migration versionata con Supabase CLI. Prima del rilascio si dovrà consolidare in una migration ufficiale e mantenerla sincronizzata.


## Primo servizio e pagina Studio — 28 novembre 2026

La Edge Function `study-api` è attiva nel progetto dati `bgdocyhfcejbutnvsyxl`, con `verify_jwt=false` perché il token entrante appartiene al progetto Auth principale. La funzione effettua una verifica esplicita con `primaryAuth.auth.getUser(token)` prima di ogni accesso amministrativo al database isolato. Il service role resta esclusivamente nell'ambiente Edge Function.

Primo endpoint supportato: `/functions/v1/study-api/workspaces`:
- GET: elenco dei notebook dell'utente verificato;
- POST: creazione di un notebook personale;
- DELETE: eliminazione filtrata per ID e proprietario.

La quota beta iniziale è 5 workspace per utente. La pagina Next.js privata `/studio` e il proxy `/api/studio/workspaces` sono stati aggiunti al ramo di sviluppo. La pagina è impostata `noindex` e `robots.txt` la esclude dall'indicizzazione. Non è stato aggiunto alcun link nella navigazione pubblica.


## Quota beta e verifica transazionale — 28 novembre 2026

La quota iniziale di 5 notebook personali per utente è applicata da una funzione SQL `create_study_workspace_with_quota` riservata al ruolo `service_role`. La funzione usa un advisory transaction lock per utente, quindi il conteggio e l'inserimento sono serializzati anche quando arrivano richieste simultanee.

Verifiche sul database di sviluppo:
- funzione eseguibile da `service_role`;
- funzione non eseguibile da `anon` né da `authenticated`;
- chiamata di prova dentro una transazione seguita da `ROLLBACK`: la funzione ha restituito un ID valido e il conteggio finale delle righe è rimasto a zero;
- nessun finding dai Supabase Security Advisors dopo gli aggiornamenti.

La Edge Function `study-api` è stata aggiornata alla versione 3. Oltre alle funzioni workspace gestisce prenotazione delle fonti, upload firmato, generazione di URL firmati di download, persistenza del testo estratto, stato di errore e cancellazione dei file. Il sorgente è tracciato nel repository in `supabase/functions/study-api/index.ts`.

## Stato UI e anteprima

La pagina privata `/studio` è stata implementata con elenco notebook, creazione, eliminazione e indicatore quota 0–5. Il layout responsive è stato aggiunto a `app/globals.css`. Le API passano dal proxy Next.js `/api/studio/workspaces` alla Edge Function del progetto dati.

La build Vercel dell'area studio e degli endpoint Next.js ha completato TypeScript e compilazione nelle anteprime precedenti. L'ultima anteprima deve essere ricontrollata dopo il commit di stile/sorgente. Non è stato eseguito alcun merge in `main`.

**Limite attuale:** non è ancora stato eseguito un test end-to-end con una sessione browser reale; manca quindi la conferma pratica del flusso autenticato GET/POST/DELETE. Prima di considerare la prima schermata completata, un account di test dovrà creare un workspace nell'anteprima e verificarne la persistenza e l'eliminazione. La UI non è collegata al menu pubblico e il sito di produzione resta invariato.


Ulteriore test della quota: in una transazione di prova sono stati creati cinque workspace per un utente sintetico; la sesta creazione ha restituito l'errore previsto `STUDY_WORKSPACE_LIMIT_REACHED`. La transazione è stata annullata e il controllo successivo ha confermato zero righe di test persistenti.

## Upload ed estrazione documenti — 28 novembre 2026

La fase di caricamento è stata implementata sul ramo \`feature/independent-study-workspace\` e usa esclusivamente il Supabase di sviluppo.

### Flusso tecnico

1. Il browser invia al backend soltanto i metadati del file e l'ID del workspace.
2. Next.js verifica la sessione con l'Auth principale; l'Edge Function ripete la verifica con \`auth.getUser(token)\`.
3. La funzione SQL \`create_study_source_with_quota\` verifica proprietà del workspace e quote in modo atomico: massimo 25 documenti e 100 MiB complessivi per workspace.
4. L'Edge Function crea una riga fonte e un URL firmato di upload, valido per due ore. Il file va direttamente nel bucket privato \`study-source-files\`; il browser non riceve mai la chiave amministrativa.
5. La route Node.js di Vercel recupera il file tramite URL firmato di download e ne controlla l'origine, la dimensione e il formato effettivo.
6. Estrae il testo e lo salva in gruppi limitati, mantenendo gli indici pagina/diapositiva. Lo stato passa a \`extracted\` solo dopo il completamento di tutti i gruppi.

### Formati e limiti beta attuali

- PDF: testo selezionabile, massimo 20 MiB e 1.000 pagine; viene mantenuto il numero di pagina. I PDF composti soltanto da scansioni non sono ancora supportati perché OCR non è attivo.
- DOCX: estrazione dei paragrafi e del testo; Word non offre una paginazione stabile nel formato, quindi il testo viene conservato come un unico contenuto con indice pagina nullo.
- PPTX: estrazione del testo per diapositiva, con numero della diapositiva.
- Limite di estrazione: 2 milioni di caratteri per documento.
- File non testuali, protetti da password o danneggiati vengono segnalati come non elaborabili; non vengono dichiarati pronti.

Il testo estratto è conservato in \`study_source_pages\`. La tabella \`study_source_chunks\` resta predisposta, ma chunking, embeddings, retrieval, chat con citazioni e generazione AI non sono ancora attivi. Non viene effettuata alcuna chiamata a modelli AI o a API a pagamento durante l'upload.

### Stato dei test

La migrazione SQL incrementale per \`study_source_pages\`, il nuovo status \`extracted\`, il contatore caratteri e la quota atomica delle fonti sono stati applicati al progetto dati di sviluppo. I Supabase Security Advisors non segnalano findings. Rimangono da eseguire il test end-to-end con file PDF/DOCX/PPTX reali nell'anteprima e la verifica di cancellazione fisica degli oggetti Storage.

