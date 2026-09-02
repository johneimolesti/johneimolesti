# John & i Molesti

Web app mobile-first per gestione repertorio, scalette, concerti, fan, votazioni e classifiche dei **John & i Molesti**.

Frontend statico in un singolo `index-v2.html`, pubblicabile su GitHub Pages. Dati, autenticazione membri, RPC e storage sono gestiti da Supabase; le operazioni dei fan passano attraverso la Edge Function `fan-api`.

## File principali

- `index-v2.html` - frontend completo.
- `fan-api-index.ts` - codice della Edge Function Supabase `fan-api`.
- `patch_v2_4.sql` - patch SQL incrementale da eseguire dopo le patch precedenti fino a `patch_v2_3.sql`.
- `favicon.png` e `apple-touch-icon.png` - icone della web app.
- `Manuale_Membri.pdf` - manuale operativo per i membri della band.
- `Guida_Rapida_Membri.pdf` - riferimento sintetico per l'uso quotidiano.

## Principi dell'interfaccia

- Mobile-first per fan e consultazione generale.
- Area membri ottimizzata anche per desktop, con liste dense e contenitori che sfruttano tutta l'altezza disponibile.
- Nessun pulsante **Salva** per le modifiche: checkbox, selezioni e campi vengono salvati al click, al cambio di valore o quando si esce dal campo.
- Le azioni di creazione, eliminazione, approvazione o conferma possono invece avere un pulsante dedicato perché non sono semplici modifiche di un record esistente.
- Il `SETUP` è disponibile solo da desktop.
- Le liste principali evitano lo scroll generale della pagina quando possibile; lo scroll rimane interno ai singoli pannelli.

---

# Profilazione e funzionalità

## 1. Admin

Gli admin sono i membri con privilegi completi. Nel progetto corrente Ema e Kekko sono super-admin equivalenti.

### Repertorio e catalogo

- Creazione di nuove canzoni.
- Modifica immediata dei metadati del brano con autosalvataggio.
- Attivazione/disattivazione brani.
- Hidden track non visibili ai fan.
- Metadati base/testo, BPM, tonalità, durata e difficoltà strumenti.
- Gestione agganci forzati tra brani.
- Parametri interni usati dagli algoritmi di scaletta.
- Approvazione o rifiuto delle proposte di nuove canzoni inviate dai membri.
- Pannello **PROPOSTE DA VALIDARE (N)** sempre presente nel catalogo; è attivo solo quando esistono richieste.

### Scaletta personale e proposte

- Gestione della propria scaletta tramite drag & drop.
- Inclusione/esclusione dei brani.
- Copia della scaletta in formato testuale numerato.
- Consultazione delle tre proposte automatiche:
  - Media Membri;
  - Algoritmo Puro;
  - Media Fusa.

### Scaletta dei membri

- Vista di ogni singolo membro.
- Vista globale con tutte le scalette affiancate, mostrando solo posizione e titolo.
- Liste adattive in altezza: fino a circa 25/30 brani l'obiettivo è mostrare l'intera scaletta senza scroll; oltre tale densità lo scroll resta interno al pannello.

### Concerti

- Creazione, copia e modifica dei concerti.
- Stati disponibili:
  - `Bozza`;
  - `Futuro`;
  - `Confermato`;
  - `Concluso`.
- Le date passate sono ammesse per `Bozza` e `Concluso`; Futuro/Confermato non accettano date precedenti a oggi.
- Associazione a una Venue registrata.
- Locandina del concerto.
- Private show.
- Apertura votazioni fan.
- Import della scaletta da:
  - Media Fusa;
  - Media Membri;
  - Algoritmo Puro;
  - scaletta confermata di un membro;
  - scaletta ideale corrente di un membro.
- Aggiunta manuale dei brani.
- Drag & drop della scaletta finché il concerto non è concluso.
- Quando il concerto diventa `Concluso`:
  - ordine bloccato;
  - rimozione brani bloccata;
  - restano modificabili solo voti/valutazioni, vibes e marcatura `BIS`.

### Vibes live

Nel riepilogo della scaletta di un concerto concluso ogni brano dispone direttamente dei toggle:

- `P` - Pogo;
- `C` - Cantata;
- `B` - Ballata;
- `BIS` - il brano è stato eseguito nel bis.

