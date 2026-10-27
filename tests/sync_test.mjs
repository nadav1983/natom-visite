// Sync tra due dispositivi (emulatore): B modifica -> A vede solo dopo Salva, con tempo misurato
import puppeteer from 'puppeteer-core';
import XLSX from 'xlsx';
const URL = 'http://localhost:5000/', PJ = 'demo-natom';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const log = (...a) => console.log('•', ...a);
await fetch(`http://localhost:8080/emulator/v1/projects/${PJ}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/accounts`, { method: 'DELETE' });
const rows = Array.from({ length: 30 }, (_, i) => ({ ragione_sociale: 'Negozio Prova ' + (i + 1), categoria: 'gioielleria', citta: 'Torino', provincia: 'TO', regione: 'Piemonte', indirizzo: 'Via Roma ' + (i + 1) }));
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'N'); const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function newPage() { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 400, height: 850 }); p.on('dialog', d => d.accept()); await p.goto(URL, { waitUntil: 'networkidle2' }); return p; }
const waitText = (p, t, timeout = 60000) => p.waitForFunction(t => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout, polling: 100 }, t);
async function fill(p, d) { for (const [k, v] of Object.entries(d)) { await p.$eval(`[name=${k}]`, el => (el.value = '')); await p.type(`[name=${k}]`, v); } }
async function clickText(p, t) { await p.evaluate(t => [...document.querySelectorAll('button')].find(b => b.innerText.includes(t)).click(), t); }
const A = await newPage(); await waitText(A, 'Accedi'); await clickText(A, 'Crea un nuovo account'); await waitText(A, 'Richiedi l');
await fill(A, { nome: 'Admin', telefono: '1', email: 'nadavabramovraffael@gmail.com', password: 'emu-only-test' }); await clickText(A, 'Registrati'); await waitText(A, 'Ho verificato');
let link; for (let i = 0; i < 40 && !link; i++) { const o = await (await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/oobCodes`)).json(); link = (o.oobCodes || []).find(c => c.requestType === 'VERIFY_EMAIL')?.oobLink; if (!link) await sleep(300); }
await fetch(link); await clickText(A, 'Ho verificato'); await waitText(A, 'Database non ancora caricato');
await A.evaluate(async b => { const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0)); await window.__natom.importExcel(bin.buffer, 'x.xlsx'); }, b64); await waitText(A, 'negozi trovati');
const B = await newPage(); await waitText(B, 'Accedi'); await clickText(B, 'Crea un nuovo account'); await waitText(B, 'Richiedi l');
await fill(B, { nome: 'Venditore B', telefono: '2', email: 'b@test.it', password: 'venditoreB1' }); await clickText(B, 'Registrati'); await waitText(B, 'in attesa');
await A.evaluate(() => (location.hash = '#/admin')); await waitText(A, 'Venditore B'); await clickText(A, 'Approva'); await sleep(500);
await waitText(B, 'negozi trovati', 60000); await A.evaluate(() => (location.hash = '#/')); await waitText(A, 'negozi trovati');
const id = await B.evaluate(() => [...window.__natom.S.rows.values()].find(r => r.ragione_sociale === 'Negozio Prova 7')._id);
// A apre la stessa scheda (schermo già aperto)
await A.evaluate(id => (location.hash = '#/shop/' + encodeURIComponent(id)), id); await waitText(A, 'Salva');
await B.evaluate(id => (location.hash = '#/shop/' + encodeURIComponent(id)), id); await waitText(B, 'Salva');
await B.type('[data-c=note_visita]', 'Nota sync test'); await B.click('.colcard [data-col="verde chiaro"]'); await sleep(4000);
const before = await A.evaluate(id => { const r = window.__natom.S.rows.get(id); return { nota: r.note_visita || null, colore: r.colore || null, inPage: document.body.innerText.includes('Nota sync test') }; }, id);
log('4 s dopo la modifica SENZA Salva, A vede:', JSON.stringify(before));
const t0 = Date.now(); await B.click('#save');
await A.waitForFunction(id => { const r = window.__natom.S.rows.get(id); return r.note_visita === 'Nota sync test' && r.colore === 'verde chiaro'; }, { timeout: 30000, polling: 50 }, id);
const tData = Date.now() - t0;
await A.waitForFunction(() => [...document.querySelectorAll('textarea,input')].some(x => x.value === 'Nota sync test'), { timeout: 15000, polling: 50 });
log(`dopo Salva: dato arrivato su A in ${tData} ms, scheda aperta di A aggiornata in ${Date.now() - t0} ms`);
// lista di A
await A.evaluate(() => (location.hash = '#/')); await B.evaluate(() => (location.hash = '#/'));
const id2 = await B.evaluate(() => [...window.__natom.S.rows.values()].find(r => r.ragione_sociale === 'Negozio Prova 3')._id);
await B.evaluate(id => (location.hash = '#/shop/' + encodeURIComponent(id)), id2); await waitText(B, 'Salva');
await B.click('.colcard [data-col="rosso"]'); const t1 = Date.now(); await B.click('#save');
await A.waitForFunction(() => [...document.querySelectorAll('.item')].some(x => x.innerText.includes('Negozio Prova 3') && /non interessato/i.test(x.innerText)), { timeout: 30000, polling: 50 });
log(`lista aperta di A mostra il nuovo colore in ${Date.now() - t1} ms`);
await browser.close();
