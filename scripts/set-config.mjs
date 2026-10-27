// Uso: node scripts/set-config.mjs config.json
// config.json = l'oggetto firebaseConfig copiato dalla console Firebase (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)
import fs from 'fs';
const raw = fs.readFileSync(process.argv[2], 'utf8');
// accetta sia JSON puro sia il blocco "const firebaseConfig = {...};" incollato dalla console
const obj = Function('"use strict";return (' + raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1) + ')')();
for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) if (!obj[k]) throw new Error('Manca ' + k);
const f = 'src/firebase-config.js';
let s = fs.readFileSync(f, 'utf8');
s = s.replace(/export const firebaseConfig = \{[\s\S]*?\};/, 'export const firebaseConfig = ' + JSON.stringify(obj, null, 2) + ';');
fs.writeFileSync(f, s);
fs.writeFileSync('.firebaserc', JSON.stringify({ projects: { default: obj.projectId } }, null, 2));
console.log('Configurazione scritta per il progetto', obj.projectId);