Le vibes descrivono la reazione generale generata dal brano in quella serata e non devono essere attribuite a un fan specifico. Ogni membro può registrare la propria osservazione; ai fini statistici la stessa vibe vale una volta per concerto e canzone.

### Venue

La sezione `VENUE` è indipendente dal Setup.

- Elenco delle venue già usate.
- Riutilizzo delle venue in concerti successivi.
- Recupero automatico delle venue storiche già presenti nei concerti.
- Creazione e modifica di una venue.
- Nome, città, tipologia e stato attivo.
- Pannello `TIPOLOGIE VENUE` con:
  - aggiunta;
  - modifica;
  - eliminazione;
  - attivazione/disattivazione;
  - picker colore.
- La tipologia viene mostrata nei record concerto come linguetta verticale, arrotondata sul lato sinistro e raccordata al bordo del record.

### Fan

Layout desktop della sezione FAN:

- metà sinistra: classifica fan completa;
- destra in alto: gestione fan con record compatti;
- destra in basso: richieste di unificazione;
- nessuno scroll generale della pagina; ogni pannello scorre autonomamente.

Funzioni di gestione:

- creazione manuale fan;
- modifica nome/nickname;
- alias;
- presenze;
- merge/unificazione profili;
- gestione richieste di unificazione.

### Permessi

Matrice di permessi per:

- membri non admin;
- fan;
- ospiti `Sono solo curioso`.

Per i membri una funzione può essere nascosta, sola lettura oppure modificabile quando previsto.

### Setup

Disponibile solo da PC.

Il pannello è suddiviso in sezioni selezionabili.

#### Etichette

Per ogni etichetta canzone:

- nome;
- colore;
- descrizione pubblica, massimo 250 caratteri;
- visibilità in:
  - Classifica;
  - Scaletta serata;
  - Area membri.

Il cambio di nome/colore/visibilità non altera il criterio matematico che assegna l'etichetta.

#### Punteggi

Consente di modificare senza codice i valori usati dalla classifica fan:

- punti per presenza a concerto pubblico;
- percentuale punti dei private show;
- punti per voto di una canzone al live;
- punti per voto generale del concerto;
- punti massimi attività live per concerto;
- numero di membri necessario per dare peso pieno all'attività live;
- punti catalogo per:
  - voto Molesti;
  - gusto Base;
  - gusto Testo;
  - conoscenza Base;
  - conoscenza Testo.

Il ricalcolo della classifica utilizza sempre i valori correnti del Setup. I vecchi eventi di voto non rimangono quindi congelati al valore in vigore quando furono registrati.

---

## 2. Membro

Le funzioni effettivamente visibili dipendono dalla matrice permessi.

### La mia scaletta

- Inclusione/esclusione canzoni.
- Riordino drag & drop.
- Vista densa pensata per contenere circa 20-30 brani nell'altezza disponibile.
- Scroll interno solo quando l'elenco eccede la densità gestibile.
- Copia testuale numerata.

### 3 Proposte

Consultazione delle tre proposte automatiche con titolo e indicazioni contestuali essenziali.

### Catalogo

- Vista compatta: nel catalogo membri non vengono ripetuti sotto il titolo i dettagli già disponibili nelle viste di classifica/scaletta.
- Voto personale del membro quando permesso.
- Proposta di nuovi brani quando permesso.
- Le proposte proprie rimangono consultabili fino a validazione.

### Scalette membri

- Vista singola di ciascun membro.
- Vista globale con tutte le scalette una accanto all'altra.
- Nella vista globale vengono mostrati soltanto posizione e titolo per favorire il confronto immediato.

### Concerti

- Consultazione dei live disponibili.
- Consultazione scaletta quando permesso.
- Nei concerti conclusi la scaletta è bloccata e non può essere riordinata o privata di brani.
- Nei concerti conclusi è possibile registrare direttamente sui record dei brani:
  - Pogo;
  - Cantata;
  - Ballata;
  - BIS.
- Possibilità di valutare l'attività dei fan presenti secondo i permessi previsti.

### Classifiche

Consultazione di classifica brani, dettagli e statistiche disponibili.

### Fan

Un membro può consultare la classifica e i dettagli consentiti. Le funzioni amministrative di gestione profili non fanno parte dell'uso membro ordinario.

---

## 3. Fan

Il fan non utilizza una password tradizionale. Il profilo persistente viene riconosciuto dal dispositivo/browser.

