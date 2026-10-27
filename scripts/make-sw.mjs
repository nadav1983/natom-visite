// Genera dist/sw.js con l'elenco dei file da tenere offline (eseguito dopo vite build)
import fs from 'fs'; import path from 'path';
const dist = 'dist'; const files = [];
const walk = d => fs.readdirSync(d).forEach(f => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push('./' + path.relative(dist, p).split(path.sep).join('/')); });
walk(dist);
const list = files.filter(f => !f.endsWith('sw.js') && !f.includes('icon-1024'));
const ver = 'nv-' + Date.now();
fs.writeFileSync(path.join(dist, 'sw.js'), `// Service worker Natom Visite (offline)
const CACHE='${ver}';const FILES=${JSON.stringify(['./', ...list])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put('./',c));return r}).catch(()=>caches.match('./')));return}
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{const c=n.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return n})))});
`);
console.log('sw.js:', list.length, 'file');
