# Natom Visite – Guida di configurazione (per Nadav)

Questa guida serve **una volta sola**. Ci vogliono circa 20 minuti per Firebase e 20 minuti per Apple.
Alla fine ci mandi i valori indicati nel riquadro **"Cosa ci devi mandare"**.

---

## PARTE 1 – Creare il database condiviso (Firebase, gratis)

Usa il computer, con il tuo account Google **nadavabramovraffael@gmail.com**.

1. Apri **https://console.firebase.google.com** e accedi con il tuo account Google.
2. Premi **"Crea un progetto"** (o "Aggiungi progetto").
3. Nome del progetto: scrivi **natom-visite** → premi **Continua**.
4. Google Analytics: **disattivalo** (non serve) → premi **Crea progetto**. Aspetta e premi **Continua**.

### Attivare l'accesso con email e password
5. Nel menu a sinistra premi **Build (Crea)** → **Authentication**.
6. Premi **Inizia**.
7. Nella scheda **Metodo di accesso** premi **Email/password**.
8. Attiva il primo interruttore **Email/password** (il secondo, "link email", lascialo spento) → **Salva**.

### Creare il database
9. Nel menu a sinistra premi **Build (Crea)** → **Firestore Database**.
10. Premi **Crea database**.
11. Posizione: scegli **eur3 (Europe)** oppure **europe-west8 (Milano)** → **Avanti**.
12. Scegli **"Avvia in modalità di produzione"** → **Crea**.
    (Le regole di sicurezza le carichiamo noi: solo gli utenti approvati da te potranno vedere i dati.)

### Registrare l'app web e copiare la configurazione
13. Premi l'**ingranaggio ⚙️** in alto a sinistra → **Impostazioni progetto**.
14. In basso, nel riquadro **"Le tue app"**, premi l'icona **`</>`** (Web).
15. Nome app: **Natom Visite**. Metti la spunta su **"Configura anche Firebase Hosting"** → **Registra app**.
16. Appare un riquadro con un testo simile a questo:
    ```
    const firebaseConfig = {
      apiKey: "AIza....",
      authDomain: "natom-visite.firebaseapp.com",
      projectId: "natom-visite",
      storageBucket: "natom-visite.firebasestorage.app",
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abcdef..."
    };
    ```
    **Copia tutto questo blocco e mandacelo** (anche come screenshot va bene). Poi premi **Continua alla console** (salta gli altri passaggi).
    Questi valori non sono segreti: servono solo a dire all'app dove si trova il database.

### Darci il permesso di pubblicare regole e app
17. Sempre in **Impostazioni progetto** apri la scheda **Utenti e autorizzazioni**.
18. Premi **Aggiungi membro**, scrivi l'email che ti indichiamo noi, ruolo **Editor** → **Aggiungi membro**.
    (Così pubblichiamo le regole di sicurezza e l'indirizzo web dell'app. Potrai toglierci quando vuoi.)

> **In alternativa al punto 18** (solo se te lo chiediamo): **Impostazioni progetto → Account di servizio → Genera nuova chiave privata**.
> Si scarica un file `.json`: è riservato, mandalo solo a noi e in privato.

