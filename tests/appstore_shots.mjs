// Screenshot App Store (1290x2796) con DATI FINTI su emulatore + test eliminazione account
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import XLSX from 'xlsx';
const URL = 'http://localhost:5000/', PJ = 'demo-natom', OUT = 'screenshots/appstore';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);
await fetch(`http://localhost:8080/emulator/v1/projects/${PJ}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/accounts`, { method: 'DELETE' });
// negozi finti
const citta = [['Torino','TO','Piemonte'],['Milano','MI','Lombardia'],['Genova','GE','Liguria'],['Cuneo','CN','Piemonte'],['Alessandria','AL','Piemonte'],['Savona','SV','Liguria']];
const nomi = ['Gioielleria Aurora','Oro & Stile','Gioielli Bellavista','Compro Oro Centrale','Laboratorio Orafo Ferri','Gioielleria Diamante Blu','Preziosi Luna','Gioielleria Corso Italia','Oro Express','Gioielleria Le Gemme','Atelier Orafo Rinaldi','Gioielleria Primavera','Compro Oro Piazza','Gioielleria Smeraldo','Orologeria Gioielleria Conti','Gioielleria Stella','Oro Sicuro','Gioielleria Il Brillante','Bottega Orafa Riva','Gioielleria Vittoria'];
const vie = ['Via Roma','Corso Vittorio Emanuele','Via Garibaldi','Piazza Duomo','Via Mazzini','Corso Italia','Via Cavour','Via XX Settembre'];
const col = ['verde chiaro','azzurro','giallo','rosa','rosso',null,null,null];
const rows = [];
for (let i = 0; i < 60; i++) { const c = citta[i % citta.length], n = nomi[i % nomi.length] + (i >= 20 ? ' ' + c[0] : '');
  const cl = col[i % col.length];
  rows.push({ ragione_sociale: n, categoria: /Compro/.test(n) ? 'compro_oro' : /Laboratorio|Atelier|Bottega/.test(n) ? 'laboratorio_orafo' : 'gioielleria',
    citta: c[0], provincia: c[1], regione: c[2], indirizzo: `${vie[i % vie.length]} ${10 + i}`, telefono: `+39 011 000 ${String(1000 + i).slice(-4)}`,
    whatsapp: i % 3 ? `+39 333 000 ${String(2000 + i).slice(-4)}` : '', stato: 'nuovo',
    visitato: cl ? 'sì' : '', data_visita: cl ? '2026-10-2' + (i % 7) : '', colore: cl || '',
    esito: { 'verde chiaro': 'cliente', azzurro: 'interessato', giallo: 'richiamare', rosso: 'non interessato', rosa: '' }[cl] || '',
    note_visita: cl === 'azzurro' ? 'Interessati a brillanti 0,50 ct G VS. Mandare listino.' : cl === 'verde chiaro' ? 'Primo ordine: 3 solitari.' : cl === 'giallo' ? 'Ripassare giovedì mattina.' : '' });
}
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Negozi');
const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function newPage() { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
  p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto(URL, { waitUntil: 'networkidle2' }); return p; }
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const waitText = (p, t, timeout = 60000) => p.waitForFunction(t => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout, polling: 250 }, t);
async function fill(p, data) { for (const [k, v] of Object.entries(data)) { await p.$eval(`[name=${k}]`, el => (el.value = '')); await p.type(`[name=${k}]`, v); } }
async function clickText(p, t) { await p.evaluate(t => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.includes(t)); if (!b) throw new Error('no button ' + t); b.click(); }, t); }

