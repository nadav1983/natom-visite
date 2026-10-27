// Colonne: stesse dell'Excel originale (stesso ordine) + colonne visita + tracciamento
export const ORIG_COLS = ['ragione_sociale','categoria','citta','provincia','regione','indirizzo','telefono','whatsapp','whatsapp_link','email','sito','fonte','data_raccolta','stato'];
export const VISIT_COLS = ['visitato','data_visita','esito','referente','note_visita','prossimo_passo','data_ricontatto','colore'];
export const META_COLS = ['ultima_modifica','modificato_da','id_app']; // id_app: codice interno per il re-import (non modificare)
export const ALL_COLS = [...ORIG_COLS, ...VISIT_COLS, ...META_COLS];
export const EDIT_COLS = [...ORIG_COLS, ...VISIT_COLS];

export const LABELS = {
  ragione_sociale: 'Nome negozio / Ragione sociale', categoria: 'Categoria', citta: 'Città', provincia: 'Provincia (sigla)',
  regione: 'Regione', indirizzo: 'Indirizzo', telefono: 'Telefono', whatsapp: 'WhatsApp (numero)', whatsapp_link: 'Link WhatsApp',
  email: 'Email', sito: 'Sito web', fonte: 'Fonte', data_raccolta: 'Data raccolta', stato: 'Stato',
  visitato: 'Visitato', data_visita: 'Data visita', esito: 'Esito', referente: 'Referente (nome persona)',
  note_visita: 'Note / commenti visita', prossimo_passo: 'Prossimo passo', data_ricontatto: 'Data ricontatto', colore: 'Colore',
  ultima_modifica: 'Ultima modifica', modificato_da: 'Modificato da',
};
export const ESITI = ['interessato','non interessato','richiamare','cliente','chiuso / non trovato'];
export const STATI_DEFAULT = ['nuovo','contattato','visitato','in trattativa','cliente','non interessato'];
export const CATEGORIE_DEFAULT = ['gioielleria','compro_oro','laboratorio_orafo','casa_asta_gioielli','fabbrica_orafo','fabbrica_orafo_valenza','monte_pegni'];

// Colori di marcatura (riga intera nell'Excel)
export const COLORI = [
  { id: 'rosso', leg: 'Non interessato', nome: 'Rosso', hex: 'FFC7CE', dot: '#e8737f' },
  { id: 'giallo', leg: 'Da richiamare / ripassare', nome: 'Giallo', hex: 'FFEB9C', dot: '#f2c94c' },
  { id: 'verde chiaro', leg: 'Cliente acquisito', nome: 'Verde', hex: 'C6EFCE', dot: '#6fcf8a' },
  { id: 'azzurro', leg: 'Interessato / da seguire', nome: 'Azzurro', hex: 'BDD7EE', dot: '#6fa8dc' },
  { id: 'rosa', leg: 'Visitato, titolare assente', nome: 'Rosa', hex: 'F8CBE0', dot: '#ef8fbf' },
];
export const LEGENDA_DEFAULT = Object.fromEntries(COLORI.map(c => [c.id, c.leg]));
export const coloreById = id => COLORI.find(c => c.id === id);
export const coloreByHex = hex => COLORI.find(c => c.hex === String(hex || '').toUpperCase().slice(-6));
