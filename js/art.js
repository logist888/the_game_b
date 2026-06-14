/*
 * Процедурная графика «Вавилон» — SVG, генерируемый в коде (без файлов).
 * Даёт фоны 12 миров, аватары мобов и иконки предметов.
 * Всё детерминировано по имени, поэтому картинки стабильны между перезагрузками.
 */

// детерминированный хеш строки -> seed
function artHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// генератор псевдослучайных по seed (mulberry32)
function artRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// HSL -> HEX (надёжнее hsl(): работает во всех браузерах и SVG-рендерерах)
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (n) => Math.round(255 * f(n)).toString(16).padStart(2, '0');
  return `#${to(0)}${to(8)}${to(4)}`;
}

// ----------------------------------------------------------------------------
// Темы миров (по индексу в WORLDS): палитра + тип сцены
// ----------------------------------------------------------------------------
const WORLD_THEMES = [
  { type:'plains', sky:['#86c5e8','#cdeaf2'], ground:'#5fa64a', accent:'#3d7a2e' }, // Равнинный
  { type:'forest', sky:['#7bb0c9','#b7dbe0'], ground:'#2f6b34', accent:'#1d4a25' }, // Лесной
  { type:'cave',   sky:['#241f33','#3a2f4a'], ground:'#1a1622', accent:'#6f55a8' }, // Подземный
  { type:'mountain',sky:['#9fc0d8','#dfeef5'], ground:'#7d8794', accent:'#566069' },// Горный
  { type:'desert', sky:['#f3cd86','#fbeec2'], ground:'#e0b465', accent:'#b9893d' }, // Пустынный
  { type:'swamp',  sky:['#5d6e52','#9aaa7e'], ground:'#3c4a30', accent:'#6b7a3a' }, // Болотный
  { type:'water',  sky:['#4f93c4','#a9d6ec'], ground:'#1f5d86', accent:'#0f3d5e' }, // Водный
  { type:'dead',   sky:['#2a2536','#4a4258'], ground:'#26222e', accent:'#8a7fb0' }, // Царство мёртвых
  { type:'lava',   sky:['#3a1410','#702517'], ground:'#1e0d0a', accent:'#ff6a2b' }, // Лавяной
  { type:'sky',    sky:['#6fa9e0','#cfe6fb'], ground:'#9cc5ee', accent:'#ffffff' }, // Небесный
  { type:'hell',   sky:['#2a0a0a','#5a1410'], ground:'#160606', accent:'#ff3b1f' }, // Ад
  { type:'heaven', sky:['#f4e6c0','#fffcee'], ground:'#efe0b0', accent:'#e7c75a' }, // Рай
];
function worldTheme(i) { return WORLD_THEMES[i] || WORLD_THEMES[0]; }

