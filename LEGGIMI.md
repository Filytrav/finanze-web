# Finanze 1.4 Web

Versione web installabile (PWA) 1.4.2, basata sull'interfaccia Finanze 1.4. Funziona su PC, Android e iPhone/iPad senza App Store e senza abbonamenti. Non richiede un account e non sincronizza i dati online. Su telefono e tablet, la navigazione tra sezioni e nel menu laterale richiamabile sul lato sinistro.

## Dati e trasferimento tra dispositivi

- Ogni browser salva la propria copia locale sul dispositivo. PC, telefono e tablet non si aggiornano tra loro automaticamente.
- Sul PC crea il file con **Impostazioni: Salva una copia dei dati**. Trasferisci il JSON al telefono o tablet, apri Finanze e usa **Impostazioni: Ripristina da una copia**.
- Per riportare le modifiche al PC, crea il backup sul dispositivo aggiornato e ripristinalo sul PC. L'importazione sostituisce i dati locali: passa sempre il backup piu recente e lavora su un dispositivo alla volta.
- I dati locali e il backup JSON non sono cifrati dall'app. Proteggi il dispositivo con il blocco schermo e conserva il backup solo in un posto privato.
- Il file di backup del PC e compatibile; la web app non legge direttamente estratti bancari o buste paga. Inserisci i nuovi estratti nell'app PC, crea un nuovo backup e trasferiscilo.
- I dati web sono separati per browser e indirizzo del sito. Cancellare i dati del browser o aprire lo stesso sito con un URL diverso puo rendere non disponibili i dati locali: conserva copie JSON aggiornate.

## Installazione

La web app pubblicata su un indirizzo **HTTPS** puo essere installata e usata offline dopo il primo caricamento.

- **Android:** apri l'indirizzo in Chrome e scegli **Installa app** oppure **Aggiungi alla schermata Home**.
- **iPhone/iPad:** apri l'indirizzo in Safari, tocca **Condividi**, poi **Aggiungi alla schermata Home**. Non serve App Store.
- Dopo il primo caricamento, l'interfaccia puo aprirsi anche senza rete. Quando e disponibile una nuova versione, il browser scarica l'aggiornamento dal sito.

Per provare sul PC, dalla cartella `V1.4 Web` esegui `python -m http.server 8000` e apri `http://localhost:8000`. Questo indirizzo locale serve solo per la prova sul PC, non per installare l'app sul telefono.

### Pubblicazione con GitHub Pages

Il codice di questa app e pubblicato nel repository pubblico [Filytrav/finanze-web](https://github.com/Filytrav/finanze-web). L'indirizzo del sito e `https://filytrav.github.io/finanze-web/`. Il repository contiene solo il programma: non caricare backup o dati finanziari.

## Contenuto

- `index.html`, `app.js`, `logic.js`, `style.css`: interfaccia e funzioni della versione 1.4.
- `web-api.js`: salvataggio locale nel browser e importazione/esportazione del backup.
- `manifest.webmanifest`, `service-worker.js`: installazione PWA e supporto offline.
- `font-*.woff2`, `icon-192.png`, `icon-512.png`: risorse incluse per funzionare senza servizi esterni.