### Primo accesso

Questionario iniziale:

1. presenza o meno a un concerto dei Molesti;
2. eventuale provenienza/conoscenza della band;
3. eventuale modalità con cui ha ascoltato i pezzi;
4. scelta di 1-3 canzoni preferite;
5. eventuale `N.1 assoluta`.

Se il fan dichiara di essere già stato a concerti ma il profilo ha zero presenze, alla prima login utile viene proposta la selezione dei live frequentati.

- Concerti pubblici e private show sono separati da piccole tile.
- Ogni spunta viene salvata subito.
- Se il fan seleziona `SKIP`, la richiesta viene considerata risolta e non viene più riproposta automaticamente.

### Catalogo

- Voto Molesti rapido 1-10.
- Voto avanzato:
  - gusto Base;
  - gusto Testo;
  - conoscenza Base;
  - conoscenza Testo.
- Conoscenza Base/Testo è una tantum.
- I valori dei punti mostrati al fan derivano dal Setup corrente.
- Regola voto canzone:
  - se esiste un voto dal Catalogo, prevale quello;
  - se non esiste, il catalogo usa la media dei voti dati a quella canzone nei live;
  - un successivo voto catalogo sostituisce la media live come voto ufficiale del fan.

### Nuove canzoni da recensire

Quando viene attivata una nuova canzone, viene proposta alla prima login utile.

- voto = recensione completata;
- skip = presa visione senza voto;
- se il fan resta inattivo a lungo, le novità non viste iniziano comunque a pesare progressivamente sul criterio `RECENSORE`.

### Concerti

- Elenco separato Pubblici / Private Show.
- `Io c'ero`.
- Voto generale del concerto.
- Voto dei singoli brani.
- Reazioni personali:
  - Pogo;
  - Cantata;
  - Non riuscivo a stare fermo/a;
  - Goduta.
- Tutte le modifiche si salvano al click.
- `Goduta` rimane una sensazione personale e non viene attribuita dai membri.

### Nuovi live conclusi da recensire

Se il fan risultava presente, alla prima login utile può valutare il concerto o saltare la proposta.

### Classifiche

- Fan;
- Canzoni;
- Concerti.

### Profilo

Il fan può aggiornare le risposte del questionario e la propria Top 3.

---

## 4. Ospite - Sono solo curioso

Accesso in sola lettura.

- Nessun profilo fan.
- Nessun controllo del dispositivo.
- Nessun voto o presenza.
- Accesso solo alle funzioni consentite dalla matrice permessi, tipicamente concerti e classifiche.

---

# Flussi di gestione

## Flusso nuova canzone

1. La canzone viene creata direttamente da un admin oppure proposta da un membro.
2. Se proposta, compare nel pannello `PROPOSTE DA VALIDARE (N)`.
3. L'admin approva o rifiuta.
4. Una volta attiva entra nel Catalogo.
5. `NEW` non dipende dalla data di creazione: compare soltanto dopo il debutto live e solo se la prima apparizione è una delle ultime 3 scalette concluse.
6. Dal primo live in avanti iniziano a maturare statistiche storiche, vibes ed etichette.

## Flusso concerto

1. Creazione in `Bozza` - può anche avere una data passata.
2. Preparazione venue, locandina e scaletta.
3. Passaggio a Futuro/Confermato per la pubblicazione e la gestione dell'orario live.
4. Durante o dopo il live vengono raccolti voti e presenze fan.
5. Passaggio a `Concluso`:
   - blocco ordine scaletta;
   - blocco rimozione brani;
   - registrazione Pogo/Cantata/Ballata;
   - marcatura BIS;
   - valutazioni attività fan.
6. I dati storici alimentano classifiche, algoritmi ed etichette.

## Flusso Venue

1. Le venue già presenti nei concerti vengono importate automaticamente nell'archivio.
2. Una Venue può essere riutilizzata nei nuovi live.
3. Ogni Venue può avere una Tipologia.
4. Le Tipologie sono configurabili con nome, colore e stato attivo.
5. Eliminando una tipologia, le venue restano esistenti ma senza quella classificazione.

## Flusso fan e unificazione

1. Il fan inserisce il proprio nome.
2. Il dispositivo viene associato al profilo fan.
3. Se esistono omonimi o profili precedenti, il sistema può proporre recupero/unificazione.
4. Se il recupero automatico non è sufficiente, viene generata una richiesta di unificazione.
5. L'admin risolve la richiesta mantenendo dati, presenze e voti sul profilo finale.

