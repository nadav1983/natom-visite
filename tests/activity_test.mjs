// Pagina "Attività" (solo admin), emulatore, dati finti: 2 venditori modificano, l'admin vede in tempo reale
import puppeteer from 'puppeteer-core';
import XLSX from 'xlsx';
const URL = 'http://localhost:5000/', PJ = 'demo-natom';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const log = (...a) => console.log('•', ...a);
await fetch(`http://localhost:8080/emulator/v1/projects/${PJ}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/accounts`, { method: 'DELETE' });
const names = ['Gioielleria Aurora', 'Oreficeria Bellini', 'Compro Oro Centrale', 'Gioielli Dora', 'Laboratorio Orafo Esposito', 'Gioielleria Fiore', 'Preziosi Galli', 'Oro & Argento Ferri', 'Gioielleria Luna', 'Orologeria Marini'];
const cities = [['Torino', 'TO', 'Piemonte'], ['Cuneo', 'CN', 'Piemonte'], ['Savona', 'SV', 'Liguria'], ['Genova', 'GE', 'Liguria'], ['Asti', 'AT', 'Piemonte']];
const rows = names.map((n, i) => ({ ragione_sociale: n, categoria: 'gioielleria', citta: cities[i % 5][0], provincia: cities[i % 5][1], regione: cities[i % 5][2], indirizzo: 'Via Roma ' + (i + 1) }));
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'N'); const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function newPage(w = 400, h = 850, dsf = 1) { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: dsf }); p.on('dialog', d => d.accept()); await p.goto(URL, { waitUntil: 'networkidle2' }); return p; }
const waitText = (p, t, timeout = 60000) => p.waitForFunction(t => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout, polling: 50 }, t);
const has = (p, t) => p.evaluate(t => document.querySelector('#actList')?.innerText.includes(t), t);
async function fill(p, d) { for (const [k, v] of Object.entries(d)) { await p.$eval(`[name=${k}]`, el => (el.value = '')); await p.type(`[name=${k}]`, v); } }
async function clickText(p, t) { await p.evaluate(t => [...document.querySelectorAll('button')].find(b => b.innerText.includes(t)).click(), t); }
const fail = m => { console.error('FAIL:', m); process.exitCode = 1; };
// admin
const A = await newPage(430, 932, 3); await waitText(A, 'Accedi'); await clickText(A, 'Crea un nuovo account'); await waitText(A, 'Richiedi l');
await fill(A, { nome: 'Nadav', telefono: '1', email: 'nadavabramovraffael@gmail.com', password: 'emu-only-test' }); await clickText(A, 'Registrati'); await waitText(A, 'Ho verificato');
let link; for (let i = 0; i < 40 && !link; i++) { const o = await (await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/oobCodes`)).json(); link = (o.oobCodes || []).find(c => c.requestType === 'VERIFY_EMAIL')?.oobLink; if (!link) await sleep(300); }
await fetch(link); await clickText(A, 'Ho verificato'); await waitText(A, 'Database non ancora caricato');
await A.evaluate(async b => { const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0)); await window.__natom.importExcel(bin.buffer, 'x.xlsx'); }, b64); await waitText(A, 'negozi trovati');
// venditori
async function rep(nome, email) { const p = await newPage(); await waitText(p, 'Accedi'); await clickText(p, 'Crea un nuovo account'); await waitText(p, 'Richiedi l');
  await fill(p, { nome, telefono: '+39 333 0000000', email, password: 'venditore1' }); await clickText(p, 'Registrati'); await waitText(p, 'in attesa'); return p; }
const B = await rep('Luca Rossi', 'luca@esempio.it'), Cc = await rep('Giulia Verdi', 'giulia@esempio.it');
await A.evaluate(() => (location.hash = '#/admin')); await waitText(A, 'Giulia Verdi');
for (let i = 0; i < 2; i++) { await clickText(A, 'Approva'); await sleep(800); }
await waitText(B, 'negozi trovati'); await waitText(Cc, 'negozi trovati');
const idOf = (p, n) => p.evaluate(n => [...window.__natom.S.rows.values()].find(r => r.ragione_sociale === n)._id, n);
async function edit(p, name, f) { const id = await idOf(p, name); await p.evaluate(id => (location.hash = '#/shop/' + encodeURIComponent(id)), id); await waitText(p, 'Salva'); await f(p); await p.click('#save'); await waitText(p, 'Salvato ✓'); await p.evaluate(() => (location.hash = '#/')); await sleep(200); }
await edit(B, 'Gioielleria Aurora', async p => { await p.click('.colcard [data-col="giallo"]'); await p.type('[data-c=note_visita]', 'Titolare interessato, ripassare giovedì'); });
await edit(B, 'Gioielleria Aurora', async p => { await p.click('.colcard [data-col="verde chiaro"]'); await p.select('[data-c=esito]', 'cliente'); });
await edit(B, 'Compro Oro Centrale', async p => { await p.select('[data-c=esito]', 'interessato'); await p.click('.colcard [data-col="azzurro"]'); });
await B.evaluate(() => (location.hash = '#/new')); await waitText(B, 'Nuovo negozio');
await B.type('[data-c=ragione_sociale]', 'Gioielleria Nuova Stella'); await B.type('[data-c=citta]', 'Alba'); await B.click('#save'); await waitText(B, 'Salvato ✓'); await B.evaluate(() => (location.hash = '#/'));
await edit(Cc, 'Preziosi Galli', async p => { await p.click('.colcard [data-col="rosso"]'); await p.select('[data-c=esito]', 'non interessato'); });
await edit(Cc, 'Gioielleria Luna', async p => { await p.click('.colcard [data-col="rosa"]'); await p.type('[data-c=referente]', 'Sig. Conti'); });
// admin apre Attività
await A.evaluate(() => (location.hash = '#/menu')); await waitText(A, 'Attività venditori'); await clickText(A, 'Attività venditori');
const t0 = Date.now(); await A.waitForFunction(() => /5\s*negozi/.test(document.querySelector('#actSum')?.innerText || ''), { timeout: 20000, polling: 50 }).catch(() => {});
const sum = await A.$eval('#actSum', e => e.innerText); log('apertura Attività (' + (Date.now() - t0) + ' ms):', sum.replace(/\n/g, ' | '));
if (!/^5 negozi · 1 nuovi · 4 modificati/.test(sum)) fail('riepilogo inatteso: ' + sum);
const txt = await A.$eval('#actList', e => e.innerText); log('lista:\n' + txt.split('\n').map(l => '   ' + l).join('\n'));
for (const t of ['LUCA ROSSI · 3', 'GIULIA VERDI · 2', 'NUOVO', 'note aggiunte', 'colore: — → verde chiaro', 'esito: — → cliente', '2 salvataggi', 'colore: — → rosso']) if (!txt.toUpperCase().includes(t.toUpperCase())) fail('manca: ' + t);
const chips = await A.$eval('#actWho', e => e.innerText.replace(/\n/g, ' / ')); log('chip:', chips);
// tempo reale: B modifica senza Salva → niente; poi Salva → appare
const idM = await idOf(B, 'Orologeria Marini'); await B.evaluate(id => (location.hash = '#/shop/' + encodeURIComponent(id)), idM); await waitText(B, 'Salva');
await B.click('.colcard [data-col="giallo"]'); await sleep(3000);
log('3 s dopo modifica SENZA Salva, Attività admin mostra Orologeria Marini:', await has(A, 'Orologeria Marini'));
if (await has(A, 'Orologeria Marini')) fail('visibile prima di Salva');
const t1 = Date.now(); await B.click('#save');
await A.waitForFunction(() => document.querySelector('#actList')?.innerText.includes('Orologeria Marini'), { timeout: 20000, polling: 50 });
log(`dopo Salva: compare in Attività dell'admin in ${Date.now() - t1} ms`);
log('riepilogo ora:', (await A.$eval('#actSum', e => e.innerText)).replace(/\n/g, ' | '));
// filtro venditore
await A.evaluate(() => [...document.querySelectorAll('#actWho .chip')].find(b => b.innerText.startsWith('Giulia')).click()); await sleep(200);
const g = await A.$eval('#actList', e => e.innerText); log('filtro Giulia: contiene Luca?', g.includes('LUCA') || g.includes('Luca Rossi'), '· contiene Preziosi Galli?', g.includes('Preziosi Galli'));
if (g.includes('Gioielleria Aurora')) fail('filtro non applicato');
// periodo Ieri
await A.evaluate(() => document.querySelector('#actPer [data-p=ieri]').click()); await waitText(A, 'Nessun negozio aggiunto o modificato ieri', 10000); log('Ieri: vuoto ✓');
await A.evaluate(() => document.querySelector('#actPer [data-p="7g"]').click()); await A.waitForFunction(() => /6\s*negozi/.test(document.querySelector('#actSum')?.innerText || ''), { timeout: 10000 }); log('7 giorni:', (await A.$eval('#actSum', e => e.innerText)).split('\n')[0]);
await A.evaluate(() => document.querySelector('#actPer [data-p=oggi]').click()); await A.waitForFunction(() => /6\s*negozi/.test(document.querySelector('#actSum')?.innerText || ''), { timeout: 10000 });
await A.evaluate(() => { const t = document.querySelector('#toast'); t && t.classList.add('hidden'); window.scrollTo(0, 0); }); await sleep(300);
await A.screenshot({ path: 'screenshots/attivita.png' }); log('screenshot salvato');
// tap apre la scheda
await A.evaluate(() => document.querySelector('#actList [data-id]').click()); await waitText(A, 'Storico modifiche'); log('tap → scheda negozio aperta:', await A.$eval('.dname', e => e.innerText));
// un venditore non vede la pagina
await B.evaluate(() => (location.hash = '#/attivita')); await waitText(B, 'Solo per amministratori'); log('venditore su #/attivita → "Solo per amministratori" ✓');
await browser.close(); log(process.exitCode ? 'TEST FALLITO' : 'TEST OK');
