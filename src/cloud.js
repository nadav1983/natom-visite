// Collegamento a Firebase (Auth + Firestore) con cache offline e coda modifiche
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc,
  collection, query, where, onSnapshot, getDocs, writeBatch, serverTimestamp, Timestamp, orderBy, limit } from 'firebase/firestore';
import { firebaseConfig, EMULATOR, ADMIN_EMAIL } from './firebase-config.js';

let app, auth, db;
export function init() {
  const cfg = EMULATOR.enabled ? { apiKey: 'demo-key', projectId: EMULATOR.projectId, authDomain: 'localhost', appId: 'demo' } : firebaseConfig;
  app = initializeApp(cfg);
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let cache;
  try { cache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch { cache = undefined; }
  db = initializeFirestore(app, cache ? { localCache: cache } : {});
  if (EMULATOR.enabled) {
    connectAuthEmulator(auth, `http://${EMULATOR.host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR.host, 8080);
  }
  return { projectId: cfg.projectId };
}
export const isAdminEmail = e => (e || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
export const onAuth = cb => onAuthStateChanged(auth, cb);
export const currentUser = () => auth.currentUser;
export const login = (e, p) => signInWithEmailAndPassword(auth, e.trim(), p);
export const logout = () => signOut(auth);
export const resetPassword = e => sendPasswordResetEmail(auth, e.trim());

export async function signup({ email, password, nome, telefono }) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await setDoc(doc(db, 'users', cred.user.uid), { email: cred.user.email, nome: nome.trim(), telefono: telefono.trim(),
    stato: 'in_attesa', ruolo: 'venditore', createdAt: serverTimestamp() });
  if (isAdminEmail(email)) { try { await sendEmailVerification(cred.user); } catch (e) { console.warn(e); } }
  return cred.user;
}
export const resendVerification = () => sendEmailVerification(auth.currentUser);

// Il primo admin (email verificata) si auto-approva
export async function promoteBootstrapAdmin() {
  const u = auth.currentUser; await u.reload(); await u.getIdToken(true);
  if (!u.emailVerified) return false;
  await setDoc(doc(db, 'users', u.uid), { stato: 'approvato', ruolo: 'admin', approvatoIl: serverTimestamp(), approvatoDa: 'auto (primo admin)' }, { merge: true });
  return true;
}

export const watchProfile = (uid, cb, err) => onSnapshot(doc(db, 'users', uid), s => cb(s.exists() ? { id: s.id, ...s.data() } : null), err);
export const watchUsers = (cb, err) => onSnapshot(collection(db, 'users'), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), err);
export const setUser = (uid, data) => updateDoc(doc(db, 'users', uid), data);
export const watchDataset = (cb, err) => onSnapshot(doc(db, 'config', 'dataset'), s => cb(s.exists() ? s.data() : null, s.metadata.fromCache), err);

// Download completo (solo se il database cloud non coincide con quello incluso nell'app)
export async function fetchAllShops() {
  const s = await getDocs(collection(db, 'shops'));
  return s.docs.map(d => fromDoc(d.id, d.data()));
}
export function fromDoc(id, d) {
  const o = { _id: id };
  for (const [k, v] of Object.entries(d)) {
    if (k === 'updatedAt') o._u = v && v.toMillis ? v.toMillis() : 0;
    else if (k !== 'modificato_uid') o[k] = v;
  }
  return o;
}
// Ascolta in tempo reale solo i negozi modificati dopo `sinceMs`
export function watchChanges(sinceMs, cb, err) {
  const q = query(collection(db, 'shops'), where('updatedAt', '>', Timestamp.fromMillis(Math.max(0, sinceMs))));
  return onSnapshot(q, { includeMetadataChanges: false }, s => {
    const out = [];
    s.docChanges().forEach(c => { if (c.type !== 'removed') out.push(fromDoc(c.doc.id, c.doc.data({ serverTimestamps: 'estimate' }))); });
    cb(out);
  }, err);
}
export const newShopId = () => doc(collection(db, 'shops')).id;

// Salva i campi cambiati + storico. La promessa si risolve quando il server conferma (offline resta in coda).
export function saveShop(id, changes, prev, user) {
  const b = writeBatch(db);
  const data = { ...changes, modificato_uid: user.uid, updatedAt: serverTimestamp() };
  b.set(doc(db, 'shops', id), data, { merge: true });
  const diff = {};
  for (const k of Object.keys(changes)) if (!['ultima_modifica', 'modificato_da'].includes(k)) diff[k] = { da: prev?.[k] ?? null, a: changes[k] ?? null };
  b.set(doc(collection(db, 'shops', id, 'history')), { uid: user.uid, nome: user.nome, at: serverTimestamp(), quando: changes.ultima_modifica, nuovo: !prev, modifiche: diff });
  return b.commit();
}
// Storico di un negozio a partire da `sinceMs` (indice automatico su "at", nessuna regola nuova)
export async function getHistorySince(id, sinceMs) {
  const s = await getDocs(query(collection(db, 'shops', id, 'history'), where('at', '>=', Timestamp.fromMillis(sinceMs)), orderBy('at', 'desc'), limit(30)));
  return s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { ...x, atMs: x.at && x.at.toMillis ? x.at.toMillis() : Date.now() }; });
}
export async function getHistory(id) {
  const s = await getDocs(query(collection(db, 'shops', id, 'history'), orderBy('at', 'desc'), limit(50)));
  return s.docs.map(d => d.data());
}

// Caricamento massivo (solo admin). rows = [{_id, ...campi}], withTimestamp = true per far arrivare le modifiche agli altri
export async function bulkWrite(rows, uid, withTimestamp, onProgress) {
  const N = 400;
  for (let i = 0; i < rows.length; i += N) {
    const b = writeBatch(db);
    for (const r of rows.slice(i, i + N)) {
      const { _id, _u, ...f } = r;
      const data = { ...f, modificato_uid: uid };
      if (withTimestamp) data.updatedAt = serverTimestamp();
      b.set(doc(db, 'shops', _id), data, { merge: true });
    }
    await b.commit();
    onProgress && onProgress(Math.min(rows.length, i + N), rows.length);
  }
}
export const setDataset = data => setDoc(doc(db, 'config', 'dataset'), { ...data, at: serverTimestamp() });
export const watchConfig = (id, cb, err) => onSnapshot(doc(db, 'config', id), s => cb(s.exists() ? s.data() : null), err);
export const setConfig = (id, data) => setDoc(doc(db, 'config', id), data, { merge: true });

// Eliminazione account (richiesta Apple 5.1.1(v)): conferma password, cancella il profilo
// (o, se le regole non lo permettono, lo anonimizza) e poi l'utente Firebase Auth.
export async function deleteMyAccount(password) {
  const u = auth.currentUser; if (!u) throw new Error('Non sei collegato');
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  const ref = doc(db, 'users', u.uid);
  try { await deleteDoc(ref); }
  catch (e) { try { await updateDoc(ref, { nome: '(account eliminato)', telefono: '' }); } catch (e2) { console.warn('profilo', e2.code); } }
  await deleteUser(u);
}
