// Проверка полноты словаря языка против эталона en. Запуск: node check-i18n.js <lang>
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/i18n.js', 'utf8').replace(/document\./g, '({}).') + '\nglobal.__I18N = I18N;');
const I18N = global.__I18N;
const lang = process.argv[2] || 'en';
const langФайл = `js/lang/${lang}.js`;
if (lang !== 'en' && fs.existsSync(langФайл)) eval(fs.readFileSync(langФайл, 'utf8'));
const base = Object.keys(I18N.en);
const dict = I18N[lang] || {};
const missing = base.filter((k) => !(k in dict) || dict[k] === '');
const extra = Object.keys(dict).filter((k) => !(k in I18N.en));
console.log(`Язык ${lang}: всего ${base.length}, переведено ${base.length - missing.length}, не хватает ${missing.length}`);
if (missing.length) console.log('НЕ ПЕРЕВЕДЕНО:\n' + missing.map((k) => '  ' + k).join('\n'));
if (extra.length) console.log('ЛИШНИЕ (нет в эталоне):\n' + extra.map((k) => '  ' + k).join('\n'));
