// Test end-to-end contro emulatore Firebase + hosting emulator (http://localhost:5000)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const URL = 'http://localhost:5000/';
const PJ = 'demo-natom';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);
await fetch(`http://localhost:8080/emulator/v1/projects/${PJ}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/accounts`, { method: 'DELETE' });

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function newPage(w = 400, h = 850, ua) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (ua) await p.setUserAgent(ua);
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (['error', 'warn'].includes(m.type()) && !/Could not reach|offline/i.test(m.text())) console.log('CONSOLE', m.text().slice(0, 200)); });
  await p.goto(URL, { waitUntil: 'networkidle2' });
  return p;
}
const shot = (p, n) => p.screenshot({ path: `screenshots/${n}.png` });
const waitText = async (p, t, timeout = 60000) => { try { await p.waitForFunction(t => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout, polling: 250 }, t); } catch (e) { console.log('TIMEOUT waiting', t, '\nPAGE:', (await p.evaluate(() => location.hash + ' | ' + document.body.innerText)).slice(0, 600)); await p.screenshot({ path: 'screenshots/_fail.png' }); throw e; } };
async function fill(p, data) { for (const [k, v] of Object.entries(data)) { await p.$eval(`[name=${k}]`, el => (el.value = '')); await p.type(`[name=${k}]`, v); } }
async function clickText(p, t) { await p.evaluate(t => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.includes(t)); if (!b) throw new Error('no button ' + t); b.click(); }, t); }

// 1) Admin (Nadav)
const A = await newPage();
await waitText(A, 'Accedi'); await shot(A, '01_login');
await clickText(A, 'Crea un nuovo account'); await waitText(A, 'Richiedi l');
await fill(A, { nome: 'Nadav Abramov', telefono: '+39 300 0000000', email: 'nadavabramovraffael@gmail.com', password: 'emu-only-test' });
await shot(A, '02_registrazione');
await clickText(A, 'Registrati'); await waitText(A, 'Ho verificato');
let link; for (let i = 0; i < 40 && !link; i++) { const oob = await (await fetch(`http://localhost:9099/emulator/v1/projects/${PJ}/oobCodes`)).json(); link = (oob.oobCodes || []).find(c => c.requestType === 'VERIFY_EMAIL')?.oobLink; if (!link) await sleep(500); }
await shot(A, '02b_admin_verifica'); await fetch(link);
await clickText(A, 'Ho verificato'); await waitText(A, 'Database non ancora caricato'); log('admin attivato');
const t0 = Date.now(); await clickText(A, 'Carica database iniziale');
await waitText(A, 'negozi trovati', 300000); await waitText(A, '13.486', 300000); log('database caricato nel cloud in', (Date.now() - t0) / 1000, 's');

// 2) Venditore
const V = await newPage();
await waitText(V, 'Accedi'); await clickText(V, 'Crea un nuovo account'); await waitText(V, 'Richiedi l');
await fill(V, { nome: 'Luca Rossi', telefono: '+39 333 1234567', email: 'luca@test.it', password: 'venditore1' });
await clickText(V, 'Registrati'); await waitText(V, 'in attesa di approvazione'); await shot(V, '03_in_attesa'); log('venditore in attesa');
await A.evaluate(() => (location.hash = '#/admin')); await waitText(A, 'Luca Rossi'); await shot(A, '04_admin_approvazioni');
await clickText(A, 'Approva'); await waitText(A, 'Utenti approvati (2)');
await waitText(V, '13.486', 120000); log('venditore approvato, vede', await V.evaluate(() => window.__natom.S.rows.size), 'righe');

