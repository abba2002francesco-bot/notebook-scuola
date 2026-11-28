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
- **Autenticazione**: sessione Supabase già in uso; verifica utente lato server per ogni endpoint. Non introdurre nuovi flussi Google OAuth.
- **API**: Next.js Route Handlers per creazione notebook, upload, chat, generazione strumenti di studio e quote.
- **Database**: PostgreSQL Supabase; nuove tabelle dedicate all'area studio.
- **File**: Supabase Storage con bucket privato, policy di lettura/scrittura per proprietario e validazione server-side.
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

Tutte le tabelle esposte avranno RLS. Le policy devono verificare la proprietà del notebook anche nelle relazioni, non soltanto che l'utente sia autenticato. Per Storage, il percorso del file non sostituisce il controllo di proprietà.

## Flusso documenti

1. L'utente crea un workspace e carica un documento.
2. Il server autentica l'utente e controlla quota, formato, dimensione e tipo effettivo del file.
3. Il file originale viene salvato in un bucket privato.
4. Un processo estrae il testo mantenendo riferimenti a pagine e sezioni.
5. Il testo viene suddiviso in blocchi con sovrapposizione controllata; i blocchi e gli embedding vengono salvati.
6. Lo stato passa a pronto soltanto se l'indicizzazione è terminata; errori e file non leggibili vengono comunicati all'utente.

Prima versione: PDF testuali, DOCX e PPTX. PDF scansiti e immagini con OCR sono previsti in una fase successiva; niente promessa di estrazione perfetta da formule, grafici o impaginazioni complesse.

## Flusso domande e risposte (RAG)

1. Verifica sessione e proprietà del workspace.
2. Applica limiti e verifica del budget.
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


## Verifica dell'infrastruttura attiva — 28 novembre 2026

Questa sezione riporta dati osservati sul progetto collegato a `notebookscuola.it`, non ipotesi.

- Vercel: il progetto di produzione corretto è `free-notebook`; il ramo di sviluppo è separato da `main`.
- Supabase: progetto attivo nella regione `eu-west-1`, PostgreSQL 17.12.
- Nel database attivo non esistono ancora tabelle `study_*`.
- L'estensione `vector` è disponibile alla versione predefinita 0.8.2 ma non è installata.
- Storage contiene un solo bucket attuale, `notebook-images`, pubblico e destinato alle anteprime del catalogo. Non deve essere riutilizzato per documenti privati.
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
