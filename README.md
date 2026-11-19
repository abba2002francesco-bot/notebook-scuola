# Notebook Scuola

Sito community per scoprire e condividere link pubblici a notebook NotebookLM. I notebook originali restano su Google: questo progetto ospita le schede, i collegamenti e le immagini di anteprima caricate dagli utenti.

## Funzioni incluse

- Catalogo pubblico con ricerca testuale e filtri per materia, livello, tipo di contenuto e ordinamento.
- Scheda di dettaglio per ogni notebook, con descrizione, tag, anteprime e pulsante per aprire NotebookLM.
- Registrazione e accesso con email e password tramite Supabase Auth.
- Invio di un notebook con link, materia, livello, argomento, indirizzo scolastico facoltativo, tag, descrizione e fino a 4 immagini.
- Preferiti personali, voto «Utile», commenti e segnalazioni.
- Eliminazione dei propri notebook.
- Regole di community e protezione dati tramite Row Level Security (RLS) di Supabase.

## Stack

- Next.js 16 + React + TypeScript
- Supabase: Postgres, Auth e Storage
- Vercel per hosting e deploy

## Cosa ti serve

1. Un account GitHub.
2. Un account Vercel.
3. Un account Supabase.
4. Node.js 22 o successivo, se vuoi provarlo sul tuo computer prima di pubblicarlo.

Per iniziare non devi comprare un dominio: Vercel fornisce un indirizzo `*.vercel.app`.

## 1. Crea il progetto Supabase

1. Apri [supabase.com](https://supabase.com/) e crea un nuovo progetto.
2. Scegli una regione europea (ad esempio Frankfurt) per tenere il database vicino agli utenti italiani.
3. Conserva la password del database in un posto sicuro.
4. Nel progetto apri **SQL Editor → New query**.
5. Apri il file `supabase/schema.sql` di questo progetto, copia tutto il contenuto, incollalo nell'editor SQL e premi **Run**.
6. In **Project Settings → API** copia il **Project URL** e la chiave pubblica **Publishable key** (oppure la vecchia `anon` key, se la dashboard mostra ancora quella).

Non inserire mai nel sito la `service_role` key o una secret key. Il sito usa esclusivamente la chiave pubblica e le policy RLS controllano i permessi.

## 2. Configura l'autenticazione Supabase

In Supabase apri **Authentication → URL Configuration**:

- Per **Site URL**, durante i test locali usa `http://localhost:3000`.
- Aggiungi agli **Redirect URLs** `http://localhost:3000/**`.
- Dopo il deploy aggiungerai anche `https://IL-TUO-PROGETTO.vercel.app/**`.

Mantieni attiva la conferma dell'email per il sito pubblico. La registrazione mostra un messaggio che invita a verificare la casella di posta. Il servizio email predefinito di Supabase ha limiti di invio: prima di aprire il sito a molte persone, configura un provider SMTP affidabile nelle impostazioni Auth.

## 3. Prova il sito sul computer (facoltativo)

Apri il terminale nella cartella del progetto e lancia:

```bash
npm install
```

Crea un file chiamato `.env.local` nella cartella principale, copiando `.env.example`, poi inserisci i valori reali:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TUO-PROGETTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_LA_TUA_CHIAVE
```

Avvia il sito:

```bash
npm run dev
```

Apri `http://localhost:3000` nel browser.

## 4. Carica il codice su GitHub

Crea su GitHub un nuovo repository, ad esempio `notebook-scuola`. Poi, dal terminale dentro la cartella del progetto, esegui (sostituendo il tuo nome utente GitHub):

```bash
git init
git add .
git commit -m "Prima versione di Notebook Scuola"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/notebook-scuola.git
git push -u origin main
```

Non caricare `.env.local`: è già escluso da `.gitignore`.

## 5. Pubblica su Vercel

1. Vai su [vercel.com](https://vercel.com/) e accedi con GitHub.
2. Premi **Add New → Project**.
3. Importa il repository `notebook-scuola`.
4. Lascia il framework su **Next.js**.
5. In **Environment Variables** aggiungi queste due variabili:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL di Supabase.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = Publishable key di Supabase.
6. Premi **Deploy**.
7. Al termine Vercel mostrerà il tuo indirizzo, ad esempio `notebook-scuola.vercel.app`.

Dopo il primo deploy torna su Supabase → **Authentication → URL Configuration** e aggiungi il dominio Vercel anche ai **Redirect URLs**. Puoi impostarlo come Site URL.

Ogni volta che invii modifiche al repository GitHub, Vercel ricostruisce e pubblica automaticamente il sito.

## 6. Test finale (fallo prima di condividere il sito)

1. Apri il dominio Vercel in una finestra anonima.
2. Crea un account con un indirizzo email a cui puoi accedere e conferma la registrazione.
3. Accedi e pubblica un notebook usando un link pubblico reale di NotebookLM.
4. Apri la scheda in un'altra finestra non autenticata: deve essere visibile senza login.
5. Prova il pulsante **Apri su NotebookLM** e controlla che il link sia effettivamente pubblico.
6. Accedi con un secondo account e prova preferiti, voto, commento e segnalazione.
7. Verifica che un utente non possa eliminare il notebook di un altro.

## Limiti e attività ancora necessarie prima del lancio pubblico

Questa è una prima versione funzionante del prodotto, non una piattaforma già pronta per una grande community.

- **Pubblicazione immediata:** i notebook vengono pubblicati subito. Le segnalazioni finiscono nella tabella `notebook_reports` e vanno controllate dal proprietario in Supabase. Non c'è ancora un pannello moderatore.
- **Nessuna verifica automatica del link:** il sito controlla il formato del link, ma non può garantire che il proprietario abbia lasciato il notebook pubblico o che il link continui a funzionare.
- **Nessuna anteprima automatica di NotebookLM:** le anteprime sono le immagini caricate da chi pubblica.
- **Gestione contenuti essenziale:** l'autore può eliminare il proprio notebook, ma non modificarlo dalla UI in questa versione.
- **Email:** per un uso pubblico più ampio configura un SMTP personalizzato per i messaggi di conferma e recupero password.
- **Aspetti legali:** prima di invitare il pubblico, aggiungi una vera informativa privacy GDPR, la gestione dei cookie se usi strumenti non essenziali, termini del servizio, contatto per richieste di rimozione e informazioni sul titolare del sito. Non ho inserito dati personali o riferimenti legali inventati.
- **Minori:** il pubblico scolastico può includere minorenni. Evita nomi precisi delle scuole, dati personali e immagini identificabili; valuta con un professionista gli adempimenti applicabili prima di renderlo un servizio aperto ai minori.

## Costi e limiti dei piani gratuiti

Il progetto è impostato per partire con i piani gratuiti. I limiti dei servizi possono cambiare: controlla sempre le pagine ufficiali prima del lancio.

- Vercel Hobby è gratuito per uso personale e non commerciale. Se il progetto diventa un servizio commerciale o cambia natura, verifica il piano e i termini richiesti da Vercel.
- Supabase Free include limiti su database, archiviazione, traffico e autenticazione. I progetti Free con attività insufficiente possono essere messi in pausa dopo un periodo di inattività.
- Un dominio personalizzato non è incluso gratuitamente da Vercel: per iniziare usa il dominio `vercel.app`.

## Struttura cartelle

```text
notebook-scuola/
├── app/                 pagine e stile del sito
├── components/          header, footer, gestione login
├── lib/                 client Supabase e tipi condivisi
├── supabase/schema.sql  tabelle, indici, regole RLS e bucket immagini
├── .env.example         modello delle variabili ambiente
├── package.json
└── README.md
```
