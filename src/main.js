import './style.css';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isConfigured, EMULATOR } from './firebase-config.js';
import * as C from './cloud.js';
import * as L from './idb.js';
import { ORIG_COLS, VISIT_COLS, EDIT_COLS, LABELS, ESITI, STATI_DEFAULT, CATEGORIE_DEFAULT, COLORI, coloreById, LEGENDA_DEFAULT } from './schema.js';
import { parseWorkbook, buildWorkbook, workbookBase64, workbookArray, today, nowStamp } from './excel.js';

const BASE_VERSION = 'base-2026-10-23';
const SITE = 'https://nadav1983.github.io/natom-visite/';
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = v => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const empty = v => v === null || v === undefined || String(v).trim() === '';

const S = { user: null, profile: null, rows: new Map(), dataset: undefined, pending: 0, online: navigator.onLine, page: 50,
  filters: JSON.parse(localStorage.getItem('nv_filters') || '{}'), unsubs: [], changeUnsub: null, users: [], draft: null, booted: false, legenda: { ...LEGENDA_DEFAULT } };
const leg = id => S.legenda[id] || LEGENDA_DEFAULT[id] || '';

function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); }
function setTitle(t, back) { $('#title').innerHTML = esc(t) + syncDot(); $('#btnBack').classList.toggle('hidden', !back); $('#btnTools').classList.toggle('hidden', !S.profile || S.profile.stato !== 'approvato'); }
function syncDot() {
  if (!S.profile || S.profile.stato !== 'approvato') return '';
  if (!S.online) return ' <span class="sync off">● offline</span>';
  if (S.pending > 0) return ` <span class="sync wait">● invio ${S.pending}…</span>`;
  return ' <span class="sync ok">●</span>';
}
function refreshTitle() { const t = $('#title'); t.innerHTML = t.innerHTML.replace(/ <span class="sync[\s\S]*$/, '') + syncDot(); }
window.addEventListener('online', () => { S.online = true; refreshTitle(); });
window.addEventListener('offline', () => { S.online = false; refreshTitle(); });
$('#btnBack').onclick = () => (history.length > 1 ? history.back() : go('#/'));
$('#btnTools').onclick = () => go('#/menu');
const go = h => { if (location.hash === h) route(); else location.hash = h; };
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (S.edit && !h.startsWith('#/shop/' + S.edit.id)) {
    if (editDirty()) { history.pushState(null, '', '#/shop/' + S.edit.id); askLeave(h); return; }
    S.edit = null; S.draft = null;
  }
  route();
});

// ---------------- Avvio ----------------
let projectId = 'x';
if (!isConfigured()) {
  setTitle('Natom Visite');
  app.innerHTML = `<div class="card"><h2>App in configurazione</h2><p>Il database condiviso (Firebase) non è ancora stato collegato.</p>
  <p class="muted">Segui la guida "Guida_Firebase_Natom_Visite" e invia i valori della configurazione: poi riceverai l'app aggiornata.</p></div>`;
} else {
  projectId = C.init().projectId;
  L.setDbName('natom-visite-' + projectId);
  C.onAuth(onUser);
  // Solo build di test CI (simulatore): login automatico con account demo. Mai impostato nelle build pubblicate.
  if (import.meta.env.VITE_TEST_EMAIL) setTimeout(() => { if (!S.user) C.login(import.meta.env.VITE_TEST_EMAIL, import.meta.env.VITE_TEST_PASSWORD).catch(e => toast('TEST login: ' + (e.code || e.message), 8000)); }, 25000);
}

function clearSubs() { S.unsubs.forEach(u => { try { u(); } catch {} }); S.unsubs = []; if (S.changeUnsub) { S.changeUnsub(); S.changeUnsub = null; } }

function onUser(u) {
  clearSubs(); S.user = u; S.profile = null; S.booted = false;
  if (!u) return route();
  app.innerHTML = '<div class="loading">Controllo account…</div>';
  S.unsubs.push(C.watchProfile(u.uid, async p => {
    const wasApproved = S.profile && S.profile.stato === 'approvato';
    S.profile = p;
    if (p && p.stato !== 'approvato' && C.isAdminEmail(u.email) && u.emailVerified) { try { await C.promoteBootstrapAdmin(); } catch (e) { console.warn(e); } }
    if (p && p.stato === 'approvato') { if (!S.booted) bootData(); }
    else if (wasApproved || (p && ['revocato', 'rifiutato'].includes(p.stato))) { S.rows.clear(); S.booted = false; if (S.changeUnsub) S.changeUnsub(); L.clearAll().catch(() => {}); }
    route();
  }, e => { console.error(e); app.innerHTML = `<div class="card">Errore: ${esc(e.message)}</div>`; }));
}

async function loadBase() {
  let res = null; try { res = await fetch('./base.json'); } catch (e) {}
  if (!res || !res.ok) { const e = new Error('Il database iniziale non è incluso nella versione web: caricalo dall\'app Android'); e.code = 'no-base'; throw e; }
  const j = await res.json();
  return j.rows.map((r, i) => { const o = { _id: 'r' + String(i + 1).padStart(5, '0') }; j.columns.forEach((c, k) => { if (!empty(r[k])) o[c] = r[k]; }); return o; });
}

async function bootData() {
  S.booted = true;
  try { const local = await L.getAllRows(); S.rows = new Map(local.map(r => [r._id, r])); } catch (e) { console.warn(e); }
  if (S.rows.size) route();
  S.unsubs.push(C.watchConfig('legenda', d => { S.legenda = { ...LEGENDA_DEFAULT, ...(d || {}) }; }, e => console.warn('legenda', e)));
  S.unsubs.push(C.watchDataset(async (ds, fromCache) => {
    S.dataset = ds;
    if (!ds) { if (!fromCache) { S.rows.clear(); await L.clearAll(); } route(); return; }
    let meta = (await L.getMeta('state')) || {};
    if (meta.version !== ds.version) {
      app.innerHTML = '<div class="loading">Scarico il database condiviso…</div>';
      try {
        let rows, fromBase = ds.version === BASE_VERSION;
        if (fromBase) { try { rows = await loadBase(); } catch (e) { if (e.code !== 'no-base') throw e; fromBase = false; } }
        if (!fromBase) rows = await C.fetchAllShops();
        await L.clearRows(); await L.putRows(rows);
        meta = { version: ds.version, lastSync: fromBase ? 0 : rows.reduce((m, r) => Math.max(m, r._u || 0), 0) };
        await L.setMeta('state', meta);
        S.rows = new Map(rows.map(r => [r._id, r]));
      } catch (e) { console.error(e); toast('Errore download: ' + e.message, 5000); }
    }
    startChanges(meta.lastSync || 0);
    route();
  }, e => console.warn('dataset', e)));
}

