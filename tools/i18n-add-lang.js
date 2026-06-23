// Сборка словаря языка в js/lang/<code>.js из JSON { "ru": "translation" }.
// Запуск: node tools/i18n-add-lang.js <code> <translations.json>
const fs = require('fs');
const codeArg = process.argv[2];
const jsonPath = process.argv[3];
if (!codeArg || !jsonPath) { console.error('usage: node tools/i18n-add-lang.js <code> <translations.json>'); process.exit(1); }
const src = fs.readFileSync('js/i18n.js', 'utf8');
global.window = {};
eval(src.replace(/document\./g, '({}).') + '\nglobal.__I18N = I18N;');
const EN = global.__I18N.en;
const base = Object.keys(EN);
const dict = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const missing = base.filter((k) => !(k in dict) || dict[k] === '');
const extra = Object.keys(dict).filter((k) => !(k in EN));
// собрать файл строго в порядке ключей эталона
const lines = base.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k] != null && dict[k] !== '' ? dict[k] : EN[k])},`);
const out = `// Локализация: ${codeArg}. Автособрано из перевода (ключи = русский исходник).\n// Незаполненные строки временно равны английскому. Порядок ключей = эталон en.\nI18N.${codeArg} = {\n${lines.join('\n')}\n};\n`;
fs.mkdirSync('js/lang', { recursive: true });
fs.writeFileSync(`js/lang/${codeArg}.js`, out);
console.log(`js/lang/${codeArg}.js собран: ${base.length} ключей, не переведено ${missing.length}, лишних в JSON ${extra.length}`);
if (missing.length) console.log('НЕ ПЕРЕВЕДЕНО (первые 20):\n' + missing.slice(0, 20).map((k) => '  ' + k).join('\n'));
