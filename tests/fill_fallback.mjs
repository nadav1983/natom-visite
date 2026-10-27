// Verifica: import di un Excel SENZA colonna "colore" ma con righe colorate -> il colore viene letto dal riempimento
import XLSX from 'xlsx-js-style';
import { parseWorkbook } from '../src/excel.js';
const aoa = [['ragione_sociale','citta'],['Neg A','Savona'],['Neg B','Genova'],['Neg C','Imperia']];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws.A2.s = { fill: { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } } };
ws.A3.s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } } };
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Lead');
const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
const { rows } = parseWorkbook(buf);
console.log(rows);
if (rows[0].colore !== 'verde chiaro' && rows[0].colore !== 'verde') throw new Error('fallback fallito');
console.log('FILL FALLBACK OK');