### Cosa facciamo noi dopo
- Pubblichiamo le **regole di sicurezza** (file `firestore.rules`) e l'**app web** su Firebase Hosting
  (indirizzo tipo **https://natom-visite.web.app**).
- Ti mandiamo l'APK Android aggiornato.

---

## PARTE 2 – Primo accesso (tu sei l'amministratore)

1. Apri l'app (Android, o su iPhone l'indirizzo **https://natom-visite.web.app**).
2. Premi **"Crea un nuovo account"**: nome, telefono, email **nadavabramovraffael@gmail.com**, una password.
3. Ti arriva un'email da Firebase ("Verifica la tua email", controlla anche lo **Spam**): **tocca il link**.
4. Torna nell'app e premi **"Ho verificato l'email"**: diventi amministratore.
5. Premi **"Carica database iniziale"** e aspetta 1–2 minuti con buona connessione (13.486 negozi).

### Approvare i venditori
- Ogni venditore scarica l'app e preme **"Crea un nuovo account"**: vede **"Account in attesa di approvazione"**.
- Tu apri **☰ Menu → 👥 Gestione utenti** e premi **Approva** (o **Rifiuta**).
- Da lì puoi anche **Revocare l'accesso** o cambiare il ruolo (**venditore / admin**).

### Legenda dei colori
**☰ Menu → 🎨 Legenda colori**: puoi cambiare il significato dei colori (vale per tutti).
Valori iniziali: verde = Cliente acquisito · azzurro = Interessato / da seguire · giallo = Da richiamare / ripassare ·
rosa = Visitato, titolare assente · rosso = Non interessato.

---

## PARTE 3 – iPhone senza App Store (subito, dal sito)

1. Sull'iPhone apri **Safari** (non Chrome) e vai su **https://natom-visite.web.app**.
2. Premi il pulsante **Condividi** (il quadrato con la freccia in su, in basso).
3. Scorri e premi **"Aggiungi alla schermata Home"** → **Aggiungi**.
4. Sulla Home trovi l'icona **Natom Visite** con il diamante: aprila sempre da lì.
5. Accedi con la tua email e password. Funziona anche senza rete: le modifiche partono quando torna il segnale.

---

## PARTE 4 – App iPhone vera (TestFlight) con il tuo account Apple Developer

Usa il computer. Sito: **https://appstoreconnect.apple.com** e **https://developer.apple.com/account**.

### A. Il tuo Team ID
1. Apri **https://developer.apple.com/account** → sezione **Membership details (Dettagli abbonamento)**.
2. Copia il **Team ID** (10 caratteri, es. `AB12CD34EF`).

### B. Registrare l'identificativo dell'app
3. Su developer.apple.com/account premi **Certificates, IDs & Profiles** → **Identifiers** → il pulsante **+**.
4. Scegli **App IDs** → **Continue** → **App** → **Continue**.
5. Description: **Natom Visite**. Bundle ID: **Explicit** e scrivi **com.natomdiamonds.visite** → **Continue** → **Register**.

### C. Creare l'app in App Store Connect
6. Apri **https://appstoreconnect.apple.com** → **App** → pulsante **+** → **Nuova app**.
7. Compila: Piattaforma **iOS** · Nome **Natom Visite** · Lingua principale **Italiano** ·
   ID pacchetto **com.natomdiamonds.visite** · SKU **natomvisite** · Accesso utenti **Accesso completo** → **Crea**.
8. Apri l'app appena creata → **Informazioni sull'app** (a sinistra) → copia l'**Apple ID** (un numero di 10 cifre).

### D. Chiave API (serve per costruire l'app senza un Mac)
9. In App Store Connect premi **Utenti e accesso** → in alto **Integrazioni** → **App Store Connect API**.
10. Scheda **Chiavi del team** (Team Keys). Se richiesto, premi **Richiedi accesso** e accetta.
11. Premi **Genera chiave API** (o il **+**). Nome: **Natom build** · Accesso: **App Manager** → **Genera**.
12. Copia l'**ID emittente (Issuer ID)** che vedi in alto (formato lungo con trattini).
13. Copia l'**ID chiave (Key ID)** della chiave appena creata (10 caratteri).
14. Premi **Scarica chiave API**: si scarica il file **AuthKey_XXXXXXXXXX.p8**.
    ⚠️ Si può scaricare **una sola volta**: conservalo e mandacelo **in privato** (è una chiave riservata).

### E. Tester (chi può installare l'app)
15. In App Store Connect apri l'app **Natom Visite** → scheda **TestFlight**.
16. A sinistra **Tester interni** → **+** → aggiungi te stesso e i collaboratori (devono essere in **Utenti e accesso**).
    Per persone esterne: **Tester esterni** → **+** → nuovo gruppo → aggiungi le email (la prima volta Apple fa una breve revisione).
17. Ogni tester installa l'app **TestFlight** dall'App Store e accetta l'invito che riceve per email.

---

## Cosa ci devi mandare ✅

| # | Cosa | Dove lo trovi | Riservato? |
|---|------|---------------|-----------|
| 1 | Blocco **firebaseConfig** (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) | Parte 1, punto 16 | No |
| 2 | Conferma di averci aggiunto come **Editor** al progetto Firebase (oppure il file `.json` dell'account di servizio) | Parte 1, punto 18 | Il `.json` sì |
| 3 | **Team ID** Apple | Parte 4, punto 2 | No |
| 4 | **Apple ID** numerico dell'app | Parte 4, punto 8 | No |
| 5 | **Issuer ID** | Parte 4, punto 12 | No |
| 6 | **Key ID** | Parte 4, punto 13 | No |
| 7 | File **AuthKey_XXXXXXXXXX.p8** | Parte 4, punto 14 | **Sì – solo in privato** |

Non mandarci mai la tua password Google o Apple: non serve.

---

## Note utili
- **Gratis**: il piano gratuito Firebase (Spark) basta: 50.000 letture e 20.000 scritture al giorno.
  Il caricamento iniziale usa circa 13.500 scritture **una volta sola**; dopo, ogni "Salva" ne usa 2.
- **Senza rete**: premi comunque **Salva**: appare "Salvato, verrà sincronizzato appena torna la connessione".
- **Excel**: **⬇ Scarica Excel aggiornato** crea il file `Natom_Diamonds_DATABASE_AAAA-MM-GG.xlsx`
  con le stesse colonne di prima + le colonne delle visite + colore (righe colorate), fogli **Riepilogo** e **Legenda**.
- **Colonna `id_app`** (ultima colonna dell'Excel esportato): è il codice interno di ogni negozio.
  Non modificarla: serve all'app per riconoscere i negozi quando si ricarica il file (Menu → Importa Excel).
- **Colori**: il colore vale per tutta la riga (non per singola cella).