const A = await newPage();
await waitText(A, 'Accedi'); await A.evaluate(() => [...document.querySelectorAll('p.muted')].filter(x => /emulatore/.test(x.innerText)).forEach(x => x.remove())); await shot(A, '01_accesso');
await clickText(A, 'Crea un nuovo account'); await waitText(A, 'Richiedi l');
await fill(A, { nome: 'Marco Bianchi', telefono: '+39 300 0000000', email: 'nadavabramovraffael@gmail.com', password: 'emu-only-test' });
await clickText(A, 'Registrati'); await waitText(A, 'Ho verificato');
let link; for (let i = 0; i < 40 && !link; i++) { const o = await (await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/oobCodes`)).json(); link = (o.oobCodes || []).find(c => c.requestType === 'VERIFY_EMAIL')?.oobLink; if (!link) await sleep(500); }
await fetch(link); await clickText(A, 'Ho verificato'); await waitText(A, 'Database non ancora caricato');
await A.evaluate(async b => { const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0)); await window.__natom.importExcel(bin.buffer, 'demo.xlsx'); }, b64);
await waitText(A, 'negozi trovati', 60000); await sleep(4500);
await A.evaluate(() => { const d = document.querySelector('details'); if (d) d.open = false; window.scrollTo(0, 0); }); await sleep(400);
await shot(A, '02_lista');
await A.evaluate(() => { document.querySelector('details').open = true; }); await A.type('[data-f=citta]', 'Torino'); await sleep(900);
await A.evaluate(() => window.scrollTo(0, 0)); await shot(A, '03_ricerca_filtri');
await A.evaluate(() => { const i = document.querySelector('[data-f=citta]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('details').open = false; }); await sleep(900);
await A.evaluate(() => [...document.querySelectorAll('.item')].find(x => /Diamante Blu/.test(x.innerText))?.click() || document.querySelector('.item').click());
await waitText(A, 'Salva'); await sleep(600); await A.evaluate(() => window.scrollTo(0, 0)); await shot(A, '04_scheda_negozio');
await A.evaluate(() => (location.hash = '#/')); await waitText(A, 'negozi trovati'); await sleep(600);
await sleep(2500); await A.evaluate(() => document.querySelectorAll('.item [data-pal]')[3].click()); await waitText(A, 'Scegli un colore'); await sleep(400); await shot(A, '05_colori');
await A.evaluate(() => document.querySelector('.sheet [data-col="azzurro"]').click()); await sleep(500);
await A.evaluate(() => (location.hash = '#/menu')); await waitText(A, 'Negozi nel database'); await sleep(3000); await A.evaluate(() => document.querySelectorAll('.muted').forEach(x => { if (x.innerText.includes('@')) x.innerText = 'marco.bianchi@esempio.it'; })); await shot(A, '06_menu');
log('screenshot fatti');

// Test eliminazione account (regole attuali del file firestore.rules)
const V = await newPage();
await waitText(V, 'Accedi'); await clickText(V, 'Crea un nuovo account'); await waitText(V, 'Richiedi l');
await fill(V, { nome: 'Test Elimina', telefono: '+39 300 1111111', email: 'elimina@test.it', password: 'elimina123' });
await clickText(V, 'Registrati'); await waitText(V, 'in attesa di approvazione');
await clickText(V, 'Elimina il mio account'); await waitText(V, 'Elimina definitivamente');
await shot(V, '_elimina_account');
await fill(V, { password: 'sbagliata1' }); await clickText(V, 'Elimina definitivamente'); await sleep(2500);
log('password errata → toast:', await V.$eval('#toast', e => e.innerText));
await fill(V, { password: 'elimina123' }); await clickText(V, 'Elimina definitivamente'); await waitText(V, 'Accedi', 20000); await sleep(1500);
const acc = await (await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${PJ}/accounts:query`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}' })).json();
log('utenti Auth rimasti:', (acc.userInfo || []).map(u => u.email));
const us = await (await fetch(`http://localhost:8080/v1/projects/${PJ}/databases/(default)/documents/users`, { headers: { Authorization: 'Bearer owner' } })).json();
log('profili users:', (us.documents || []).map(d => d.fields.email.stringValue + ' / ' + d.fields.nome.stringValue));
await browser.close();
