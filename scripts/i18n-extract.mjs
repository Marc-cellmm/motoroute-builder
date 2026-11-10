// Llista tots els textos t("…") de l'app → src/i18n/catalog.json (base per traduir).
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'node:fs';
const hashKey = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const project = new Project({ compilerOptions: { jsx: 4 } });
project.addSourceFilesAtPaths('src/**/*.{ts,tsx}');
const seen = new Map();
for (const sf of project.getSourceFiles()) {
  if (/\/i18n\//.test(sf.getFilePath())) continue;
  sf.forEachDescendant((n) => {
    if (n.getKind() !== SyntaxKind.CallExpression) return;
    const callee = n.getExpression().getText();
    if (callee !== 't' && callee !== 'tr') return;
    const a = n.getArguments()[0];
    if (!a || (a.getKind() !== SyntaxKind.StringLiteral && a.getKind() !== SyntaxKind.NoSubstitutionTemplateLiteral)) return;
    const s = a.getLiteralText();
    if (!seen.has(s)) seen.set(s, sf.getBaseName());
  });
}
const out = [...seen].map(([s, f]) => ({ k: hashKey(s), s, f }));
const keys = new Set(out.map((o) => o.k));
if (keys.size !== out.length) throw new Error('col·lisió de hash');
fs.writeFileSync('src/i18n/catalog.json', JSON.stringify(out, null, 1));
console.log(out.length, 'textos ·', out.reduce((a, o) => a + o.s.length, 0), 'caràcters');
