// Экспорт ключей локализации: docs/translation-keys.md, i18n.skeleton.json, i18n.reference.tsv
// Запуск: node tools/i18n-export.js
const fs = require('fs');
const code = fs.readFileSync('js/i18n.js', 'utf8');
global.window = {};
eval(code.replace(/document\./g, '({}).') + '\nglobal.__I18N = I18N;');
const I18N = global.__I18N;
const EN = I18N.en;
const allKeys = Object.keys(EN);

// группировка по разделам // --- ... ---
const src = code.split('\n');
let section = '(прочее)'; const groups = {}; const order = []; let inEn = false; const seen = new Set();
const keyRe = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/g;
for (const line of src) {
  if (/^\s*en:\s*\{/.test(line)) { inEn = true; continue; }
  if (!inEn) continue;
  const sec = line.match(/\/\/\s*---\s*(.+?)\s*---/);
  if (sec) { section = sec[1]; if (!groups[section]) { groups[section] = []; order.push(section); } continue; }
  let m;
  while ((m = keyRe.exec(line))) {
    let k = m[1]; const q = k[0];
    k = k.slice(1, -1).replace(new RegExp('\\\\' + q, 'g'), q).replace(/\\\\/g, '\\');
    if (!(k in EN) || seen.has(k)) continue; seen.add(k);
    if (!groups[section]) { groups[section] = []; order.push(section); }
    groups[section].push(k);
  }
}
const missing = allKeys.filter((k) => !seen.has(k));
if (missing.length) { if (!groups['(прочее)']) { groups['(прочее)'] = []; order.push('(прочее)'); } missing.forEach((k) => groups['(прочее)'].push(k)); }

const md = [`# Список элементов для перевода\n\nИсточник — русский. Всего ключей: **${allKeys.length}**, разделов: **${order.length}**.\nИмеющиеся языки: ${Object.keys(I18N).join(', ')}.\n`];
const tsv = ['key_ru\ten'];
for (const s of order) {
  const arr = groups[s] || []; if (!arr.length) continue;
  md.push(`\n## ${s}  (${arr.length})`);
  arr.forEach((k) => { md.push('- `' + k.replace(/\n/g, ' ⏎ ') + '`'); tsv.push(`${k.replace(/\t/g, ' ').replace(/\n/g, '\\n')}\t${(EN[k] || '').replace(/\t/g, ' ').replace(/\n/g, '\\n')}`); });
}
fs.writeFileSync('docs/translation-keys.md', md.join('\n') + '\n');
fs.writeFileSync('docs/i18n.reference.tsv', tsv.join('\n') + '\n');
const skel = {}; allKeys.forEach((k) => skel[k] = '');
fs.writeFileSync('docs/i18n.skeleton.json', JSON.stringify(skel, null, 2) + '\n');
console.log(`OK: ${allKeys.length} ключей, ${order.length} разделов → docs/translation-keys.md, docs/i18n.reference.tsv, docs/i18n.skeleton.json`);