let rerenderT;
function startChanges(since) {
  if (S.changeUnsub) S.changeUnsub();
  S.changeUnsub = C.watchChanges(since - 5 * 60 * 1000, async docs => {
    if (!docs.length) return;
    let max = 0; const touched = [];
    for (const d of docs) { const prev = S.rows.get(d._id); const r = { ...d }; if (prev && prev._local && (prev._localAt || 0) > (d._u || 0)) continue; S.rows.set(d._id, r); touched.push(r); max = Math.max(max, d._u || 0); }
    if (touched.length) await L.putRows(touched);
    const meta = (await L.getMeta('state')) || {};
    if (max > (meta.lastSync || 0)) { meta.lastSync = max; await L.setMeta('state', meta); }
    clearTimeout(rerenderT);
    rerenderT = setTimeout(() => {
      const h = location.hash;
      if (h.startsWith('#/shop/')) { const id = decodeURIComponent(h.slice(7)); if (touched.some(t => t._id === id) && !editDirty()) route(); }
      else if (h === '' || h === '#/' || h === '#/menu') route();
    }, 400);
  }, e => console.warn('changes', e));
}

// ---------------- Router ----------------
function route() {
  if (!isConfigured()) return;
  const h = location.hash || '#/';
  if (!S.user) return h === '#/signup' ? viewSignup() : viewLogin();
  if (h === '#/elimina') return viewDeleteAccount();
  if (!S.profile) return viewNoProfile();
  if (S.profile.stato !== 'approvato') return viewPending();
  if (S.dataset === undefined && !S.rows.size) { setTitle('Natom Visite'); app.innerHTML = '<div class="loading">Sincronizzazione…</div>'; return; }
  if (S.dataset === null && !S.rows.size && !h.startsWith('#/menu') && !h.startsWith('#/admin')) return viewNoData();
  if (h.startsWith('#/shop/')) return viewDetail(decodeURIComponent(h.slice(7)));
  if (h === '#/new') return viewNew();
  if (h === '#/menu') return viewMenu();
  if (h === '#/admin') return viewAdmin();
  if (h === '#/legenda') return viewLegenda();
  if (h.startsWith('#/history/')) return viewHistory(decodeURIComponent(h.slice(10)));
  return viewList();
}

