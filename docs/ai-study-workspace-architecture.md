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