## Flusso recensioni e RECENSORE

Per il badge RECENSORE vengono considerate:

- almeno 75% delle canzoni del catalogo valutate;
- almeno 75% dei concerti frequentati con voto generale del live.

Le novità non ancora viste non penalizzano immediatamente il fan, ma acquisiscono peso con il tempo. Se il fan apre la proposta, voto e skip valgono entrambi come presa visione; il voto completa la recensione, lo skip no.

---

# Regole comuni delle etichette canzone

## FSA - Finestra Storica Adattiva

Per i criteri recenti:

- meno di 20 concerti conclusi: ultimi 8;
- da 20 concerti in poi: ultimo 30% dei concerti conclusi, arrotondato per eccesso.

## IFR - Indice Fibonacci di Recenza

Quando serve uno spareggio tra risultati recenti, gli eventi più vicini nel tempo ricevono peso crescente secondo una progressione Fibonacci. Non cambia il requisito principale dell'etichetta; serve principalmente a ordinare candidati equivalenti.

## Blocco finale

Il blocco conclusivo di una scaletta è:

`max(4, ceil(20% del numero di canzoni della scaletta))`

In questo modo anche le vecchie scalette da 13-14 brani hanno almeno 4 canzoni considerate come finale.

## Visibilità e prevalenza

- Ogni canzone mostra al massimo 2 etichette condivise contemporaneamente.
- Alcune etichette assolute prevalgono sulla corrispondente versione recente:
  - BIG OPENER > OPENING ACT;
  - THE LAST ONE > E' ORA DI FINIAMOLA;
  - STALLONE > CAVALLO;
  - NOMADE > JOLLY;
  - FAN FAV > FAN TOP 3;
  - GRAN FINALE > E' ORA;
  - NEW > RARITÀ.
- COMEBACK è contestuale alle scalette recenti e non è una caratteristica permanente del catalogo.

---

# Legenda etichette canzone e criteri

| Etichetta | Criterio |
|---|---|
| **OPENING ACT** | Prima canzone in almeno il 66% dei concerti della FSA. |
| **BIG OPENER** | Canzone usata più volte come apertura in assoluto. In caso di parità prevale la più forte secondo recenza IFR. |
| **E' ORA DI FINIAMOLA** | Ultima canzone in almeno il 66% dei concerti della FSA. |
| **THE LAST ONE** | Canzone usata più volte come ultima in assoluto. Spareggio con IFR. |
| **CAVALLO** | Presente in almeno l'80% dei concerti della FSA. |
| **STALLONE** | Canzone con più presenze in scaletta in assoluto; spareggio su frequenza da quando è disponibile e recenza. |
| **JOLLY** | Top 3 per variabilità recente della posizione; almeno 3 presenze recenti e utilizzo in tutte e 3 le fasce della scaletta. |
| **NOMADE** | Top 3 per variabilità storica della posizione; almeno 5 presenze e utilizzo nelle 3 fasce della scaletta. |
| **POP** | Top 3 combinando 65% gradimento condiviso e 35% popolarità; gradimento condiviso almeno 8/10 e minimo 3 voti fan + 3 membri. |
| **HIT** | Top 3 per voto medio fan; almeno 3 fan e copertura di almeno il 40% dei fan che hanno valutato il catalogo. |
| **LA MINA** | Top 3 per percentuale di esecuzioni che hanno generato Pogo; minimo 3 esecuzioni. |
| **Tutti insieme!** | Top 3 per percentuale di esecuzioni marcate Cantata; minimo 3 esecuzioni. |
| **Shake your ...** | Top 3 per percentuale di esecuzioni marcate Ballata; minimo 3 esecuzioni. |
| **CULT** | Top 3 storiche: almeno 8 esecuzioni, presenti in almeno il 50% dei concerti dal debutto, gradimento condiviso >= 8/10 e almeno 12 mesi nel catalogo. |
| **FAN TOP 3** | Top 3 per preferenze fan: 1 punto per presenza in Top 3, +2 aggiuntivi se N.1 assoluta. |
| **FAN FAV** | Canzone con più scelte N.1 assoluta; spareggio su punteggio Top 3 e diffusione tra i fan. |
| **E' ORA** | Negli eventi recenti: almeno 3 presenze e almeno il 66% di queste nel blocco finale. |
| **GRAN FINALE** | Top 3 storiche: almeno 5 presenze e almeno il 66% delle presenze nel blocco finale. |
| **BIS** | Canzone utilizzata più volte nei bis in assoluto. Richiede almeno 2 apparizioni in un bis; gli ex aequo condividono l'etichetta. |
| **NEW** | Il debutto live della canzone è avvenuto in una delle ultime 3 scalette concluse. Una canzone mai suonata non è NEW. |
| **RARITÀ** | Non NEW, almeno 5 concerti trascorsi dal debutto e presenza in non più del 15% dei concerti da quel debutto. |
| **SLEEPER** | Top 3: almeno 3 esecuzioni, presenza in non più del 30% dei concerti dal debutto e gradimento condiviso >= 8,5/10. |
| **DIVISIVA** | Top 3 con almeno 8 voti: almeno 25% voti 8-10 e almeno 25% voti 1-4, con minimo 2 persone in ciascun polo. |
| **COMEBACK** | Etichetta temporanea nelle scalette recenti: ritorno dopo almeno 5 concerti consecutivi di assenza; resta contestuale per massimo 3 concerti dal rientro. |

