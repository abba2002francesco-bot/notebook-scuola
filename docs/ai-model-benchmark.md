# Benchmark modelli — Notebook Scuola

Stato: protocollo di valutazione da eseguire; nessun modello è stato scelto definitivamente.
Data di preparazione: 28 novembre 2026.

## Obiettivo

Scegliere il modello generativo che offre il miglior equilibrio tra:
- accuratezza e aderenza alle fonti;
- qualità didattica in italiano;
- capacità di ragionamento matematico e scientifico;
- citazioni verificabili;
- capacità di ammettere che una risposta non è presente nelle fonti;
- costo totale per attività e latenza.

Non scegliere il modello solo in base al prezzo o ai benchmark generali del fornitore.

## Candidati

| Etichetta cieca | ID Vercel AI Gateway | Input / 1M token | Output / 1M token |
|---|---|---:|---:|
| A | `mistral/mistral-small` (attualmente Mistral Small 4) | $0,15 | $0,60 |
| B | `google/gemini-3.1-flash-lite` | $0,25 | $1,50 |
| C | `google/gemini-2.5-flash-lite` | $0,10 | $0,40 |

Per i modelli Google, il test che coinvolge documenti di utenti va eseguito sull'endpoint Vertex con regione UE esplicita e zero-data-retention attivo, non assumendo che tutti gli endpoint dello stesso modello abbiano le stesse garanzie. I flag di catalogo non sostituiscono DPA, termini e verifica dei trasferimenti.

## Regole di confronto

1. Stesso testo delle fonti, stesse domande, stesso prompt di sistema e stessi limiti di token per tutti i candidati.
2. Temperatura e parametri equivalenti quando supportati; annotare le differenze inevitabili.
3. Eseguire almeno due ripetizioni per domanda per verificare la variabilità.
4. Nascondere il nome del modello ai valutatori durante il giudizio qualitativo.
5. Conservare output, ID modello effettivo, endpoint/provider, token input/output, latenza e costo.
6. Nessun documento personale o riservato: usare soltanto il corpus sintetico di questo file.
7. Le chiamate reali ai modelli comportano un costo anche se piccolo. Non eseguirle senza budget o crediti esplicitamente autorizzati.

## Corpus sintetico di riferimento

### Fonte FIS-01 — Cinematica

> Un corpo si muove lungo una linea retta con accelerazione costante a = 2 m/s². All'istante t = 0 s ha velocità iniziale v0 = 3 m/s e posizione iniziale s0 = 0 m. La velocità è v(t) = v0 + at. La posizione è s(t) = s0 + v0 t + (1/2)at². Queste relazioni valgono per accelerazione costante e moto rettilineo.

Risultati attesi:
- v(4 s) = 11 m/s.
- s(4 s) = 28 m.
- Spiegazione delle unità: m/s per velocità e m/s² per accelerazione.

### Fonte MAT-01 — Equazioni di secondo grado

> Per l'equazione ax² + bx + c = 0, con a diverso da zero, il discriminante è Δ = b² − 4ac. Se Δ è positivo ci sono due soluzioni reali distinte; se Δ è zero c'è una soluzione reale doppia; se Δ è negativo non ci sono soluzioni reali. Le soluzioni reali si calcolano con x = (−b ± √Δ)/(2a).

Risultati attesi per 2x² − 3x − 2 = 0:
- Δ = 25.
- Soluzioni: x = 2 e x = −1/2.
- Deve mostrare i passaggi in modo comprensibile.

### Fonte STO-01 — Rivoluzione francese

> La Rivoluzione francese iniziò nel 1789. Tra i fattori che contribuirono alla crisi dell'Antico Regime vi erano la disuguaglianza giuridica tra gli ordini sociali, la crisi finanziaria della monarchia, il peso fiscale sul Terzo Stato e la diffusione di idee illuministe. Il 14 luglio 1789 la presa della Bastiglia divenne un simbolo della rivoluzione. Nell'agosto 1789 l'Assemblea nazionale approvò l'abolizione dei privilegi feudali e la Dichiarazione dei diritti dell'uomo e del cittadino.

Risultati attesi:
- distinguere cause strutturali da evento simbolico;
- non attribuire tutte le cause a un unico fattore;
- non inventare dettagli non contenuti nella fonte.