// ---------------- Accesso ----------------
function viewLogin() {
  setTitle('Natom Visite');
  app.innerHTML = `<div class="brand"><div class="logo">◆</div><div><b>Natom Diamonds</b><br><span class="muted">Visite ai negozi</span></div></div>
  <form class="card" id="f"><h2>Accedi</h2>
  <label>Email</label><input name="email" type="email" autocomplete="email" required>
  <label>Password</label><input name="password" type="password" autocomplete="current-password" required>
  <button class="btn gold" type="submit">Accedi</button>
  <button class="btn light" type="button" id="toSignup">Crea un nuovo account</button>
  <button class="link" type="button" id="forgot">Password dimenticata?</button></form>
  <p class="muted center"><a href="#" id="privacy">Privacy</a> · <a href="#" id="support">Assistenza</a></p>
  ${EMULATOR.enabled ? '<p class="muted center">Modalità test (emulatore)</p>' : ''}`;
  $('#privacy').onclick = e => { e.preventDefault(); openExt(SITE + 'privacy.html'); };
  $('#support').onclick = e => { e.preventDefault(); openExt(SITE + 'support.html'); };
  $('#toSignup').onclick = () => go('#/signup');
  $('#forgot').onclick = async () => { const e = $('#f').email.value; if (!e) return toast('Scrivi prima la tua email'); try { await C.resetPassword(e); toast('Ti abbiamo mandato un\'email per la nuova password'); } catch (er) { toast(errIt(er)); } };
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = ev.target; busy(f, true); try { await C.login(f.email.value, f.password.value); } catch (er) { toast(errIt(er), 4000); busy(f, false); } };
}
function viewSignup() {
  setTitle('Nuovo account', true);
  app.innerHTML = `<form class="card" id="f"><h2>Richiedi l'accesso</h2>
  <p class="muted">Dopo la registrazione l'amministratore deve approvare il tuo account.</p>
  <label>Nome e cognome</label><input name="nome" required autocomplete="name">
  <label>Telefono</label><input name="telefono" type="tel" required autocomplete="tel" placeholder="+39 ...">
  <label>Email</label><input name="email" type="email" required autocomplete="email">
  <label>Password (almeno 6 caratteri)</label><input name="password" type="password" minlength="6" required autocomplete="new-password">
  <button class="btn gold" type="submit">Registrati</button>
  <button class="btn light" type="button" id="toLogin">Ho già un account</button></form>`;
  $('#toLogin').onclick = () => go('#/');
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = ev.target; busy(f, true);
    try { await C.signup({ email: f.email.value, password: f.password.value, nome: f.nome.value, telefono: f.telefono.value }); location.hash = '#/'; }
    catch (er) { toast(errIt(er), 4000); busy(f, false); } };
}
function viewNoProfile() {
  setTitle('Natom Visite');
  app.innerHTML = `<div class="card"><h2>Profilo non trovato</h2><p>Completa i tuoi dati per richiedere l'accesso.</p>
  <form id="f"><label>Nome e cognome</label><input name="nome" required><label>Telefono</label><input name="telefono" type="tel" required>
  <button class="btn gold">Invia richiesta</button></form><button class="btn light" id="out">Esci</button></div>`;
  $('#out').onclick = () => C.logout();
  $('#f').onsubmit = async ev => { ev.preventDefault(); const { setDoc, doc } = await import('firebase/firestore'); toast('Invio…');
    try { const { getFirestore, serverTimestamp } = await import('firebase/firestore'); await setDoc(doc(getFirestore(), 'users', S.user.uid), { email: S.user.email, nome: ev.target.nome.value.trim(), telefono: ev.target.telefono.value.trim(), stato: 'in_attesa', ruolo: 'venditore', createdAt: serverTimestamp() }); }
    catch (er) { toast(errIt(er)); } };
}
function viewPending() {
  setTitle('Natom Visite');
  const p = S.profile; const adm = C.isAdminEmail(S.user.email);
  const msg = { in_attesa: ['⏳', 'Account in attesa di approvazione', 'La tua richiesta è stata inviata. Appena l\'amministratore la approva, l\'app si apre da sola.'],
    rifiutato: ['✕', 'Richiesta non approvata', 'L\'amministratore non ha approvato questo account. Contatta Natom Diamonds.'],
    revocato: ['✕', 'Accesso sospeso', 'L\'accesso di questo account è stato revocato dall\'amministratore.'] }[p.stato] || ['⏳', 'In attesa', ''];
  app.innerHTML = `<div class="card center"><div class="big">${msg[0]}</div><h2>${msg[1]}</h2><p>${msg[2]}</p>
  <p class="muted">${esc(p.nome)} · ${esc(p.email)}</p>
  ${adm ? `<div class="note">Sei l'amministratore: apri l'email di verifica che ti abbiamo mandato e tocca il link, poi premi qui sotto.</div>
  <button class="btn green" id="verified">Ho verificato l'email</button><button class="btn light" id="resend">Rimanda email di verifica</button>` : ''}
  <button class="btn light" id="out">Esci</button><button class="link" id="delAcc">Elimina il mio account</button></div>`;
  $('#out').onclick = () => C.logout();
  $('#delAcc').onclick = () => go('#/elimina');
  if (adm) {
    $('#verified').onclick = async () => { try { (await C.promoteBootstrapAdmin()) ? toast('Account amministratore attivato') : toast('Email non ancora verificata'); } catch (e) { toast(errIt(e)); } };
    $('#resend').onclick = async () => { try { await C.resendVerification(); toast('Email inviata'); } catch (e) { toast(errIt(e)); } };
  }
}
function viewNoData() {
  setTitle('Natom Visite');
  const adm = S.profile.ruolo === 'admin';
  app.innerHTML = `<div class="card"><h2>Database non ancora caricato</h2>
  ${adm ? `<p>Carica il database Natom Diamonds (13.486 negozi) nel cloud: poi tutti i venditori approvati lo vedranno.</p>
  <button class="btn gold" id="loadBase">Carica database iniziale</button><button class="btn light" id="imp">Oppure importa un altro Excel</button><div id="prog" class="muted"></div>`
  : '<p>L\'amministratore non ha ancora caricato il database. Riprova più tardi.</p>'}</div>`;
  if (adm) { $('#loadBase').onclick = () => uploadBase(); $('#imp').onclick = () => pickExcel(); }
}
function busy(f, b) { f.querySelectorAll('button,input').forEach(x => (x.disabled = b)); }
function errIt(e) {
  const c = e.code || '';
  return ({ 'auth/invalid-credential': 'Email o password sbagliata', 'auth/wrong-password': 'Password sbagliata', 'auth/user-not-found': 'Account non trovato',
    'auth/email-already-in-use': 'Esiste già un account con questa email: usa "Accedi"', 'auth/weak-password': 'Password troppo corta (almeno 6 caratteri)',
    'auth/invalid-email': 'Email non valida', 'auth/network-request-failed': 'Nessuna connessione internet', 'permission-denied': 'Permesso negato',
    'auth/too-many-requests': 'Troppi tentativi, riprova tra qualche minuto' })[c] || e.message;
}

// ---------------- Elenco ----------------
function searchKey(r) { if (!r._s) r._s = norm([r.ragione_sociale, r.indirizzo, r.citta, r.referente, r.telefono].join(' ')); return r._s; }
function options(col, defaults = []) { const m = new Map(); for (const r of S.rows.values()) if (!empty(r[col])) m.set(r[col], (m.get(r[col]) || 0) + 1); defaults.forEach(d => m.has(d) || m.set(d, 0)); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); }
const CAT_LABELS = { gioielleria: 'Gioielleria', compro_oro: 'Compro oro', laboratorio_orafo: 'Laboratorio orafo', fabbrica_orafo: 'Fabbrica oreficeria',
  fabbrica_orafo_valenza: 'Fabbrica oreficeria (Valenza)', gioielleria_valenza: 'Gioielleria (Valenza)', monte_pegni: 'Monte dei pegni', casa_asta_gioielli: "Casa d'aste gioielli" };
const catKey = v => String(v || '').toLowerCase().trim();
const catLabel = v => CAT_LABELS[catKey(v)] || String(v || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const cityKey = v => norm(v).replace(/^(a|r|in)\s+/, '');
function cityOptions() { const m = new Map(); for (const r of S.rows.values()) { if (empty(r.citta)) continue; const k = cityKey(r.citta); const e = m.get(k); if (e) e.n++; else m.set(k, { label: String(r.citta).replace(/^(A|R|In)\s+/i, '').trim(), n: 1 }); } return [...m.values()].sort((a, b) => b.n - a.n); }
function filtered() {
  const f = S.filters, q = norm(f.q), city = cityKey(f.citta), t = today();
  const qs = q ? q.split(' ') : [];
  const out = [];
  for (const r of S.rows.values()) {
    if (city) { const c = cityKey(r.citta); if (c !== city && !(' ' + c + ' ').includes(' ' + city + ' ')) continue; }
    if (f.provincia && r.provincia !== f.provincia) continue;
    if (f.regione && r.regione !== f.regione) continue;
    if (f.categoria && (f.categoria === '(vuota)' ? !empty(r.categoria) : catKey(r.categoria) !== f.categoria)) continue;
    if (f.stato && r.stato !== f.stato) continue;
    if (f.esito && (f.esito === '(nessuno)' ? !empty(r.esito) : r.esito !== f.esito)) continue;
    if (f.colore && (f.colore === '(nessuno)' ? !empty(r.colore) : r.colore !== f.colore)) continue;
    if (f.wa === 'si' && !(r.whatsapp || r.whatsapp_link)) continue;
    if (f.wa === 'no' && (r.whatsapp || r.whatsapp_link)) continue;
    if (f.em === 'si' && !r.email) continue;
    if (f.em === 'no' && r.email) continue;
    if (f.vis === 'si' && r.visitato !== 'sì') continue;
    if (f.vis === 'no' && r.visitato === 'sì') continue;
    if (f.vis === 'oggi' && !(r.ultima_modifica || '').startsWith(t)) continue;
    if (f.vis === 'ric' && !(r.data_ricontatto && r.data_ricontatto <= t)) continue;
    if (qs.length) { const k = searchKey(r); if (!qs.every(w => k.includes(w))) continue; }
    out.push(r);
  }
  out.sort((a, b) => String(a.ragione_sociale || '').localeCompare(String(b.ragione_sociale || ''), 'it'));
  return out;
}
function countOpts(col, keyf = v => v) { const m = new Map(); for (const r of S.rows.values()) { if (empty(r[col])) continue; const k = keyf(r[col]); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); }
function viewList() {
  setTitle('Cerca negozi');
  const f = S.filters;
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
  const sel = (name, label, pairs, all = 'Tutte') => `<div><label>${label}</label><select data-f="${name}">${opt('', all, f[name] || '')}${pairs.map(([v, l]) => opt(v, l, f[name])).join('')}</select></div>`;
  const nf = ['citta', 'provincia', 'regione', 'categoria', 'stato', 'esito', 'colore', 'wa', 'em', 'vis'].filter(k => f[k]).length;
  const cats = countOpts('categoria', catKey).map(([k, n]) => [k, `${catLabel(k)} (${n})`]).concat([['(vuota)', 'Senza categoria']]);
  const provs = countOpts('provincia').sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => [k, `${k} (${n})`]);
  const regs = countOpts('regione').map(([k, n]) => [k, `${k} (${n})`]);
  const esiti = [...new Set([...ESITI, ...countOpts('esito').map(x => x[0])])].map(e => [e, e]).concat([['(nessuno)', 'Nessun esito']]);
  const sino = [['si', 'Sì'], ['no', 'No']];
  app.innerHTML = `<input id="q" type="search" placeholder="🔍 Cerca nome, indirizzo, referente…" value="${esc(f.q || '')}">
  <details class="filters card" ${S.filtersClosed ? '' : 'open'} id="fbox"><summary>Filtri ${nf ? `<span class="pill">${nf}</span>` : ''}</summary>
   <label>Città / paese</label><input data-f="citta" list="dlCitta" value="${esc(f.citta || '')}" placeholder="Scrivi, es. Savona" autocomplete="off"><datalist id="dlCitta">${cityOptions().slice(0, 600).map(c => `<option value="${esc(c.label)}">${c.n} negozi</option>`).join('')}</datalist>
   <div class="row2">${sel('provincia', 'Provincia', provs)}${sel('regione', 'Regione', regs)}</div>
   ${sel('categoria', 'Categoria', cats)}
   <div class="row2">${sel('wa', 'Ha WhatsApp', sino, 'Tutti')}${sel('em', 'Ha email', sino, 'Tutti')}</div>
   <div class="row2">${sel('vis', 'Visita', [['no', 'Non visitati'], ['si', 'Visitati'], ['oggi', 'Modificati oggi'], ['ric', 'Da ricontattare']], 'Tutti')}${sel('esito', 'Esito', esiti, 'Tutti')}</div>
   <label>Colore</label><div class="chips" id="colChips"><button type="button" data-cc="" class="chip ${!f.colore ? 'on' : ''}">Tutti</button>${COLORI.map(c => `<button type="button" data-cc="${c.id}" class="chip ${f.colore === c.id ? 'on' : ''}"><span class="cdot sm" style="background:${c.dot}"></span> ${esc(leg(c.id))}</button>`).join('')}<button type="button" data-cc="(nessuno)" class="chip ${f.colore === '(nessuno)' ? 'on' : ''}">Senza colore</button></div>
   ${sel('stato', 'Stato', countOpts('stato').map(([k, n]) => [k, `${k} (${n})`]), 'Tutti')}
   <button class="btn light" id="reset">Azzera filtri</button></details>
  <div class="resbar"><div class="count" id="count"></div><button class="btn small gold" id="dl">⬇ Scarica Excel aggiornato</button></div>
  <div id="list"></div>
  <button class="fab" id="add">+ Nuovo negozio</button>`;
  $('#fbox').ontoggle = e => { S.filtersClosed = !e.target.open; };
  $('#dl').onclick = () => doExport(false);
  $('#colChips').onclick = e => { const b = e.target.closest('[data-cc]'); if (!b) return; S.filters.colore = b.dataset.cc; $('#colChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); save(); };
  const draw = () => {
    if (!$('#count') || !$('#list')) return;
    const rows = filtered();
    $('#count').innerHTML = `<b>${rows.length.toLocaleString('it-IT')}</b> negozi trovati${S.rows.size !== rows.length ? ' su ' + S.rows.size.toLocaleString('it-IT') : ''}`;
    $('#list').innerHTML = rows.slice(0, S.page).map(r => { const col = coloreById(r.colore); return `<div class="item ${r.visitato === 'sì' ? 'vis' : ''}" data-id="${esc(r._id)}" ${col ? `style="border-left-color:${col.dot};background:#${col.hex}"` : ''}>
      <button class="pal" data-pal="1" aria-label="Colore">${col ? `<span class="dot" style="background:${col.dot}"></span>` : '🎨'}</button>
      <div class="n">${esc(r.ragione_sociale || '(senza nome)')}</div>
      <div class="m">📍 ${esc([r.indirizzo, r.citta, r.provincia && '(' + r.provincia + ')'].filter(Boolean).join(', ') || 'indirizzo mancante')}</div>
      ${r.telefono || r.whatsapp ? `<div class="m">${r.telefono ? '📞 ' + esc(r.telefono) : ''}${r.whatsapp ? ' &nbsp;💬 ' + esc(r.whatsapp) : ''}</div>` : ''}
      <div>${r.categoria ? `<span class="badge cat">${esc(catLabel(r.categoria))}</span>` : ''}${col ? `<span class="badge" style="background:${col.dot};color:#111">${esc(leg(col.id))}</span>` : ''}${r.visitato === 'sì' ? `<span class="badge ok">✓ visitato ${esc(r.data_visita || '')}</span>` : ''}${r.esito ? `<span class="badge">${esc(r.esito)}</span>` : ''}</div></div>`; }).join('')
      + (rows.length > S.page ? `<button class="btn light" id="more">Mostra altri (${rows.length - S.page})</button>` : '');
    const m = $('#more'); if (m) m.onclick = () => { S.page += 100; draw(); };
  };
  let t; const save = () => { localStorage.setItem('nv_filters', JSON.stringify(S.filters)); S.page = 50; clearTimeout(t); t = setTimeout(draw, 180); };
  $('#q').oninput = e => { S.filters.q = e.target.value; save(); };
  app.querySelectorAll('[data-f]').forEach(el => { el.oninput = el.onchange = () => { S.filters[el.dataset.f] = el.value; save(); }; });
  $('#reset').onclick = () => { S.filters = {}; localStorage.removeItem('nv_filters'); viewList(); };
  let lp = null, lpFired = false;
  $('#list').onclick = e => { const it = e.target.closest('.item'); if (!it) return; if (lpFired) { lpFired = false; return; }
    if (e.target.closest('[data-pal]')) return colorSheet(it.dataset.id, draw); go('#/shop/' + encodeURIComponent(it.dataset.id)); };
  $('#list').addEventListener('touchstart', e => { const it = e.target.closest('.item'); if (!it) return; lpFired = false; lp = setTimeout(() => { lpFired = true; navigator.vibrate && navigator.vibrate(30); colorSheet(it.dataset.id, draw); }, 550); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(ev => $('#list').addEventListener(ev, () => clearTimeout(lp), { passive: true }));
  $('#list').oncontextmenu = e => { if (e.target.closest('.item')) e.preventDefault(); };
  $('#add').onclick = () => go('#/new');
  draw();
}

// ---------------- Colori ----------------
function dotsHtml(cur) {
  return `<div class="cpicks">${COLORI.map(c => `<button type="button" class="cpick ${cur === c.id ? 'on' : ''}" data-col="${c.id}"><span class="cdot" style="background:${c.dot}">${cur === c.id ? '✓' : ''}</span><span class="cl"><b>${c.nome}</b><br>${esc(leg(c.id))}</span></button>`).join('')}
  <button type="button" class="cpick ${!cur ? 'on' : ''}" data-col=""><span class="cdot none">✕</span><span class="cl"><b>Nessun colore</b></span></button></div>`;
}
function colorSheet(id, after) {
  const r = S.rows.get(id); if (!r) return;
  const el = document.createElement('div'); el.className = 'sheet-bg';
  el.innerHTML = `<div class="sheet"><b>${esc(r.ragione_sociale || '')}</b><div class="muted">Scegli un colore</div>${dotsHtml(r.colore)}<button class="btn light" data-close>Chiudi</button></div>`;
  document.body.appendChild(el);
  el.onclick = e => { const d = e.target.closest('[data-col]'); if (d) { commit(id, { colore: d.dataset.col }); el.remove(); after && after(); return; } if (e.target === el || e.target.closest('[data-close]')) el.remove(); };
}

// ---------------- Scheda negozio ----------------
function phoneOf(v) { const m = String(v || '').match(/\+?\d[\d\s\/.\-]{4,}\d/); return m ? m[0].replace(/[^\d+]/g, '') : ''; }
function waOf(r) { if (r.whatsapp_link) return r.whatsapp_link; let d = phoneOf(r.whatsapp).replace(/\D/g, ''); if (!d) return ''; if (!d.startsWith('39') && d.length <= 10) d = '39' + d; return 'https://wa.me/' + d; }
function mapOf(r) { const q = [r.indirizzo || r.ragione_sociale, r.citta, r.provincia].filter(Boolean).join(', '); return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : ''; }
function openExt(url) { if (!url) return; if (Capacitor.isNativePlatform() || /^(tel|mailto):/.test(url)) location.href = url; else window.open(url, '_blank', 'noopener'); }

function fieldHtml(c, r) {
  const v = r[c] ?? ''; const L = LABELS[c] || c;
  if (c === 'visitato') return `<label>${L}</label><div class="seg" data-seg="visitato"><button type="button" data-v="sì" class="${v === 'sì' ? 'on' : ''}">Sì</button><button type="button" data-v="no" class="${v === 'no' ? 'on no' : ''}">No</button></div>`;
  if (c === 'esito') return `<label>${L}</label><select data-c="esito"><option value=""></option>${[...new Set([...ESITI, ...(v ? [v] : [])])].map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (['data_visita', 'data_ricontatto', 'data_raccolta'].includes(c)) return `<label>${L}</label><input type="date" data-c="${c}" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')}">`;
  if (c === 'note_visita') return `<label>${L}</label><textarea data-c="${c}" placeholder="Cosa vi siete detti, cosa cercano, prezzi, ecc.">${esc(v)}</textarea>`;
  const type = { telefono: 'tel', whatsapp: 'tel', email: 'email', sito: 'url', whatsapp_link: 'url' }[c] || 'text';
  const dl = { categoria: 'dlCat', stato: 'dlStato', provincia: 'dlProv', regione: 'dlReg', citta: 'dlCitta2' }[c];
  return `<label>${L}</label><input type="${type}" data-c="${c}" value="${esc(v)}" ${dl ? `list="${dl}"` : ''} ${c === 'provincia' ? 'maxlength="4" style="text-transform:uppercase"' : ''}>`;
}
function datalists() {
  const dl = (id, vals) => `<datalist id="${id}">${vals.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  return dl('dlCat', options('categoria', CATEGORIE_DEFAULT)) + dl('dlStato', options('stato', STATI_DEFAULT)) + dl('dlProv', options('provincia').sort()) + dl('dlReg', options('regione')) + dl('dlCitta2', options('citta').slice(0, 300));
}
function viewNew() {
  const id = C.newShopId();
  S.draft = { _id: id, _new: true, fonte: 'visita', data_raccolta: today(), stato: 'nuovo', citta: S.filters.citta || '', provincia: S.filters.provincia || '', categoria: S.filters.categoria && S.filters.categoria !== '(vuota)' ? S.filters.categoria : 'gioielleria' };
  S.edit = { id, ch: {} };
  history.replaceState(null, '', '#/shop/' + id);
  viewDetail(id);
}
// ---- Bozza locale: niente salvataggio automatico, solo con il pulsante "Salva" ----
const editDirty = () => !!(S.edit && Object.keys(S.edit.ch).length);
const eqv = (a, b) => (empty(a) ? null : String(a)) === (empty(b) ? null : String(b));
function baseRow(id) { return S.rows.get(id) || (S.draft && S.draft._id === id ? S.draft : null); }
function setDraft(id, changes) {
  const base = baseRow(id); if (!S.edit || S.edit.id !== id) S.edit = { id, ch: {} };
  for (const [k, v] of Object.entries(changes)) { if (eqv(v, base[k])) delete S.edit.ch[k]; else S.edit.ch[k] = empty(v) ? null : String(v); }
  updateSaveBar();
}
function updateSaveBar() {
  const b = $('#save'); if (!b) return; const n = S.edit ? Object.keys(S.edit.ch).length : 0;
  b.textContent = n ? `💾 Salva (${n} modific${n > 1 ? 'he' : 'a'})` : '💾 Salva';
  b.classList.toggle('dirty', n > 0);
  if (n) { const s = $('#saved'); if (s) { s.textContent = 'Modifiche non ancora salvate'; s.className = 'saved warn'; } }
}
function rerenderDetail(id) { const y = window.scrollY; viewDetail(id); window.scrollTo(0, y); }
function viewDetail(id) {
  const base = baseRow(id);
  if (!base) { setTitle('Negozio', true); app.innerHTML = '<div class="card">Negozio non trovato.</div>'; return; }
  if (!S.edit || S.edit.id !== id) S.edit = { id, ch: {} };
  const r = { ...base, ...S.edit.ch };
  const isNew = !!base._new && !S.rows.has(id);
  setTitle(isNew ? 'Nuovo negozio' : (base.ragione_sociale || 'Negozio'), true);
  const tel = phoneOf(r.telefono), wa = waOf(r), map = mapOf(r), col = coloreById(r.colore);
  app.innerHTML = `${isNew ? '<div class="note">Nuovo negozio: scrivi almeno il nome, poi premi <b>Salva</b>.</div>' : `<div class="dname">${esc(base.ragione_sociale || '(senza nome)')}</div>
   <div class="muted" style="margin:0 2px 10px">${esc([base.indirizzo, base.citta].filter(Boolean).join(' · '))}</div>`}
  <div class="actions">
   <button class="act" id="aTel" ${tel ? '' : 'disabled'}><span class="ic">📞</span>Chiama</button>
   <button class="act wa" id="aWa" ${wa ? '' : 'disabled'}><span class="ic">💬</span>WhatsApp</button>
   <button class="act" id="aMap" ${map ? '' : 'disabled'}><span class="ic">🧭</span>Mappa</button>
   <button class="act" id="aMail" ${r.email ? '' : 'disabled'}><span class="ic">✉️</span>Email</button></div>
  <div class="card colcard" ${col ? `style="background:#${col.hex}"` : ''}><div class="sec">Colore</div>${dotsHtml(r.colore)}</div>
  ${r.visitato === 'sì' ? '' : '<button class="btn green" id="visNow">✓ Segna visitato oggi</button>'}
  <div class="card"><div class="sec">Visita</div>${VISIT_COLS.filter(c => c !== 'colore').map(c => fieldHtml(c, r)).join('')}</div>
  <div class="card"><div class="sec">Dati negozio</div>${ORIG_COLS.map(c => fieldHtml(c, r)).join('')}</div>
  <div class="card"><div class="muted">Ultima modifica: <b>${esc(base.ultima_modifica || '—')}</b>${base.modificato_da ? ' da <b>' + esc(base.modificato_da) + '</b>' : ''}</div>
   ${isNew ? '' : '<button class="btn light" id="hist">Storico modifiche</button>'}</div>
  <div class="savebar"><div class="saved" id="saved"></div><button class="btn gold" id="save">💾 Salva</button></div>${datalists()}`;
  $('#aTel').onclick = () => openExt('tel:' + tel);
  $('#aWa').onclick = () => openExt(wa);
  $('#aMap').onclick = () => openExt(map);
  $('#aMail').onclick = () => openExt('mailto:' + r.email);
  const h = $('#hist'); if (h) h.onclick = () => go('#/history/' + encodeURIComponent(id));
  app.querySelectorAll('.colcard [data-col]').forEach(b => b.onclick = () => { setDraft(id, { colore: b.dataset.col }); rerenderDetail(id); });
  const vn = $('#visNow'); if (vn) vn.onclick = () => { setDraft(id, { visitato: 'sì', data_visita: r.data_visita || today() }); rerenderDetail(id); };
  app.querySelectorAll('[data-seg]').forEach(seg => seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; const ch = { visitato: b.dataset.v }; if (b.dataset.v === 'sì' && !r.data_visita) ch.data_visita = today(); setDraft(id, ch); rerenderDetail(id); });
  app.querySelectorAll('[data-c]').forEach(el => {
    const c = el.dataset.c;
    const upd = () => { let v = el.value; if (c === 'provincia') v = v.toUpperCase(); setDraft(id, { [c]: v }); };
    el.addEventListener('input', upd); el.addEventListener('change', upd);
  });
  $('#save').onclick = () => saveEdit();
  updateSaveBar();
}
// Salva la bozza nel database condiviso. Ritorna true se salvato (o in coda offline).
function saveEdit() {
  if (!S.edit) return true;
  const id = S.edit.id, ch = { ...S.edit.ch };
  const s = $('#saved');
  if (!Object.keys(ch).length) { toast('Nessuna modifica da salvare'); return true; }
  const prev = S.rows.get(id);
  if (!prev && empty(ch.ragione_sociale ?? S.draft?.ragione_sociale)) { toast('Scrivi il nome del negozio prima di salvare', 3500); return false; }
  const p = commit(id, ch);
  S.edit = { id, ch: {} }; rerenderDetail(id);
  const show = (t, cls) => { const e = $('#saved'); if (e) { e.textContent = t; e.className = 'saved ' + cls; } toast(t); };
  const queued = 'Salvato, verrà sincronizzato appena torna la connessione';
  if (!S.online) show(queued, 'ok'); else { show('Salvataggio…', ''); }
  let done = false;
  const t = setTimeout(() => { if (!done) show(queued, 'ok'); }, 5000);
  p && p.then(() => { done = true; clearTimeout(t); show('Salvato ✓', 'ok'); }).catch(e => { done = true; clearTimeout(t); show('Errore salvataggio: ' + errIt(e), 'warn'); });
  return true;
}
function askLeave(target) {
  const el = document.createElement('div'); el.className = 'sheet-bg';
  el.innerHTML = `<div class="sheet"><h2>Hai modifiche non salvate</h2><p class="muted">Vuoi salvarle prima di uscire?</p>
   <button class="btn gold" data-a="save">💾 Salva</button><button class="btn red" data-a="discard">Esci senza salvare</button><button class="btn light" data-a="stay">Resta qui</button></div>`;
  document.body.appendChild(el);
  el.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a && e.target !== el) return;
    if (a === 'save') { if (!saveEdit()) { el.remove(); return; } S.edit = null; el.remove(); location.hash = target; }
    else if (a === 'discard') { S.edit = null; S.draft = null; el.remove(); location.hash = target; }
    else el.remove();
  };
}
window.addEventListener('beforeunload', e => { if (editDirty()) { e.preventDefault(); e.returnValue = ''; } });
function commit(id, changes) {
  const draft = S.draft && S.draft._id === id ? S.draft : null;
  const prev = S.rows.get(id) || null;
  const base = prev || draft;
  const ch = {};
  for (const [k, v] of Object.entries(changes)) if (!eqv(v, base[k])) ch[k] = empty(v) ? null : String(v);
  if (!Object.keys(ch).length) return null;
  ch.ultima_modifica = nowStamp(); ch.modificato_da = S.profile.nome || S.user.email;
  let payload = ch;
  if (draft && !prev) { const { _id, _new, ...rest } = draft; payload = { ...Object.fromEntries(Object.entries(rest).filter(([, v]) => !empty(v))), ...ch }; S.draft = null; }
  const row = { ...(prev || { _id: id }), ...payload, _local: true, _localAt: Date.now() }; delete row._s; delete row._new;
  S.rows.set(id, row); L.putRows([row]).catch(() => {});
  S.pending++; refreshTitle();
  return C.saveShop(id, payload, prev, { uid: S.user.uid, nome: ch.modificato_da })
    .then(() => { S.pending--; refreshTitle(); })
    .catch(e => { S.pending--; refreshTitle(); toast('Errore salvataggio: ' + errIt(e), 5000); throw e; });
}
async function viewHistory(id) {
  const r = S.rows.get(id); setTitle('Storico', true);
  app.innerHTML = `<div class="dname">${esc(r?.ragione_sociale || '')}</div><div id="h" class="loading">Carico lo storico…</div>`;
  try {
    const hs = await C.getHistory(id);
    $('#h').className = ''; $('#h').innerHTML = hs.length ? hs.map(x => `<div class="card"><b>${esc(x.nome)}</b> · <span class="muted">${esc(x.quando || '')}</span>${x.nuovo ? ' <span class="badge ok">nuovo</span>' : ''}
      ${Object.entries(x.modifiche || {}).map(([k, v]) => `<div class="hrow"><b>${esc(LABELS[k] || k)}</b>: <s>${esc(v.da ?? '—')}</s> → ${esc(v.a ?? '—')}</div>`).join('')}</div>`).join('') : '<div class="card">Nessuna modifica registrata.</div>';
  } catch (e) { $('#h').textContent = 'Storico non disponibile offline. ' + errIt(e); }
}

// ---------------- Menu / esportazione / importazione ----------------
function viewMenu() {
  setTitle('Menu', true);
  const p = S.profile, adm = p.ruolo === 'admin', rows = [...S.rows.values()], t = today();
  const pend = S.users.filter(u => u.stato === 'in_attesa').length;
  app.innerHTML = `<div class="card"><b>${esc(p.nome)}</b> <span class="badge ${adm ? 'cat' : ''}">${adm ? 'admin' : 'venditore'}</span><div class="muted">${esc(p.email)}</div>
   <div class="muted">${S.online ? (S.pending ? `Invio di ${S.pending} modifiche in corso…` : '✓ Sincronizzato') : '● Offline: le modifiche partiranno quando torna la rete'}</div></div>
  <div class="card"><div class="stat"><span>Negozi nel database</span><b>${rows.length.toLocaleString('it-IT')}</b></div>
   <div class="stat"><span>Visitati</span><b>${rows.filter(r => r.visitato === 'sì').length}</b></div>
   <div class="stat"><span>Colorati</span><b>${rows.filter(r => r.colore).length}</b></div>
   <div class="stat"><span>Modificati oggi</span><b>${rows.filter(r => (r.ultima_modifica || '').startsWith(t)).length}</b></div></div>
  <button class="btn gold" id="exAll">⬇ Scarica Excel aggiornato</button>
  <button class="btn" id="exToday">⬇ Scarica solo modifiche di oggi</button>
  ${adm ? `<button class="btn" id="users">👥 Gestione utenti ${pend ? `<span class="pill">${pend}</span>` : ''}</button>
  <button class="btn light" id="legBtn">🎨 Legenda colori</button>
  <button class="btn light" id="imp">⬆ Importa Excel nel database</button>
  ${S.dataset === null ? '<button class="btn light" id="loadBase">Carica database iniziale</button>' : ''}<div id="prog" class="muted"></div>` : ''}
  <button class="btn red" id="out">Esci</button>
  <button class="btn light" id="delAcc">Elimina il mio account</button>
  <p class="muted center"><a href="#" id="privacy">Privacy</a> · <a href="#" id="support">Assistenza</a></p>`;
  $('#delAcc').onclick = () => go('#/elimina');
  $('#privacy').onclick = e => { e.preventDefault(); openExt(SITE + 'privacy.html'); };
  $('#support').onclick = e => { e.preventDefault(); openExt(SITE + 'support.html'); };
  $('#exAll').onclick = () => doExport(false);
  $('#exToday').onclick = () => doExport(true);
  $('#out').onclick = async () => { if (S.pending && !confirm('Ci sono modifiche non ancora inviate. Uscire comunque?')) return; await C.logout(); location.hash = '#/'; };
  if (adm) { $('#users').onclick = () => go('#/admin'); $('#legBtn').onclick = () => go('#/legenda'); $('#imp').onclick = () => pickExcel(); const lb = $('#loadBase'); if (lb) lb.onclick = () => uploadBase(); }
}
function sortedRows(todayOnly) {
  let rows = [...S.rows.values()]; if (todayOnly) rows = rows.filter(r => (r.ultima_modifica || '').startsWith(today()));
  return rows.sort((a, b) => { const ar = /^r\d+$/.test(a._id), br = /^r\d+$/.test(b._id); if (ar && br) return a._id < b._id ? -1 : 1; if (ar !== br) return ar ? -1 : 1; return String(a.ultima_modifica || '').localeCompare(String(b.ultima_modifica || '')); });
}
async function doExport(todayOnly) {
  const rows = sortedRows(todayOnly);
  if (!rows.length) return toast('Nessuna modifica oggi');
  toast('Preparo il file Excel…');
  const wb = buildWorkbook(rows, S.profile.nome, S.legenda);
  const name = `Natom_Diamonds_DATABASE_${today()}${todayOnly ? '_modifiche' : ''}.xlsx`;
  try {
    if (Capacitor.isNativePlatform()) {
      const data = workbookBase64(wb);
      const w = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
      if (Capacitor.getPlatform() === 'android') { try { await Filesystem.writeFile({ path: name, data, directory: Directory.Documents }); toast('Salvato anche in Documenti'); } catch {} }
      await Share.share({ title: name, text: name, files: [w.uri], dialogTitle: 'Invia o salva il file Excel' });
    } else {
      const blob = new Blob([workbookArray(wb)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) await navigator.share({ files: [file], title: name });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); }
      toast('File pronto: ' + name);
    }
  } catch (e) { if (!/cancel|abort/i.test(e.message || '')) toast('Errore esportazione: ' + e.message, 5000); }
}
const keyOf = r => norm([r.ragione_sociale, r.citta, r.indirizzo, phoneOf(r.telefono)].join('|'));
function pickExcel() {
  const inp = $('#fileInput'); inp.value = '';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { await importExcel(await f.arrayBuffer(), f.name); } catch (e) { toast('Errore importazione: ' + errIt(e), 6000); } };
  inp.click();
}
async function importExcel(buf, fname) {
  const prog = $('#prog'); const P = t => { if (prog) prog.textContent = t; };
  P('Leggo il file…');
  const { rows, unknown } = parseWorkbook(buf);
  if (!rows.length) return toast('Il file non contiene righe riconosciute (serve la colonna ragione_sociale)', 5000);
  if (S.dataset === null) {
    if (!confirm(`Caricare ${rows.length} negozi da "${fname}" come database iniziale?`)) return P('');
    const out = rows.map(({ id_app, ...r }) => ({ _id: C.newShopId(), ...r }));
    await C.bulkWrite(out, S.user.uid, false, (a, b) => P(`Caricamento ${a}/${b}…`));
    await C.setDataset({ version: 'custom-' + Date.now(), rows: out.length, by: S.profile.nome, file: fname });
    P(''); return toast('Database caricato: ' + out.length + ' negozi');
  }
  // abbinamento: prima per id_app (colonna dell'export), poi per chiave nome|città|indirizzo|telefono;
  // con chiavi duplicate si abbinano le occorrenze nello stesso ordine
  const idx = new Map(); for (const r of [...S.rows.values()].sort((a, b) => (a._id < b._id ? -1 : 1))) { const k = keyOf(r); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(r); }
  const used = new Set();
  const upd = [], add = []; let same = 0; const who = S.profile.nome;
  for (const { id_app, ...r } of rows) {
    let ex = id_app && S.rows.get(id_app);
    if (ex && used.has(ex._id)) ex = null;
    if (!ex) ex = (idx.get(keyOf(r)) || []).find(x => !used.has(x._id));
    if (!ex) { add.push({ _id: C.newShopId(), ...r, ultima_modifica: r.ultima_modifica || nowStamp(), modificato_da: r.modificato_da || who }); continue; }
    used.add(ex._id);
    const ch = {}; for (const c of EDIT_COLS) if (!empty(r[c]) && String(r[c]) !== String(ex[c] ?? '')) ch[c] = r[c];
    if (Object.keys(ch).length) upd.push({ _id: ex._id, ...ch, ultima_modifica: r.ultima_modifica && r.ultima_modifica > (ex.ultima_modifica || '') ? r.ultima_modifica : nowStamp(), modificato_da: r.modificato_da || who }); else same++;
  }
  if (!upd.length && !add.length) { P(''); return toast(`Nessuna novità: ${same} righe già uguali`); }
  if (!confirm(`File "${fname}": ${upd.length} negozi da aggiornare, ${add.length} nuovi, ${same} invariati.${unknown.length ? '\nColonne ignorate: ' + unknown.join(', ') : ''}\n\nProcedere?`)) return P('');
  await C.bulkWrite([...upd, ...add], S.user.uid, true, (a, b) => P(`Invio ${a}/${b}…`));
  P(''); toast(`Importazione completata: ${upd.length} aggiornati, ${add.length} nuovi`, 4000);
}
async function uploadBase() {
  if (!confirm('Caricare nel cloud il database Natom Diamonds incluso nell\'app (13.486 negozi)? Serve una buona connessione.')) return;
  const prog = $('#prog');
  try {
    const rows = await loadBase();
    await C.bulkWrite(rows, S.user.uid, false, (a, b) => { if (prog) prog.textContent = `Caricamento ${a}/${b}…`; });
    await C.setDataset({ version: BASE_VERSION, rows: rows.length, by: S.profile.nome });
    toast('Database caricato: ' + rows.length + ' negozi', 4000);
  } catch (e) { toast(e.code === 'no-base' ? e.message : 'Errore: ' + errIt(e), 6000); }
}

// ---------------- Eliminazione account ----------------
function viewDeleteAccount() {
  setTitle('Elimina account', true);
  const adm = C.isAdminEmail(S.user.email);
  app.innerHTML = `<form class="card" id="f"><h2>Elimina il mio account</h2>
  <p>Il tuo account (<b>${esc(S.user.email)}</b>) e i tuoi dati personali (nome, telefono) verranno eliminati definitivamente. Le note di visita già salvate restano nel database aziendale di Natom Diamonds.</p>
  ${adm ? '<div class="note">Attenzione: questo è l\'account amministratore. Dopo l\'eliminazione nessuno potrà approvare nuovi utenti finché non ti registri di nuovo con la stessa email.</div>' : ''}
  <label>Per confermare scrivi la tua password</label><input name="password" type="password" autocomplete="current-password" required>
  <button class="btn red" type="submit">Elimina definitivamente</button>
  <button class="btn light" type="button" id="cancel">Annulla</button></form>`;
  $('#cancel').onclick = () => go(S.profile && S.profile.stato === 'approvato' ? '#/menu' : '#/');
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
    if (!confirm('Eliminare definitivamente il tuo account? L\'operazione non si può annullare.')) return;
    busy(f, true);
    try { await C.deleteMyAccount(f.password.value); clearSubs(); try { await L.clearAll(); } catch {} location.hash = '#/'; toast('Account eliminato', 4000); }
    catch (er) { toast(errIt(er), 5000); busy(f, false); } };
}

// ---------------- Legenda colori (admin) ----------------
function viewLegenda() {
  setTitle('Legenda colori', true);
  const adm = S.profile.ruolo === 'admin';
  app.innerHTML = `<div class="card"><p class="muted">${adm ? 'Puoi cambiare il significato di ogni colore: vale per tutti gli utenti.' : 'Significato dei colori.'}</p>
  ${COLORI.map(c => `<label><span class="cdot sm" style="background:${c.dot}"></span> ${c.nome}</label><input data-leg="${c.id}" value="${esc(leg(c.id))}" ${adm ? '' : 'disabled'}>`).join('')}
  ${adm ? '<button class="btn gold" id="saveLeg">💾 Salva legenda</button><button class="btn light" id="defLeg">Ripristina valori iniziali</button>' : ''}</div>`;
  if (!adm) return;
  $('#defLeg').onclick = () => app.querySelectorAll('[data-leg]').forEach(i => (i.value = LEGENDA_DEFAULT[i.dataset.leg]));
  $('#saveLeg').onclick = async () => {
    const d = {}; app.querySelectorAll('[data-leg]').forEach(i => (d[i.dataset.leg] = i.value.trim() || LEGENDA_DEFAULT[i.dataset.leg]));
    S.legenda = { ...LEGENDA_DEFAULT, ...d };
    try { const p = C.setConfig('legenda', { ...d, modificato_da: S.profile.nome, ultima_modifica: nowStamp() }); toast(S.online ? 'Legenda salvata ✓' : 'Salvata, verrà sincronizzata appena torna la connessione'); await p; } catch (e) { toast(errIt(e)); }
  };
}

// ---------------- Amministrazione utenti ----------------
let usersUnsub = null;
function ensureUsersWatch() { if (usersUnsub || S.profile?.ruolo !== 'admin') return; usersUnsub = C.watchUsers(u => { S.users = u; if (location.hash === '#/admin') drawAdmin(); }, e => { console.warn('users', e.code); usersUnsub = null; }); S.unsubs.push(() => { usersUnsub && usersUnsub(); usersUnsub = null; }); }
function viewAdmin() { setTitle('Gestione utenti', true); if (S.profile.ruolo !== 'admin') { app.innerHTML = '<div class="card">Solo per amministratori.</div>'; return; } ensureUsersWatch(); drawAdmin(); }
function drawAdmin() {
  const by = s => S.users.filter(u => u.stato === s);
  const card = (u, btns) => `<div class="card" data-uid="${esc(u.id)}"><b>${esc(u.nome)}</b> <span class="badge ${u.ruolo === 'admin' ? 'cat' : ''}">${esc(u.ruolo)}</span>
    <div class="muted">${esc(u.email)} · ${esc(u.telefono)}</div>${btns}</div>`;
  const me = S.user.uid;
  app.innerHTML = `<div class="sec">Richieste in attesa (${by('in_attesa').length})</div>
  ${by('in_attesa').map(u => card(u, `<div class="row2"><button class="btn green" data-a="approva">Approva</button><button class="btn red" data-a="rifiuta">Rifiuta</button></div>`)).join('') || '<div class="card muted">Nessuna richiesta.</div>'}
  <div class="sec">Utenti approvati (${by('approvato').length})</div>
  ${by('approvato').map(u => card(u, u.id === me ? '<div class="muted">(sei tu)</div>' : `<label>Ruolo</label><select data-role><option value="venditore" ${u.ruolo === 'venditore' ? 'selected' : ''}>venditore</option><option value="admin" ${u.ruolo === 'admin' ? 'selected' : ''}>admin</option></select><button class="btn light" data-a="revoca">Revoca accesso</button>`)).join('')}
  <div class="sec">Rifiutati / revocati</div>
  ${[...by('rifiutato'), ...by('revocato')].map(u => card(u, `<div class="muted">${u.stato}</div><button class="btn light" data-a="approva">Riattiva / approva</button>`)).join('') || '<div class="card muted">Nessuno.</div>'}`;
  app.querySelectorAll('[data-uid]').forEach(el => {
    const uid = el.dataset.uid;
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const st = { approva: 'approvato', rifiuta: 'rifiutato', revoca: 'revocato' }[b.dataset.a];
      try { await C.setUser(uid, { stato: st, approvatoDa: S.profile.nome, approvatoIl: new Date().toISOString() }); toast('Fatto: ' + st); } catch (e) { toast(errIt(e)); }
    });
    const rs = el.querySelector('[data-role]'); if (rs) rs.onchange = async () => { try { await C.setUser(uid, { ruolo: rs.value }); toast('Ruolo aggiornato'); } catch (e) { toast(errIt(e)); } };
  });
}
// avvia l'ascolto utenti per gli admin (contatore richieste nel menu)
setInterval(() => { if (S.profile?.stato === 'approvato' && S.profile.ruolo === 'admin') ensureUsersWatch(); }, 1500);

// ---------------- PWA ----------------
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && !EMULATOR.enabled) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

// Hook di test (solo emulatore)
if (EMULATOR.enabled) window.__natom = { S, exportBase64: todayOnly => workbookBase64(buildWorkbook(sortedRows(todayOnly), S.profile?.nome, S.legenda)), importExcel, uploadBase, commit, saveEdit, setDraft };
