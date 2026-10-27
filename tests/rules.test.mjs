// Test regole di sicurezza contro l'emulatore (node tests/rules.test.mjs)
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, getDocs, collection, serverTimestamp, limit, query } from 'firebase/firestore';
let n = 0, fail = 0;
async function client(email) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-natom' }, 'c' + (n++));
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, 'localhost', 8080);
  const u = (await createUserWithEmailAndPassword(auth, email, 'segreto123')).user;
  return { app, db, u };
}
async function expect(name, p, ok) {
  try { await p; if (ok) console.log('✔', name); else { console.log('✘ (doveva fallire)', name); fail++; } }
  catch (e) { if (!ok) console.log('✔', name, '(negato)'); else { console.log('✘', name, e.code); fail++; } }
}
const t = Date.now();
const a = await client(`mario${t}@test.it`);
await expect('registrazione in_attesa', setDoc(doc(a.db, 'users', a.u.uid), { email: a.u.email, nome: 'Mario', telefono: '1', stato: 'in_attesa', ruolo: 'venditore' }), true);
await expect('auto-approvazione vietata', updateDoc(doc(a.db, 'users', a.u.uid), { stato: 'approvato' }), false);
await expect('auto-promozione admin vietata', updateDoc(doc(a.db, 'users', a.u.uid), { ruolo: 'admin' }), false);
await expect('utente in attesa non legge negozi', getDocs(query(collection(a.db, 'shops'), limit(1))), false);
await expect('utente in attesa non scrive negozi', setDoc(doc(a.db, 'shops', 'x' + t), { ragione_sociale: 'X', modificato_uid: a.u.uid }), false);
const b = await client(`fake${t}@test.it`);
await expect('registrazione direttamente approvato vietata', setDoc(doc(b.db, 'users', b.u.uid), { email: b.u.email, nome: 'F', telefono: '1', stato: 'approvato', ruolo: 'admin' }), false);
const c = await client(`nadavabramovraffael+x${t}@gmail.com`);
await expect('email simile a admin non è admin', setDoc(doc(c.db, 'users', c.u.uid), { email: c.u.email, nome: 'N', telefono: '1', stato: 'approvato', ruolo: 'admin' }), false);
await expect('utente non legge profili altrui', getDoc(doc(a.db, 'users', c.u.uid)), false);
await expect('utente non approva altri', updateDoc(doc(a.db, 'users', c.u.uid), { stato: 'approvato' }), false);
for (const x of [a, b, c]) await deleteApp(x.app);
console.log(fail ? `FALLITI: ${fail}` : 'Tutti i test regole OK');
process.exit(fail ? 1 : 0);
