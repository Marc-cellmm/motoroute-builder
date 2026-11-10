// Embolcalla amb t() els textos visibles de l'app (execució única, ajuda a la traducció).
import { Project, SyntaxKind, Node } from 'ts-morph';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const project = new Project({ compilerOptions: { jsx: 4 } });
project.addSourceFilesAtPaths(`${root}/src/**/*.{ts,tsx}`);

const SKIP_FILES = /(\/i18n\/|Icon\.tsx$|\/demo\/|\.test\.ts$|main\.tsx$|config\.ts$|theme\.ts$|bikes\.ts$|vite-env)/;
const SKIP_ATTR = new Set(['className', 'key', 'type', 'id', 'href', 'src', 'accept', 'autoComplete', 'inputMode', 'role', 'name', 'htmlFor', 'd', 'fill', 'stroke', 'viewBox', 'target', 'rel', 'lang', 'dir', 'step', 'min', 'max', 'pattern', 'value', 'icon', 'tab', 'mode', 'width', 'height', 'loading', 'engine']);
const SKIP_LIT = new Set(['FeatureCollection', 'Feature', 'Point', 'LineString', 'AbortError', 'MotoRoute', 'Noto Sans Bold', 'MotoRoute Builder', 'Builder', 'GPX', 'OK']);
const SKIP_CALLS = /^(localStorage\.\w+|.*querySelector\w*|.*addEventListener|fetch|console\.\w+|.*\.from|.*\.select|.*\.rpc|.*\.channel|.*\.on|.*\.once|.*\.eq|.*\.storage|document\.createElement|.*\.getItem|.*\.setItem|.*\.removeItem|t|new URL|.*\.toBlob|.*\.toLocaleString|.*\.toLocaleDateString|.*\.toLocaleTimeString|import|require|.*\.addLayer|.*\.addSource|.*\.getSource|.*\.setStyle|.*\.matchMedia)$/;