// 3) Filtro Savona
await V.evaluate(() => { document.querySelector('details').open = true; });
await V.type('[data-f=citta]', 'Savona'); await sleep(800);
const cnt = await V.$eval('#count', e => e.innerText); log('filtro Savona:', cnt);
await V.evaluate(() => document.querySelector('.resbar').scrollIntoView()); await sleep(300); await shot(V, '05_lista_savona');
await V.evaluate(() => window.scrollTo(0, 0)); await shot(V, '05a_menu_ricerca_filtri');
// 4) Modifica un negozio (bozza + Salva)
await V.evaluate(() => document.querySelector('.item').click()); await waitText(V, 'Segna visitato oggi');
const shopId = await V.evaluate(() => decodeURIComponent(location.hash.slice(7)));
await clickText(V, 'Segna visitato oggi'); await sleep(300);
await V.select('[data-c=esito]', 'interessato');
await V.type('[data-c=referente]', 'Sig.ra Bianchi');
await V.type('[data-c=note_visita]', 'Interessati a brillanti 0,50 ct G VS. Richiamare dopo il 10.');
await V.click('.colcard [data-col="azzurro"]'); await sleep(300);
const notSaved = await A.evaluate(id => window.__natom.S.rows.get(id)?.referente || null, shopId);
log('prima di Salva, admin vede referente =', notSaved);
await V.evaluate(() => window.scrollTo(0, 0)); await shot(V, '06_scheda_bozza_non_salvata');
await V.click('#save'); await waitText(V, 'Salvato ✓'); await sleep(300);
await V.evaluate(() => window.scrollTo(0, 0)); await shot(V, '07_scheda_salvato');
await V.evaluate(() => window.scrollTo(0, 700)); await shot(V, '07b_scheda_campi');
await A.waitForFunction(id => window.__natom.S.rows.get(id)?.referente === 'Sig.ra Bianchi' && window.__natom.S.rows.get(id)?.colore === 'azzurro', { timeout: 30000 }, shopId); log('admin riceve la modifica salvata in tempo reale ✔');
// avviso modifiche non salvate
await V.type('[data-c=prossimo_passo]', 'bozza da scartare');
await V.click('#btnBack'); await waitText(V, 'Hai modifiche non salvate'); await shot(V, '08_avviso_non_salvato');
await clickText(V, 'Esci senza salvare'); await waitText(V, 'negozi trovati'); log('avviso uscita senza salvare ✔');
// colore dalla lista
await V.evaluate(() => document.querySelectorAll('.item [data-pal]')[1].click()); await waitText(V, 'Scegli un colore'); await shot(V, '05b_lista_scelta_colore');
await V.click('.sheet [data-col="giallo"]'); await sleep(600);
await V.evaluate(() => document.querySelectorAll('.item [data-pal]')[2].click()); await V.click('.sheet [data-col="rosa"]'); await sleep(600);
await shot(V, '05c_lista_colori');
// storico
await V.evaluate(id => (location.hash = '#/history/' + encodeURIComponent(id)), shopId); await waitText(V, 'Luca Rossi'); await shot(V, '09_storico');
// 5) Offline
await V.evaluate(id => (location.hash = '#/shop/' + encodeURIComponent(id)), shopId); await waitText(V, 'Storico modifiche');
await V.setOfflineMode(true); await V.evaluate(() => window.dispatchEvent(new Event('offline')));
await V.type('[data-c=prossimo_passo]', 'Mandare listino (offline)'); await V.click('#save');
await waitText(V, 'verrà sincronizzato appena torna la connessione'); await shot(V, '10_salvato_offline');
log('offline, modifiche in coda:', await V.evaluate(() => window.__natom.S.pending));
log('admin prima della rete:', await A.evaluate(id => window.__natom.S.rows.get(id)?.prossimo_passo || null, shopId));
await V.setOfflineMode(false); await V.evaluate(() => window.dispatchEvent(new Event('online')));
await A.waitForFunction(id => window.__natom.S.rows.get(id)?.prossimo_passo === 'Mandare listino (offline)', { timeout: 60000 }, shopId); log('modifica offline sincronizzata ✔');
// 6) Nuovo negozio
await V.evaluate(() => (location.hash = '#/new')); await waitText(V, 'Nuovo negozio');
await V.type('[data-c=ragione_sociale]', 'Gioielleria Test Savona'); await V.type('[data-c=citta]', 'Savona');
await V.click('#save'); await waitText(V, 'Salvato ✓'); log('nuovo negozio creato');
await A.waitForFunction(() => [...window.__natom.S.rows.values()].some(r => r.ragione_sociale === 'Gioielleria Test Savona'), { timeout: 30000 });
// legenda (admin)
await A.evaluate(() => (location.hash = '#/legenda')); await waitText(A, 'Salva legenda'); await shot(A, '12_admin_legenda');
// 7) Menu + export
await V.evaluate(() => (location.hash = '#/menu')); await waitText(V, 'Negozi nel database'); await shot(V, '09_menu');
fs.writeFileSync('tests/export_full.xlsx', Buffer.from(await V.evaluate(() => window.__natom.exportBase64(false)), 'base64'));
fs.writeFileSync('tests/export_oggi.xlsx', Buffer.from(await V.evaluate(() => window.__natom.exportBase64(true)), 'base64'));
log('export scritti');
// 8) Re-import (admin) del file esportato: deve risultare "nessuna novità"
const b64 = fs.readFileSync('tests/export_full.xlsx').toString('base64');
await A.evaluate(async b => { const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0)); location.hash = '#/menu'; await new Promise(r => setTimeout(r, 500)); await window.__natom.importExcel(bin.buffer, 'export_full.xlsx'); }, b64);
await sleep(1500); const ri = await A.$eval('#toast', e => e.innerText); log('re-import:', ri); if (!/Nessuna novit/.test(ri)) throw new Error('re-import non idempotente: ' + ri);
// 9) PWA iPhone 11
await A.evaluate(() => (location.hash = '#/menu')); await waitText(A, 'Negozi nel database'); await shot(A, '13_menu_admin');
const I = await newPage(414, 896, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1');
await waitText(I, 'Accedi'); await fill(I, { email: 'luca@test.it', password: 'venditore1' }); await clickText(I, 'Accedi');
await waitText(I, 'negozi trovati', 120000); await sleep(1500); await I.evaluate(() => document.querySelector('details') && (document.querySelector('details').open = false)); await sleep(300); await shot(I, '10_iphone11_pwa_lista');
await I.evaluate(id => (location.hash = '#/shop/' + encodeURIComponent(id)), shopId); await waitText(I, 'Salva'); await sleep(500); await shot(I, '11_iphone11_pwa_scheda');
const man = await I.evaluate(async () => (await fetch('./manifest.webmanifest')).ok && !!document.querySelector('link[rel=apple-touch-icon]'));
log('manifest + apple-touch-icon:', man);
await browser.close();
console.log('E2E OK');
