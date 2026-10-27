// =====================================================================
//  CONFIGURAZIONE FIREBASE  (unico file da modificare)
//  Incollare qui i valori che Nadav copia da:
//  console.firebase.google.com > Impostazioni progetto > Le tue app > Config
// =====================================================================
export const firebaseConfig = {
  "apiKey": "AIzaSyDzYLLMNXFpwa4Zw_xtkAiCRiN3CduouPc",
  "authDomain": "natom-visite.firebaseapp.com",
  "projectId": "natom-visite",
  "storageBucket": "natom-visite.firebasestorage.app",
  "messagingSenderId": "615264717397",
  "appId": "1:615264717397:web:0476172e720948311162dc",
  "measurementId": "G-4ZP4DRCYEZ"
};

// Primo amministratore (può approvare gli altri utenti)
export const ADMIN_EMAIL = "nadavabramovraffael@gmail.com";

// Emulatore locale (solo per test): build con `npm run build:emu` oppure URL con ?emu=1
export const EMULATOR = {
  enabled:
    import.meta.env.VITE_EMULATOR === "1" ||
    (typeof location !== "undefined" && /[?&]emu=1/.test(location.search)),
  host: import.meta.env.VITE_EMULATOR_HOST || "localhost",
  projectId: "demo-natom",
};

export function isConfigured() {
  return EMULATOR.enabled || !String(firebaseConfig.apiKey).startsWith("INSERIRE");
}