const looksText = (s) => {
  const v = s.trim();
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(v)) return false;
  if (SKIP_LIT.has(v)) return false;
  if (/^(https?:|\.{0,2}\/|#|data:|M\d)/.test(v)) return false;
  if (/^[a-z0-9_.\-\/:#,=()% ]+$/.test(v) && !/\s/.test(v)) return false; // identificadors, CSS, columnes
  if (/^\d[\d.\s]*(px|em|%)/.test(v)) return false;
  return /\s/.test(v) || /^[A-ZÀ-Ý]/.test(v) || /[àèéíïòóúüç·]/i.test(v);
};

let changed = 0;
for (const sf of project.getSourceFiles()) {
  const file = sf.getFilePath();
  if (SKIP_FILES.test(file)) continue;
  const edits = [];

  sf.forEachDescendant((n) => {
    const k = n.getKind();
    // 1) Text dins de JSX
    if (k === SyntaxKind.JsxText) {
      const raw = n.getText();
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(raw)) return;
      const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
      let [, lead, body, trail] = m;
      body = body.replace(/\s*\n\s*/g, ' ');
      if (!looksText(body) && !/[A-Za-zÀ-ÿ]{2,}/.test(body)) return;
      const L = lead && !lead.includes('\n') ? "{' '}" : lead;
      const T = trail && !trail.includes('\n') ? "{' '}" : trail;
      edits.push([n.getStart(), n.getEnd(), `${L}{t(${JSON.stringify(body)})}${T}`]);
      return;
    }
    // 2) Atributs JSX de text
    if (k === SyntaxKind.JsxAttribute) {
      const name = n.getNameNode().getText();
      const init = n.getInitializer();
      if (!init || init.getKind() !== SyntaxKind.StringLiteral || SKIP_ATTR.has(name) || /^on[A-Z]|^aria-(hidden|selected|modal|busy)$|^data-/.test(name)) return;
      const v = init.getLiteralText();
      if (!looksText(v)) return;
      edits.push([init.getStart(), init.getEnd(), `{t(${JSON.stringify(v)})}`]);
      return;
    }
    // 3) Literals de text al codi
    if (k === SyntaxKind.StringLiteral || k === SyntaxKind.NoSubstitutionTemplateLiteral) {
      const p = n.getParent();
      if (!p) return;
      const pk = p.getKind();
      if ([SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration, SyntaxKind.LiteralType, SyntaxKind.JsxAttribute, SyntaxKind.ElementAccessExpression, SyntaxKind.CaseClause, SyntaxKind.ExternalModuleReference].includes(pk)) return;
      if (pk === SyntaxKind.PropertyAssignment && p.getNameNode() === n) return;
      if (pk === SyntaxKind.BinaryExpression && /===|!==|==|!=/.test(p.getOperatorToken().getText())) return;
      if (pk === SyntaxKind.CallExpression || pk === SyntaxKind.NewExpression) {
        const callee = p.getExpression().getText();
        if (SKIP_CALLS.test(callee) || (pk === SyntaxKind.NewExpression && /URL|RegExp|Error\b/.test(callee) && !/Error/.test(callee))) return;
      }
      if (n.getFirstAncestorByKind(SyntaxKind.TypeReference) || n.getFirstAncestorByKind(SyntaxKind.TypeAliasDeclaration) || n.getFirstAncestorByKind(SyntaxKind.InterfaceDeclaration)) return;
      const v = n.getLiteralText();
      if (!looksText(v)) return;
      edits.push([n.getStart(), n.getEnd(), `t(${JSON.stringify(v)})`]);
      return;
    }
    // 4) Plantilles `text ${x} text`
    if (k === SyntaxKind.TemplateExpression) {
      const p = n.getParent();
      if (p && p.getKind() === SyntaxKind.TaggedTemplateExpression) return;
      if (p && p.getKind() === SyntaxKind.CallExpression && SKIP_CALLS.test(p.getExpression().getText())) return;
      const attr = n.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
      if (attr && SKIP_ATTR.has(attr.getNameNode().getText())) return;
      const head = n.getHead().getLiteralText();
      const spans = n.getTemplateSpans();
      const statics = [head, ...spans.map((s) => s.getLiteral().getLiteralText())].join(' ');
      if (!looksText(statics) || !/[A-Za-zÀ-ÿ]{3,}/.test(statics)) return;
      let pattern = head;
      const args = [];
      spans.forEach((s, i) => {
        pattern += `{${i}}` + s.getLiteral().getLiteralText();
        args.push(s.getExpression().getText());
      });
      edits.push([n.getStart(), n.getEnd(), `t(${JSON.stringify(pattern)}, [${args.join(', ')}])`]);
    }
  });

  if (!edits.length) continue;
  // aplica de darrere cap endavant i evita solapaments (plantilles dins plantilles)
  edits.sort((a, b) => b[0] - a[0]);
  let text = sf.getFullText();
  let lastStart = Infinity;
  for (const [s, e, r] of edits) {
    if (e > lastStart) continue;
    text = text.slice(0, s) + r + text.slice(e);
    lastStart = s;
  }
  const rel = path.relative(path.dirname(file), `${root}/src/i18n`).replace(/\\/g, '/');
  const imp = `import { t } from '${rel.startsWith('.') ? rel : './' + rel}';\n`;
  if (!/import \{[^}]*\bt\b[^}]*\} from '[^']*i18n'/.test(text)) {
    const lines = text.split('\n');
    let last = -1;
    lines.forEach((l, i) => { if (/^import /.test(l) || (last >= 0 && i === last + 1 && /^\s+.*from '/.test(l))) last = i; });
    // inserta després de l'últim import (incloent imports de diverses línies)
    let idx = 0;
    for (let i = 0; i < lines.length; i++) if (/^import .*;\s*$|^\} from '.*';\s*$/.test(lines[i])) idx = i + 1;
    lines.splice(idx, 0, imp.trimEnd());
    text = lines.join('\n');
  }
  sf.replaceWithText(text);
  changed++;
  console.log(path.relative(root, file), edits.length);
}
project.saveSync();
console.log('fitxers', changed);