// ----------------------------------------------------------------------------
// Фон-баннер мира (320x120)
// ----------------------------------------------------------------------------
function worldBgSvg(worldIndex, locName) {
  const t = worldTheme(worldIndex);
  const rng = artRng(artHash((WORLDS[worldIndex] ? WORLDS[worldIndex].name : '') + '|' + (locName || '')));
  const W = 320, H = 120;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="art-bg" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">`;
  s += `<defs><linearGradient id="sky${worldIndex}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${t.sky[0]}"/><stop offset="1" stop-color="${t.sky[1]}"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#sky${worldIndex})"/>`;

  // небесное тело
  if (['lava','hell','dead'].includes(t.type)) s += `<circle cx="${60 + rng() * 200}" cy="28" r="14" fill="#ffd27a" opacity="0.5"/>`;
  else if (t.type === 'heaven') s += `<circle cx="160" cy="40" r="30" fill="#fff7d6" opacity="0.8"/>`;
  else s += `<circle cx="${50 + rng() * 60}" cy="26" r="12" fill="#fff4cf" opacity="0.85"/>`;

  // фоновый слой по типу сцены
  const horizon = 78;
  switch (t.type) {
    case 'mountain': case 'cave':
      for (let i = 0; i < 4; i++) { const x = i * 90 - 20; s += `<polygon points="${x},${horizon} ${x + 50},${30 + rng() * 20} ${x + 100},${horizon}" fill="${t.accent}" opacity="${0.5 + i * 0.1}"/>`; }
      break;
    case 'forest': case 'plains': case 'swamp':
      for (let i = 0; i < 7; i++) { const x = rng() * W, hh = 14 + rng() * 18; s += `<polygon points="${x},${horizon} ${x - 8},${horizon - hh} ${x + 8},${horizon - hh}" fill="${t.accent}"/><rect x="${x - 1.5}" y="${horizon - 6}" width="3" height="8" fill="#4b3318"/>`; }
      break;
    case 'water':
      for (let i = 0; i < 5; i++) s += `<path d="M0 ${horizon + i * 8} q 30 -6 60 0 t 60 0 t 60 0 t 60 0 t 60 0" stroke="${t.accent}" fill="none" opacity="0.5"/>`;
      break;
    case 'desert':
      s += `<path d="M0 ${horizon} q 80 -20 160 0 t 160 0 V${H} H0 Z" fill="${t.accent}" opacity="0.6"/>`;
      break;
    case 'lava': case 'hell':
      for (let i = 0; i < 6; i++) { const x = rng() * W; s += `<polygon points="${x},${H} ${x - 10},${horizon + rng() * 20} ${x + 10},${horizon}" fill="${t.accent}" opacity="0.4"/>`; }
      break;
    case 'sky': case 'heaven':
      for (let i = 0; i < 5; i++) { const x = rng() * W, y = 30 + rng() * 50; s += `<ellipse cx="${x}" cy="${y}" rx="${20 + rng() * 20}" ry="9" fill="#ffffff" opacity="0.7"/>`; }
      break;
  }

  // земля
  s += `<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="${t.ground}"/>`;
  if (t.type === 'cave') s += `<rect width="${W}" height="${H}" fill="#000" opacity="0.25"/>`;
  s += `</svg>`;
  return s;
}

// ----------------------------------------------------------------------------
// Аватар моба (100x100)
// ----------------------------------------------------------------------------
function mobArtSvg(name, opts) {
  opts = opts || {};
  const rng = artRng(artHash(name));
  const hue = Math.floor(rng() * 360);
  const body = hslHex(hue, 55, opts.boss ? 42 : 50);
  const dark = hslHex(hue, 55, 28);
  const skin = hslHex(hue, 40, 62);
  let s = `<svg viewBox="0 0 100 100" class="art-mob" xmlns="http://www.w3.org/2000/svg">`;

  if (opts.boss) s += `<circle cx="50" cy="52" r="44" fill="${body}" opacity="0.25"/>`;

  // тело
  const bw = 30 + rng() * 14;
  s += `<ellipse cx="50" cy="60" rx="${bw}" ry="${26 + rng() * 8}" fill="${body}"/>`;
  // голова
  const hr = 16 + rng() * 8;
  s += `<circle cx="50" cy="${36 - rng() * 4}" r="${hr}" fill="${skin}"/>`;

  // признаки по ключевым словам
  const n = name;
  const isDragon = /дракон|виверна|грифон|гидра|феникс/i.test(n);
  const isUndead = /скелет|зомби|лич|призрак|смерть|вампир|гуль|кость/i.test(n);
  const isCaster = /маг|некромант|чернокнижник|ведьм|джинн|фея|дриад|шива|элементал|дух/i.test(n);
  const isBeast = /волк|медвед|тигр|вепрь|лось|кабан|пёс|цербер|оборотень/i.test(n);

  // крылья для летающих
  if (isDragon || /гарпия|ворон|орёл|нетопырь|летучая|бес|демон|архангел|пегас/i.test(n)) {
    s += `<path d="M30 50 Q5 30 8 60 Q20 58 30 62 Z" fill="${dark}"/>`;
    s += `<path d="M70 50 Q95 30 92 60 Q80 58 70 62 Z" fill="${dark}"/>`;
  }
  // рога для демонов/зверей/боссов
  if (isDragon || isBeast || opts.boss || /демон|дьявол|минотавр|тролль|чёрт|бес/i.test(n)) {
    s += `<polygon points="40,24 36,8 45,22" fill="${dark}"/><polygon points="60,24 64,8 55,22" fill="${dark}"/>`;
  }
  // колпак мага
  if (isCaster) s += `<polygon points="50,2 38,30 62,30" fill="${dark}"/><circle cx="50" cy="4" r="3" fill="#ffe06a"/>`;

  // глаза (1-3)
  const eyes = isUndead ? 2 : 1 + Math.floor(rng() * 3);
  const ey = 34 - (isCaster ? 0 : rng() * 2);
  const eyeColor = isUndead ? '#ff5a3c' : (opts.boss ? '#ffd24a' : '#fff');
  if (eyes === 1) s += eye(50, ey, eyeColor);
  else if (eyes === 2) { s += eye(43, ey, eyeColor) + eye(57, ey, eyeColor); }
  else { s += eye(40, ey, eyeColor) + eye(50, ey - 6, eyeColor) + eye(60, ey, eyeColor); }

  // пасть/зубы для зверей и нежити
  if (isBeast || isUndead || isDragon) {
    s += `<rect x="42" y="44" width="16" height="5" fill="${dark}"/>`;
    s += `<polygon points="44,44 46,50 48,44" fill="#fff"/><polygon points="52,44 54,50 56,44" fill="#fff"/>`;
  }
  // лапки
  s += `<rect x="38" y="84" width="7" height="12" rx="3" fill="${dark}"/><rect x="55" y="84" width="7" height="12" rx="3" fill="${dark}"/>`;

  if (opts.boss) s += `<text x="84" y="20" font-size="18">👑</text>`;
  s += `</svg>`;
  return s;
}
function eye(x, y, c) { return `<circle cx="${x}" cy="${y}" r="5" fill="${c}"/><circle cx="${x}" cy="${y}" r="2" fill="#1a1008"/>`; }

