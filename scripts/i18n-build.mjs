// Converteix /tmp/i18n/<lang>.txt ("índex|traducció") en src/i18n/locales/<lang>.json, comprovant-ho tot.
import fs from 'node:fs';
const [, , code, src = `/tmp/i18n/${process.argv[2]}.txt`] = process.argv;
const catalog = JSON.parse(fs.readFileSync('src/i18n/catalog.json', 'utf8'));
const lines = fs.readFileSync(src, 'utf8').split('\n').filter((l) => /^\d+\|/.test(l));
const tr = new Map();
for (const l of lines) {
  const i = l.indexOf('|');
  tr.set(Number(l.slice(0, i)), l.slice(i + 1).replace(/\\n/g, '\n'));
}
const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
const tags = (s) => (s.match(/<\/?\w+>/g) ?? []).sort().join(',');
const out = {};
const problems = [];
catalog.forEach((o, i) => {
  const v = tr.get(i);
  if (v == null || v === '') { problems.push(`falta ${i}: ${o.s}`); return; }
  if (vars(v) !== vars(o.s)) problems.push(`variables ${i}: «${o.s}» → «${v}»`);
  if (tags(v) !== tags(o.s)) problems.push(`etiquetes ${i}: «${o.s}» → «${v}»`);
  if (/^\s/.test(o.s) !== /^\s/.test(v) && !['ary', 'zh'].includes(code)) problems.push(`espai inicial ${i}: «${o.s}» → «${v}»`);
  out[o.k] = v;
});
for (const k of tr.keys()) if (k >= catalog.length) problems.push(`índex sobrant ${k}`);
if (problems.length) { console.log(problems.slice(0, 40).join('\n')); console.log(problems.length, 'problemes'); process.exit(1); }
fs.writeFileSync(`src/i18n/locales/${code}.json`, JSON.stringify(out));
console.log(code, Object.keys(out).length, 'textos d\'acord');