---

# Badge fan

| Badge | Criterio principale |
|---|---|
| **TOP FAN** | Tra i migliori 5 per presenze, media attività membri >= 7,7 e almeno 2 membri valutatori. |
| **FEDELISSIMO** | Almeno 5 concerti pubblici utili e presenza >= 80% dei pubblici dalla prima volta. |
| **ANIMA LIVE** | Media attività >= 8,5 su almeno 3 concerti e con almeno 2 membri valutatori. |
| **POGO MASTER** | Top 3 per numero di concerti distinti con almeno un Pogo registrato. |
| **UGOLA D'ORO** | Top 3 per numero di concerti distinti con almeno una Cantata. |
| **TICKETTIO** | Top 3 per concerti con `Non riuscivo a stare fermo/a`, minimo 3. |
| **RECENSORE** | Almeno 75% catalogo e 75% dei concerti frequentati recensiti; badge ai Top 3 per copertura. |
| **FAN DI VECCHIA DATA** | Prima presenza entro 01/07/2024, almeno 3 presenze, almeno 20% degli ultimi 5 pubblici e almeno 1 degli ultimi 3. |
| **DAGLI ALBORI** | Come sopra, ma prima presenza entro 31/12/2020. Prevale su Fan di vecchia data. |
| **VETERANO** | Fan di vecchia data con almeno il 50% di presenze negli ultimi 5 concerti pubblici. |
| **CHI L'HA VISTO?** | Ha presenze storiche ma manca da almeno un anno rispetto all'ultimo concerto pubblico concluso. |
| **CHI ZE?** | Nessuna presenza live registrata. |
| **STILL ROWING** | Filotto attuale massimo di concerti consecutivi tra tutti i fan, con almeno 3; ex aequo ammessi. |
| **RE DELLE SAGRE** | Top 3 per presenze in venue di tipologia Sagra, minimo 3. |

---

# Punteggi fan - valori iniziali

I valori sono modificabili dal Setup e quindi questa tabella descrive i default della patch.

| Evento | Default |
|---|---:|
| Presenza concerto pubblico | 100 pt |
| Private show | 33% dei punti normali |
| Voto singola canzone al live | 2 pt |
| Voto generale concerto | 10 pt |
| Attività live | fino a 50 pt per concerto |
| Membri per pieno peso attività | 3 |
| Primo voto Molesti da catalogo | 10 pt |
| Primo Gusto Base | 5 pt |
| Primo Gusto Testo | 5 pt |
| Prima Conoscenza Base | 5 pt |
| Prima Conoscenza Testo | 5 pt |

---

# Deploy / aggiornamento

Ordine consigliato:

1. eseguire `patch_v2_4.sql` nel SQL Editor di Supabase;
2. sostituire il codice della Edge Function `fan-api` con `fan-api-index.ts` e ridistribuirla;
3. sostituire `index-v2.html` sulla GitHub Pages;
4. mantenere `favicon.png` e `apple-touch-icon.png` nella stessa directory dell'HTML;
5. fare un hard refresh del browser dopo il deploy.

La patch è incrementale: non sostituisce le patch precedenti.
