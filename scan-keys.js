// Ищет в коде ключи (t/tp/L/pushLog/clog/showToast/confirm), которых нет в словаре языка.
// Запуск: node scan-keys.js <lang>
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/i18n.js', 'utf8').replace(/document\./g, '({}).') + '\nglobal.__I18N = I18N;');
const I18N = global.__I18N; const lang = process.argv[2] || 'en';
if (lang !== 'en' && fs.existsSync(`js/lang/${lang}.js`)) eval(fs.readFileSync(`js/lang/${lang}.js`, 'utf8'));
const dict = I18N[lang] || {};
const files = ['js/game.js', 'js/ui.js', 'js/state.js', 'js/combat.js', 'js/encyclopedia.js'];
const miss = new Set();
for (const f of files) { const s = fs.readFileSync(f, 'utf8');
  const re = /\b(pushLog|clog|L|tp|showToast|confirm)\(\s*'((?:[^'\\]|\\.)*)'/g; let m;
  while ((m = re.exec(s))) { const k = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (k && /[А-Яа-яЁё]/.test(k) && !(k in dict)) miss.add(k); } }
console.log(`${lang}: непереведённых в коде — ${miss.size}`);
[...miss].forEach((k) => console.log('  ' + k));