## Set di domande

### Comprensione e spiegazione
1. Spiega a uno studente del terzo anno delle superiori la differenza tra velocità e accelerazione, usando esclusivamente FIS-01.
2. Riassumi STO-01 in cinque punti, distinguendo cause e avvenimenti.
3. Spiega MAT-01 senza saltare i passaggi del discriminante.

### Calcolo e ragionamento
4. Per FIS-01, calcola posizione e velocità a 4 secondi, mostrando formule, sostituzione numerica e unità.
5. Risolvi 2x² − 3x − 2 = 0 usando MAT-01 e verifica entrambe le soluzioni per sostituzione.
6. Per FIS-01, quanto tempo impiega il corpo a raggiungere 15 m/s? Mostra il ragionamento e l'unità.

### Grounding e gestione dell'incertezza
7. Secondo FIS-01, qual è la massa del corpo? Risposta attesa: la fonte non indica la massa; non inventarla.
8. Secondo STO-01, chi era il re di Francia nel 1789? Risposta attesa: l'informazione non è contenuta nella fonte; il modello deve dichiarare il limite, senza usare conoscenze esterne.
9. In MAT-01, l'equazione 2x² − 3x − 2 = 0 ha una o due soluzioni reali? Risposta attesa: due, con Δ positivo.

### Citazioni
10. Rispondi a una domanda su ciascuna fonte e cita esattamente il documento e il passaggio utilizzato. La citazione deve riferirsi al testo effettivamente recuperato, non a una pagina o frase inventata.

### Compito composito
11. Prepara cinque domande di autoverifica su STO-01 con risposta corretta e spiegazione, senza aggiungere fatti assenti dalla fonte.
12. Crea tre flashcard su MAT-01, distinguendo fronte e retro e mantenendo corrette tutte le formule.

## Rubrica di valutazione

Valutare ogni output da 0 a 4. Per ogni criterio, annotare un esempio concreto dell'output.

| Criterio | 0 | 2 | 4 |
|---|---|---|---|
| Correttezza | Errato o fuorviante | Parzialmente corretto | Corretto e completo |
| Fedeltà alle fonti | Inventa o contraddice | In parte fondato | Ogni affermazione richiesta è supportata |
| Citazioni | Mancanti/false | Parziali | Rintracciabili e precise |
| Didattica | Poco comprensibile | Comprensibile ma disordinato | Chiaro, progressivo, adatto al livello |
| Ragionamento STEM | Calcoli/formule errati | Procedura incompleta | Passaggi e unità corretti |
| Calibrazione | Inventa quando ignora | Qualche incertezza non gestita | Ammette con chiarezza ciò che manca |

Massimo: 24 punti per risposta. Separare i punteggi per task, non soltanto una media unica.

## Soglie proposte prima del test

Queste soglie sono criteri interni iniziali, non standard di settore:
- media minima 20/24;
- almeno 3/4 in fedeltà alle fonti;
- almeno 3/4 in citazioni;
- nessun errore grave di calcolo nelle domande STEM;
- 100% di risposte prudenti alle domande 7 e 8;
- costo per risposta e latenza annotati per ogni prova.

Un modello che costa meno ma inventa citazioni o sbaglia passaggi matematici non deve essere scelto come modello principale.

## Decisione multi-modello

Non serve usare sempre lo stesso modello per tutto:
- modello economico per classificare i documenti, estrarre metadati e preparare quiz semplici;
- modello principale per chat, spiegazioni e ragionamento;
- modello più forte solo come escalation per richieste complesse, se il costo e la qualità giustificano la funzione.

La complessità multi-modello verrà introdotta solo dopo un benchmark: per la prima beta preferire un unico modello principale e un fallback controllato, per ridurre bug e spesa.

## Scheda risultati da compilare

| Modello/endpoint | Punteggio /24 | Errori gravi | Citazioni corrette | Costo medio | Latenza p50/p95 | Esito |
|---|---:|---:|---:|---:|---:|---|
| A — Mistral Small 4 | — | — | — | — | — | Non testato |
| B — Gemini 3.1 Flash Lite (Vertex EU) | — | — | — | — | — | Non testato |
| C — Gemini 2.5 Flash Lite (Vertex EU) | — | — | — | — | — | Non testato |

