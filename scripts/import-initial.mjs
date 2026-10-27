// Caricamento iniziale del database nel cloud (alternativa al pulsante "Carica database iniziale" nell'app).
// Uso: ADMIN_PASSWORD=... node scripts/import-initial.mjs [--emu]
// Accede come admin (nadavabramovraffael@gmail.com, già registrato e verificato) e carica public/base.json.
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
const emu = process.argv.includes('--emu');
const src = fs.readFileSync('src/firebase-config.js', 'utf8');
const cfg = emu ? { apiKey: 'demo-key', projectId: 'demo-natom' } : Function('return ' + src.match(/firebaseConfig = (\{[\s\S]*?\});/)[1])();
const ADMIN = src.match(/ADMIN_EMAIL = "([^"]+)"/)[1];
const app = initializeApp(cfg); const auth = getAuth(app); const db = getFirestore(app);
if (emu) { connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true }); connectFirestoreEmulator(db, 'localhost', 8080); }
const { user } = await signInWithEmailAndPassword(auth, process.env.ADMIN_EMAIL || ADMIN, process.env.ADMIN_PASSWORD);
const prof = (await getDoc(doc(db, 'users', user.uid))).data();
if (!prof || prof.ruolo !== 'admin' || prof.stato !== 'approvato') throw new Error('Account non admin approvato');
const ds = await getDoc(doc(db, 'config', 'dataset'));
if (ds.exists() && !process.argv.includes('--force')) { console.log('Database già caricato:', ds.data().version); process.exit(0); }
const j = JSON.parse(fs.readFileSync('public/base.json', 'utf8'));
for (let i = 0; i < j.rows.length; i += 400) {
  const b = writeBatch(db);
  j.rows.slice(i, i + 400).forEach((r, k) => {
    const o = { modificato_uid: user.uid }; j.columns.forEach((c, x) => { if (r[x] != null && String(r[x]).trim() !== '') o[c] = r[x]; });
    b.set(doc(db, 'shops', 'r' + String(i + k + 1).padStart(5, '0')), o, { merge: true });
  });
  await b.commit(); process.stdout.write(`\r${Math.min(i + 400, j.rows.length)}/${j.rows.length}`);
}
await setDoc(doc(db, 'config', 'dataset'), { version: j.version, rows: j.rows.length, by: prof.nome, at: serverTimestamp() });
console.log('\nFatto.'); process.exit(0);
