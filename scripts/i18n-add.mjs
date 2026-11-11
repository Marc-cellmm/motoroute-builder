// Afegeix traduccions noves: node scripts/i18n-add.mjs fitxer.json
// Format: { "Text en català": { "es": "…", "en": "…", … } }
import fs from 'node:fs';
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
const dir = 'src/i18n/locales/';
for (const f of fs.readdirSync(dir)) {
  const code = f.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
  for (const [src, tr] of Object.entries(add)) {
    if (!tr[code]) { console.warn(`falta ${code}: ${src}`); continue; }
    if (vars(src) !== vars(tr[code])) throw new Error(`variables diferents (${code}): ${src}`);
    d[hash(src)] = tr[code];
  }
  fs.writeFileSync(dir + f, JSON.stringify(d, null, 1) + '\n');
}
console.log('fet');
