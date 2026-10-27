import XLSX from 'xlsx-js-style';
import { ORIG_COLS, VISIT_COLS, META_COLS, ALL_COLS, COLORI, coloreById, coloreByHex } from './schema.js';

export function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function nowStamp() { const d = new Date(); return today() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

// Legge un .xlsx (ArrayBuffer) -> array di oggetti con le colonne note
export function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellStyles: true });
  const name = wb.SheetNames.find(n => n.toLowerCase() === 'lead') || wb.SheetNames[0];
  const sh = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json(sh, { header: 1, raw: true, defval: null, blankrows: true });
  if (!aoa.length) return { rows: [], columns: [], unknown: [] };
  const header = aoa[0].map(h => String(h ?? '').trim().toLowerCase());
  const map = header.map(h => (ALL_COLS.includes(h) ? h : null));
  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]; const o = {}; let any = false;
    map.forEach((c, j) => {
      if (!c) return; let v = r[j];
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      if (v === null || v === undefined || String(v).trim() === '') return;
      o[c] = String(v); any = true;
    });
    if (any && !o.colore) { // nessuna colonna colore: provo a leggere il colore di riempimento della prima cella
      const cell = sh[XLSX.utils.encode_cell({ r: i, c: 0 })];
      const rgb = cell && cell.s && (cell.s.fgColor?.rgb || cell.s.fill?.fgColor?.rgb);
      const col = rgb && coloreByHex(rgb); if (col) o.colore = col.id;
    }
    if (any && o.colore) { const c = COLORI.find(x => x.id === String(o.colore).toLowerCase().trim() || x.nome.toLowerCase() === String(o.colore).toLowerCase().trim()); if (c) o.colore = c.id; }
    if (any) rows.push(o);
  }
  return { rows, columns: header.filter((h, j) => map[j]), unknown: header.filter((h, j) => !map[j] && h) };
}

function countBy(rows, f) { const m = new Map(); for (const r of rows) { const k = f(r) || '(vuota)'; m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); }

export function buildWorkbook(rows, who, legenda = {}) {
  const aoa = [ALL_COLS, ...rows.map(r => ALL_COLS.map(c => (c === 'id_app' ? r._id : r[c]) ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const hs = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1F2A44' } }, alignment: { vertical: 'center' } };
  ALL_COLS.forEach((c, j) => { const a = XLSX.utils.encode_cell({ r: 0, c: j }); if (ws[a]) ws[a].s = hs; });
  rows.forEach((r, i) => {
    const col = coloreById(r.colore); if (!col) return;
    const st = { fill: { patternType: 'solid', fgColor: { rgb: col.hex } } };
    ALL_COLS.forEach((c, j) => { const a = XLSX.utils.encode_cell({ r: i + 1, c: j }); if (!ws[a]) ws[a] = { t: 's', v: '' }; ws[a].s = st; });
  });
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!cols'] = ALL_COLS.map(c => ({ wch: { ragione_sociale: 34, indirizzo: 40, note_visita: 50, email: 30, sito: 30, whatsapp_link: 30, prossimo_passo: 30 }[c] || 16 }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: ALL_COLS.length - 1 } }) };
  const vis = rows.filter(r => r.visitato === 'sì').length;
  const R = [['Metrica', 'Valore'], ['Totale righe', rows.length], ['Visitati', vis], ['Da visitare', rows.length - vis],
    ['Con WhatsApp', rows.filter(r => r.whatsapp || r.whatsapp_link).length], ['Con email', rows.filter(r => r.email).length],
    ['Con sito', rows.filter(r => r.sito).length], ['Colorati', rows.filter(r => r.colore).length], ['Modificati oggi', rows.filter(r => (r.ultima_modifica || '').startsWith(today())).length],
    ['Esportato il', nowStamp()], ['Esportato da', who || ''], [], ['esito', 'count'], ...countBy(rows.filter(r => r.visitato === 'sì'), r => r.esito),
    [], ['colore', 'count'], ...countBy(rows.filter(r => r.colore), r => r.colore + ' (' + (legenda[r.colore] || coloreById(r.colore)?.leg || '') + ')'), [], ['categoria', 'count'], ...countBy(rows, r => r.categoria), [], ['stato', 'count'], ...countBy(rows, r => r.stato),
    [], ['provincia', 'count'], ...countBy(rows, r => r.provincia)];
  const ws2 = XLSX.utils.aoa_to_sheet(R); ws2['!cols'] = [{ wch: 28 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lead');
  XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo');
  const LG = [['colore', 'significato'], ...COLORI.map(c => [c.id, legenda[c.id] || c.leg])];
  const ws3 = XLSX.utils.aoa_to_sheet(LG); ws3['!cols'] = [{ wch: 16 }, { wch: 36 }];
  ['A1', 'B1'].forEach(a => (ws3[a].s = hs));
  COLORI.forEach((c, i) => ['A', 'B'].forEach(L => (ws3[L + (i + 2)].s = { fill: { patternType: 'solid', fgColor: { rgb: c.hex } } })));
  XLSX.utils.book_append_sheet(wb, ws3, 'Legenda');
  return wb;
}
export function workbookBase64(wb) { return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }); }
export function workbookArray(wb) { return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); }
export { ORIG_COLS, VISIT_COLS, META_COLS };