// ----------------------------------------------------------------------------
// Иконка предмета (100x100)
// ----------------------------------------------------------------------------
function itemArtSvg(it) {
  const wrap = (inner) => `<svg viewBox="0 0 100 100" class="art-item" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  const steel = '#b9c2cc', steelD = '#7d8893', wood = '#8a5a2b', gold = '#e7c14a', leath = '#9a6b3a';
  const name = (it.name || '').toLowerCase();

  if (it.type === 'оружие') {
    if (name.includes('лук')) return wrap(`<path d="M30 15 Q70 50 30 85" stroke="${wood}" stroke-width="6" fill="none"/><line x1="30" y1="15" x2="30" y2="85" stroke="#ddd" stroke-width="1.5"/><line x1="30" y1="50" x2="78" y2="50" stroke="#ccc" stroke-width="1.5"/><polygon points="78,50 70,46 70,54" fill="${steelD}"/>`);
    if (name.includes('посох')) return wrap(`<line x1="38" y1="90" x2="58" y2="20" stroke="${wood}" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="16" r="10" fill="${gold}"/><circle cx="60" cy="16" r="5" fill="#7fd0ff"/>`);
    if (name.includes('топор')) return wrap(`<line x1="50" y1="20" x2="50" y2="92" stroke="${wood}" stroke-width="6"/><path d="M50 22 Q82 26 78 52 Q60 46 50 48 Z" fill="${steel}" stroke="${steelD}"/>`);
    if (name.includes('булав')) return wrap(`<line x1="50" y1="40" x2="50" y2="92" stroke="${wood}" stroke-width="6"/><circle cx="50" cy="30" r="16" fill="${steel}" stroke="${steelD}"/><g fill="${steelD}"><rect x="48" y="10" width="4" height="8"/><rect x="48" y="42" width="4" height="8"/><rect x="30" y="28" width="8" height="4"/><rect x="62" y="28" width="8" height="4"/></g>`);
    if (name.includes('копь')) return wrap(`<line x1="50" y1="30" x2="50" y2="92" stroke="${wood}" stroke-width="5"/><polygon points="50,8 42,32 58,32" fill="${steel}" stroke="${steelD}"/>`);
    if (name.includes('диск')) return wrap(`<circle cx="50" cy="50" r="34" fill="${steel}" stroke="${steelD}" stroke-width="3"/><circle cx="50" cy="50" r="8" fill="#1a1008"/><g fill="${steelD}"><polygon points="50,10 46,22 54,22"/><polygon points="90,50 78,46 78,54"/><polygon points="50,90 46,78 54,78"/><polygon points="10,50 22,46 22,54"/></g>`);
    // меч/кинжал по умолчанию
    const len = name.includes('кинжал') ? 40 : 64;
    return wrap(`<rect x="46" y="${86 - len}" width="8" height="${len}" rx="2" fill="${steel}" stroke="${steelD}"/><polygon points="46,${86 - len} 54,${86 - len} 50,${78 - len}" fill="${steel}"/><rect x="34" y="84" width="32" height="6" rx="2" fill="${gold}"/><rect x="46" y="88" width="8" height="10" rx="2" fill="${wood}"/>`);
  }

  if (it.type === 'броня') {
    if (it.slot === 'shield') return wrap(`<path d="M50 12 L84 24 V54 Q84 82 50 92 Q16 82 16 54 V24 Z" fill="${steel}" stroke="${steelD}" stroke-width="3"/><path d="M50 22 L74 30 V54 Q74 74 50 82 Z" fill="${steelD}" opacity="0.4"/>`);
    if (it.slot === 'head') return wrap(`<path d="M26 56 Q26 24 50 24 Q74 24 74 56 L74 64 L26 64 Z" fill="${steel}" stroke="${steelD}" stroke-width="3"/><rect x="46" y="30" width="8" height="34" fill="${steelD}"/>`);
    // body
    return wrap(`<path d="M30 26 L50 34 L70 26 L82 40 L72 50 L72 86 L28 86 L28 50 L18 40 Z" fill="${steel}" stroke="${steelD}" stroke-width="3"/><line x1="50" y1="34" x2="50" y2="86" stroke="${steelD}" stroke-width="2"/>`);
  }

  if (it.type === 'бижутерия') {
    if (it.slot === 'ring') return wrap(`<circle cx="50" cy="58" r="26" fill="none" stroke="${gold}" stroke-width="8"/><polygon points="50,18 40,34 60,34" fill="#7fd0ff"/><polygon points="50,18 40,34 50,34" fill="#bfeaff"/>`);
    if (it.slot === 'earring') return wrap(`<g><circle cx="35" cy="30" r="9" fill="none" stroke="${gold}" stroke-width="4"/><polygon points="35,40 28,58 42,58" fill="#9b6bd0"/></g><g><circle cx="65" cy="30" r="9" fill="none" stroke="${gold}" stroke-width="4"/><polygon points="65,40 58,58 72,58" fill="#9b6bd0"/></g>`);
    // amulet
    return wrap(`<path d="M30 24 Q50 40 70 24" fill="none" stroke="${gold}" stroke-width="4"/><circle cx="50" cy="60" r="20" fill="${gold}"/><circle cx="50" cy="60" r="11" fill="#ff5a8a"/>`);
  }

  // бутылки: эликсир/зелье/мазь
  const liquid = it.type === 'зелье' ? '#5fbf4a' : it.type === 'мазь' ? '#e7c14a'
    : (it.use && it.use.mana ? '#4f93e8' : '#d34a4a');
  return wrap(`<rect x="42" y="14" width="16" height="12" fill="${steelD}"/><path d="M40 28 Q40 40 32 50 L32 84 Q32 92 40 92 L60 92 Q68 92 68 84 L68 50 Q60 40 60 28 Z" fill="#cfe7ef" stroke="#9bb3bd" stroke-width="2"/><path d="M34 58 L66 58 L66 84 Q66 90 60 90 L40 90 Q34 90 34 84 Z" fill="${liquid}"/><ellipse cx="50" cy="58" rx="16" ry="3" fill="#fff" opacity="0.4"/>`);
}

// иконка ресурса в виде эмодзи остаётся в data.js; здесь — баннер башни
function towerArtSvg() {
  return `<svg viewBox="0 0 320 120" class="art-bg" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="towerSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3a5a"/><stop offset="1" stop-color="#caa86a"/></linearGradient></defs>
    <rect width="320" height="120" fill="url(#towerSky)"/>
    <circle cx="250" cy="30" r="16" fill="#ffe9b0" opacity="0.8"/>
    ${[0,1,2,3,4].map((i) => { const w = 120 - i * 18, x = 160 - w / 2, y = 96 - i * 18; return `<rect x="${x}" y="${y}" width="${w}" height="20" fill="#b08a4f" stroke="#6e5226"/>`; }).join('')}
    <polygon points="160,6 150,24 170,24" fill="#8a6a36"/>
    <rect x="0" y="112" width="320" height="8" fill="#5a4424"/>
  </svg>`;
}

// ============================================================================
// Загрузчик реальных артов: PNG поверх процедурной SVG-заглушки.
// Если файл картинки есть в img/... — он показывается; если нет (onerror) —
// остаётся SVG. Имена файлов совпадают с babylon/ART_PROMPTS.md.
// ============================================================================
const ART_TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',' ':'_','-':'_' };
function artSlug(s) {
  return String(s).toLowerCase().split('').map((c) => (ART_TRANSLIT[c] !== undefined ? ART_TRANSLIT[c] : (/[a-z0-9_]/.test(c) ? c : '')))
    .join('').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function itemImgPath(it) {
  let prefix = 'item';
  if (it.slot === 'weapon') prefix = 'weapon';
  else if (['head', 'body', 'shield'].includes(it.slot)) prefix = 'armor';
  else if (['ring', 'amulet', 'earring'].includes(it.slot)) prefix = 'jewelry';
  else if (['эликсир', 'зелье', 'мазь'].includes(it.type)) prefix = 'potion';
  return `img/items/${prefix}_${artSlug(it.name)}`;
}

// обёртка: SVG-заглушка снизу, картинка сверху. Пробуем расширения по порядку
// (exts), если ни одного файла нет — остаётся SVG-заглушка.
function artFrame(base, svg, cls, exts) {
  exts = exts || ['png', 'jpg'];
  const rest = exts.slice(1).join(',');
  return `<span class="artframe ${cls || ''}">${svg}<img alt="" loading="lazy" src="${base}.${exts[0]}" data-base="${base}" data-exts="${rest}" onerror="artImgFallback(this)"></span>`;
}
function artImgFallback(img) {
  const rest = (img.dataset.exts || '').split(',').filter(Boolean);
  if (rest.length) { img.dataset.exts = rest.slice(1).join(','); img.src = img.dataset.base + '.' + rest[0]; }
  else img.remove();
}

// Публичные функции, которые вызывает ui.js (картинка с фолбэком на SVG).
// Фоны/башня сейчас в .jpg (оптимизированы) — пробуем jpg первым;
// мобы/предметы из ChatGPT обычно .png — для них png первым.
function worldBg(i, loc) {
  const name = WORLDS[i] ? WORLDS[i].name : '';
  const base = `img/worlds/world_${String(i + 1).padStart(2, '0')}_${artSlug(name)}`;
  return artFrame(base, worldBgSvg(i, loc), 'af-bg', ['jpg', 'png']);
}
function mobArt(name, opts) {
  const base = String(name).replace(' ⭐', '');
  return artFrame(`img/mobs/${artSlug(base)}`, mobArtSvg(name, opts), 'af-mob', ['jpg', 'png']);
}
function itemArt(it) { return artFrame(itemImgPath(it), itemArtSvg(it), 'af-item', ['jpg', 'png']); }
function towerArt() { return artFrame('img/tower/banner', towerArtSvg(), 'af-bg', ['jpg', 'png']); }
// иконка здания башни: картинка (если есть) поверх эмодзи
function buildingArt(name, emoji) {
  return artFrame(`img/tower/${artSlug(name)}`, `<span class="bemoji">${emoji}</span>`, 'af-build', ['jpg', 'png']);
}
