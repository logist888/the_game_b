/*
 * Интерфейс «Вавилон»: рендер Вавилонской башни, панелей зданий и боя.
 */

let activeView = 'tower';
let expedSel = { world: 0, loc: 0, diff: 100 };
let marketLots = [];
let marketLoaded = false;
let marketBusy = false;
let marketTab = 'buyItems';   // buyItems | sellItems | buyRes | sellRes
let marketGearTab = 'weapon'; // weapon | armor | jewelry
let marketCur = 'gold';       // валюта барахолки: gold (монеты) | souls (души)
let statsTab = 'equip';       // Покои героя: equip | bag | stats
let bagTab = 'weapon';        // подтаб рюкзака: weapon | armor | jewelry | consum
let councilTab = 'quests';    // Совет старейшин: quests | ach | fame
let shopTab = 'res';          // Магазин: res (за ресурсы) | souls (за души)
let premiumRarity = 'epic';   // премиум-лавка: выбранная рарность
let forgeTab = 'craft';       // Кузница сетов: craft (ковка) | reforge (перековка)
let clansList = [];
let clansLoaded = false;
let clanBusy = false;
let clanTab = 'overview'; // вкладка внутри клана: overview | raid | shop | upgrades | roster | log
function setClanTab(t) { clanTab = t; updateChatPoll(); render(); }
let chatWorld = [];
let chatClan = [];
let _chatTimer = null;
let arenaOpponents = []; // текущий список соперников арены (для индексного диспатча)
let combatSel = { target: 0, atkZone: 'торс', blockZone: 'голова', spell: '' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

// Босс по тем же ключевым словам, что и в combat.js (регистронезависимо).
function isBossName(n) {
  const l = String(n).toLowerCase();
  return typeof BOSS_WORDS !== 'undefined' && BOSS_WORDS.some((w) => l.includes(w.toLowerCase()));
}
// Имя моба с пометкой босса (⭐) для списков локаций.
function mobLabel(n) { return t(n) + (isBossName(n) ? ' ⭐' : ''); }

// Суммарный накопленный опыт (для таблицы зала славы): сумма требований
// всех пройденных уровней + текущий прогресс уровня.
function totalXp(level, xp) {
  let t = xp || 0;
  for (let l = 1; l < (level || 1); l++) t += xpNeed(l);
  return t;
}

function setView(v) { activeView = v; updateChatPoll(); render(); }

// --- Живые чаты (мир/клан): опрос каждые 5с, когда чат открыт ---
function updateChatPoll() {
  if (activeView === 'chat') startChatPoll('world');
  else if (activeView === 'clans' && clanTab === 'chat') startChatPoll('clan');
  else stopChatPoll();
}
function startChatPoll(kind) {
  stopChatPoll();
  const tick = kind === 'clan' ? loadClanChat : loadWorldChat;
  tick();
  _chatTimer = setInterval(tick, 5000);
}
function stopChatPoll() { if (_chatTimer) { clearInterval(_chatTimer); _chatTimer = null; } }

// Комнаты мирового чата: «Глобальный» + по одной на каждый язык (en первым).
// Язык сообщений НЕ проверяется — вкладка лишь выбирает комнату.
const CHAT_ROOMS = ['global', 'en', 'ru', 'es', 'de', 'fr', 'pt', 'it', 'zh', 'ja', 'ko', 'th'];
const CHAT_ROOM_FLAGS = { en: '🇬🇧', ru: '🇷🇺', es: '🇪🇸', de: '🇩🇪', fr: '🇫🇷', pt: '🇧🇷', it: '🇮🇹', zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷', th: '🇹🇭' };
let worldChatRoom = 'global';
function setWorldChatRoom(r) { if (CHAT_ROOMS.indexOf(r) < 0) r = 'global'; worldChatRoom = r; loadWorldChat(); render(); }

function chatMsgsHtml(list) {
  const myId = String((window.TG_USER && TG_USER.id) || '');
  const msgs = list || [];
  if (!msgs.length) return '<p class="muted">Сообщений пока нет. Будь первым!</p>';
  return msgs.map((m) => `<div class="chat-msg${String(m.uid) === myId ? ' me' : ''}">
    <span class="chat-head"><b class="chat-name">${esc(m.name || 'Полубог')}${m.prem ? ' 👑' : ''}</b> <span class="chat-time">${clanAgo(m.ts)}</span></span>
    <span class="chat-text">${esc(m.text)}</span>
  </div>`).join('');
}
function paintChat(kind) {
  const el = document.getElementById('chat-msgs');
  if (!el) return;
  el.innerHTML = chatMsgsHtml(kind === 'clan' ? chatClan : chatWorld); if (typeof localizeDOM === 'function') localizeDOM(el);
  el.scrollTop = el.scrollHeight;
}
async function loadWorldChat() {
  if (!_marketOnline()) return;
  try { const r = await fetch(`${CLOUD_URL}/chat/world?room=${encodeURIComponent(worldChatRoom)}`); if (r.ok) { chatWorld = await r.json(); paintChat('world'); } } catch (e) {}
}
async function loadClanChat() {
  if (!_marketOnline()) return;
  try { const r = await fetch(`${CLOUD_URL}/chat/clan?user_id=${TG_USER.id}`); if (r.ok) { chatClan = await r.json(); paintChat('clan'); } } catch (e) {}
}
function _chatBanToast(d) {
  if (!d) return '';
  if (d.perma) return L('🚫 Вы навсегда заблокированы в чате за нарушения.');
  const mins = Math.max(1, Math.ceil(((d.until || 0) - Date.now()) / 60000));
  if (d.error === 'profanity') return tp('🚫 Мат запрещён. Чат заблокирован на {n} мин ({s}/3).', { n: mins, s: d.strikes || 1 });
  return tp('🚫 Вы заблокированы в чате ещё на {n} мин.', { n: mins });
}
async function sendWorldChat() {
  const inp = document.getElementById('chat-input'); const text = (inp && inp.value || '').trim();
  if (!text) return;
  if (inp) inp.value = '';
  const resp = await _marketPost('/chat/world', { text, room: worldChatRoom });
  const d = resp && resp.data;
  if (d && (d.error === 'banned' || d.error === 'profanity')) {
    if (typeof showToast === 'function') showToast(_chatBanToast(d));
    if (d.error === 'profanity') loadWorldChat();
    return;
  }
  loadWorldChat();
}
async function sendClanChat() {
  const inp = document.getElementById('chat-input'); const text = (inp && inp.value || '').trim();
  if (!text) return;
  if (inp) inp.value = '';
  const resp = await _marketPost('/chat/clan', { text });
  const d = resp && resp.data;
  if (d && (d.error === 'banned' || d.error === 'profanity')) {
    if (typeof showToast === 'function') showToast(_chatBanToast(d));
    return;
  }
  loadClanChat();
}

function viewChat() {
  if (!_marketOnline()) {
    return `<div class="panel"><h2>💬 Чат мира</h2><p class="muted">Чат доступен только в Telegram (нужен облачный аккаунт). Открой игру через бота.</p></div>`;
  }
  const tab = (r, label) => `<button class="chat-lang-tab${worldChatRoom === r ? ' active' : ''}" onclick="setWorldChatRoom('${r}')">${label}</button>`;
  const tabs = tab('global', `🌐 ${L('Глобальный')}`)
    + CHAT_ROOMS.filter((r) => r !== 'global').map((r) => tab(r, CHAT_ROOM_FLAGS[r])).join('');
  return `<div class="panel"><h2>💬 Чат мира</h2>
    <p class="muted">Общий живой чат всех полубогов. Обновляется автоматически.</p>
    <div class="chat-lang-tabs">${tabs}</div>
    <div id="chat-msgs" class="chat-box">${chatMsgsHtml(chatWorld)}</div>
    <div class="form-row chat-send">
      <input id="chat-input" class="mk-input" maxlength="240" placeholder="сообщение…" onkeydown="if(event.key==='Enter')sendWorldChat()">
      <button class="mini chat-send-btn" onclick="sendWorldChat()">отправить</button>
    </div>
  </div>`;
}

function bar(cur, max, cls) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return `<div class="bar ${cls}"><div class="fill" style="width:${pct}%"></div><span>${Math.round(cur)} / ${Math.round(max)}</span></div>`;
}

function resStrip() {
  const r = player.resources;
  const TYPE_ICON = { 'эликсир': '🧪', 'зелье': '🍶', 'мазь': '🫙' };
  const potionSpans = player.inventory.filter((it) => it.use).map((it) => {
    const icon = TYPE_ICON[it.type] || '🧴';
    const qty = it.qty && it.qty > 1 ? ` ×${it.qty}` : '';
    return `<span title="${esc(t(it.name))}">${icon}${qty}</span>`;
  }).join('');
  return `<div class="res-strip">
    <span title="Золото — игровые деньги">🪙 ${r.gold || 0}</span>
    <span title="Души — премиум-валюта">👻 ${r.souls || 0}</span>
    <span title="Искры — для крафта 3 уровня">🔥 ${r.sparks || 0}</span>
    ${potionSpans}
  </div>`;
}

function render() {
  applyRegen();
  $('hud').innerHTML = `
    <button class="home-btn ${activeView === 'tower' ? 'on' : ''}" onclick="setView('tower')" title="На главную — Вавилонская башня"><img src="img/tower/babylon_tower.png" alt="🏯" onerror="this.replaceWith(document.createTextNode('🏯'))"></button>
    <div class="hud-left">
      <div class="hero-name">${esc(player.name)}${isPremium() ? ' 👑' : ''} <span class="lvl">🎖 ${t('Уровень')} ${player.xpLevel} · ⚔️ ${t('опасность')} ${player.danger}</span></div>
      <div class="xpwrap"><span class="xplabel l-hp">HP</span>${bar(player.hp, player.maxHp, 'hp')}</div>
      <div class="xpwrap"><span class="xplabel l-mp">MP</span>${bar(player.mp, player.maxMp, 'mp')}</div>
      <div class="xpwrap"><span class="xplabel">${t('Опыт')}</span>${bar(player.xp, xpNeed(player.xpLevel), 'xp')}</div>
    </div>
    ${resStrip()}`;

  const views = {
    tower: viewTower, stats: viewStats, stairs: viewStairs, lower: viewLower, arena: viewArena,
    workshops: viewWorkshops, lab: viewLab, shop: viewShop, academy: viewAcademy,
    market: viewMarket, tavern: viewTavern, bank: viewBank, clans: viewClans, council: viewCouncil,
    mageguild: viewMageGuild, chat: viewChat,
  };
  // баннер с артом здания над страницей (кроме башни и лестницы — у них свои баннеры)
  const noBanner = ['tower', 'stairs'];
  let head = '';
  if (!noBanner.includes(activeView)) {
    const b = TOWER_BUILDINGS.find((x) => x.id === activeView);
    if (b) head = buildingBanner(b);
  }
  $('main').innerHTML = head + (views[activeView] || viewTower)();
  if (activeView === 'council') { setTimeout(loadLeaderboard, 0); setTimeout(loadRefLeaderboard, 0); }
  if (activeView === 'arena') setTimeout(loadPvpOpponents, 0);
  if (activeView === 'market' && !marketLoaded) setTimeout(loadMarket, 0);
  if (activeView === 'lower') setTimeout(startLowerTicker, 0);
  if (activeView === 'clans' && !clansLoaded) setTimeout(loadClansView, 0);
  if (activeView === 'bank') setTimeout(loadSoulShop, 0);

  const homeTab = `<button class="tab home ${activeView === 'tower' ? 'on' : ''}" onclick="setView('tower')"><span class="tabicon">${buildingArt('babylon_tower', '🏯')}</span><small>${t('Башня')}</small></button>`;
  const buildingTabs = TOWER_BUILDINGS.map((b) =>
    `<button class="tab ${activeView === b.id ? 'on' : ''}" onclick="setView('${b.id}')"><span class="tabicon">${buildingArt(b.name, b.icon)}</span><small>${t(b.name)}</small></button>`
  ).join('');
  $('tabs').innerHTML = homeTab + buildingTabs;

  const _logTitle = document.querySelector('#log .log-title'); if (_logTitle) _logTitle.textContent = `📓 ${t('Блокнот')}`;
  const _cbTitle = document.querySelector('#combat .combat-title'); if (_cbTitle) _cbTitle.textContent = t('⚔️ Поле боя');
  $('logbox').innerHTML = player.log.slice(0, 12).map((l) => `<div>${esc(l.msg)}</div>`).join('');
  if (typeof localizeDOM === 'function') { localizeDOM($('hud')); localizeDOM($('main')); localizeDOM($('tabs')); }
  saveGame();
}

// баннер-шапка страницы здания: арт здания (cover) + название
function buildingBanner(b) {
  const base = `img/tower/${artSlug(b.name)}`;
  const art = artFrame(base, `<span class="bemoji" style="font-size:3rem">${b.icon}</span>`, 'af-bg', ['jpg', 'png']);
  return `<div class="banner page-banner">${art}<span class="banner-cap">${b.icon} ${t(b.name)}</span></div>`;
}

// ---------------- Вавилонская башня (хаб) ----------------
function viewTower() {
  return `<div class="tower">
    <div class="banner">${towerArt()}</div>
    <div class="tower-head">
      <h2>${t('🏯 Вавилонская башня')}</h2>
      <button class="mini lang-toggle" onclick="toggleLang()" title="Сменить язык / Switch language">🌐 ${(LANG || 'ru').toUpperCase()}</button>
    </div>
    <p class="muted">${t('Цитадель порядка в хаосе. Полубоги обитают здесь, между нижним миром смертных и нестабильным верхним миром. Выберите помещение.')}</p>
    <div class="grid build-grid">
      ${TOWER_BUILDINGS.map((b) => `
        <button class="build" onclick="setView('${b.id}')">
          <div class="bicon">${buildingArt(b.name, b.icon)}</div>
          <div class="bname">${t(b.name)}</div>
          <div class="bdesc">${esc(t(b.desc))}</div>
        </button>`).join('')}
    </div>
  </div>`;
}

// Панель питомцев (Приручение)
function petsBodyHtml() {
  const pets = player.pets || [];
  const cap = activePetCap();
  const activeN = pets.filter((p) => p.active).length;
  if (!pets.length) return '<p class="muted">Питомцев нет. Ослабь зверя (не босса) в бою примерно до 35% HP и нажми «🐾 приручить». Навык Приручение повышает шанс поимки и число активных питомцев (по +1 за 5 уровней, до 3).</p>';
  const rows = pets.map((p) => `<div class="mg-row">
    <span class="mg-info">🐾 <b>${esc(p.name)}</b> <span class="muted">${t('урон')} ${p.dmgMin}–${p.dmgMax}</span></span>
    <span class="shop-act">
      <button class="mini" onclick="togglePetActive(${p.id})">${p.active ? t('✅ в строю') : t('в резерве')}</button>
      <button class="mini danger" onclick="releasePet(${p.id})">отпустить</button>
    </span>
  </div>`).join('');
  return `<p class="muted">В строю: <b>${activeN}/${cap}</b> · ${t('всего:')} ${pets.length}/${PETS_MAX}. ${t('Активные бьют раз в раунд по цели.')}</p>
    <div class="mg-list">${rows}</div>`;
}

// Панель боевых навыков (растут от использования)
function skillsPanelHtml() {
  return SKILL_ORDER.map((id) => {
    const s = SKILLS[id]; const lvl = skillLevel(id); const p = skillProgress(id);
    const pct = Math.round((p.xp / p.cap) * 100);
    return `<div class="stat-row">
      <div class="sname">${s.icon} ${s.name} <b>${lvl}</b></div>
      <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span>${p.xp}/${p.cap}</span></div>
      <div class="sdesc">${s.desc}</div>
    </div>`;
  }).join('');
}

// ---------------- Покои героя: статы / навыки / магия / инвентарь ----------------
function viewStats() {
  const d = player.derived;
  const statRows = STAT_ORDER.map((k) => {
    const s = player.stats[k];
    const pct = (s.prog / s.cap) * 100;
    const bonus = statTotal(k) - s.val; // от вещей + клана
    const eff = s.val + bonus;
    const valHtml = bonus
      ? `<b>${eff}</b> <span class="stat-bonus">(${s.val}<span class="plus">+${bonus}</span>)</span>`
      : `<b>${s.val}</b>`;
    return `<div class="stat-row">
      <div class="sname">${sName(k)} ${valHtml}</div>
      <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span>${Math.round(s.prog)}/${s.cap}</span></div>
      <div class="sdesc">${t(STATS[k].desc)} <i>(${t('растёт от:')} ${t(STATS[k].grows)})</i></div>
    </div>`;
  }).join('');

  const derivedRows = `
    <div class="kv"><span>Атака</span><b>${d.attack}</b></div>
    <div class="kv"><span>Защита</span><b>${d.defense}</b></div>
    <div class="kv"><span>Броня</span><b>${d.armor}</b></div>
    <div class="kv"><span>Урон</span><b>${d.dmgMin}–${d.dmgMax}</b></div>
    <div class="kv"><span>Физ. крит</span><b>${d.physCrit}%</b></div>
    <div class="kv"><span>Маг. крит</span><b>${d.magCrit}%</b></div>
    <div class="kv"><span>Физ. контр</span><b>${d.physCounter}%</b></div>
    <div class="kv"><span>Маг. контр</span><b>${d.magCounter}%</b></div>
    <div class="kv"><span>Парирование</span><b>${d.parry || 0}%</b></div>
    <div class="kv"><span>Реген HP/мин</span><b>${d.hpRegen}</b></div>
    <div class="kv"><span>Реген MP/мин</span><b>${d.mpRegen}</b></div>`;

  const SLOT_ICONS = {weapon:'⚔️',head:'🪖',body:'🛡',shield:'🔰',ring:'💍',amulet:'📿',earring:'✨'};
  const slots = [['weapon','Оружие'],['head','Шлем'],['body','Доспех'],['shield','Щит'],['ring','Кольцо'],['amulet','Амулет'],['earring','Серьги']];
  const equipHtml = `<div class="equip-grid">${slots.map(([s, label]) => {
    const it = player.equip[s];
    let stat = '';
    if (it) {
      if (it.dmg) stat = `${it.dmg[0]}–${it.dmg[1]} ${t('урон')}`;
      else if (it.armor) stat = `${it.armor} ${t('броня')}`;
      else if (it.bonus) stat = Object.entries(it.bonus).map(([k,v])=>`+${v} ${sName(k)}`).join(', ');
    }
    const rar = it && it.rarity && RARITIES[it.rarity];
    return `<div class="equip-card ${it ? 'equipped' : 'empty'}"${rar ? ` style="border-color:${rar.color}"` : ''}>
      <div class="equip-img">${it ? itemArt(it) : `<span class="equip-empty-icon">${SLOT_ICONS[s]}</span>`}</div>
      <div class="equip-label">${t(label)}</div>
      ${it ? `<div class="equip-name"${rar ? ` style="color:${rar.color}"` : ''}>${esc(t(it.name))}${plusLabel(it)}</div>
        ${it.set && GEAR_SETS[it.set] ? `<div class="equip-set">🎽 ${setWorn(it.set)}/${Object.keys(GEAR_SETS[it.set].pieces).length}</div>` : ''}
        ${stat ? `<div class="equip-stat">${stat}</div>` : ''}
        ${durHtml(it)}
        ${socketsHtml(it)}
        <div class="equip-acts">${enhanceBtn(it)} ${repairBtn(it)} <button class="mini" onclick="unequip('${s}')">снять</button></div>`
        : `<div class="equip-name muted">пусто</div>`}
    </div>`;
  }).join('')}</div>`;

  const TABS = [['equip', '🛡 Экипировка'], ['bag', `🎒 ${t('Рюкзак')} (${player.inventory.length})`], ['stats', '💪 Статы'], ['pets', `🐾 ${t('Питомцы')} (${(player.pets || []).length})`], ['daily', '🎁 Дары дня'], ['codex', '🗂️ Коллекция']];
  const tabBtns = TABS.map(([id, label]) => `<button class="mk-tab ${statsTab === id ? 'on' : ''}" onclick="statsTab='${id}';render()">${label}</button>`).join('');

  let bodyHtml = '';
  if (statsTab === 'equip') {
    bodyHtml = `<h3>Экипировка</h3>${equipHtml}
      <h3>💎 Усилители (огранка)</h3>${gemForgeHtml()}
      <h3>Сет-бонусы</h3>${setsSummaryHtml()}
      <h3>Сборки экипировки</h3>${loadoutsHtml()}`;
  } else if (statsTab === 'bag') {
    const BTABS = [['weapon', '⚔️ Оружие'], ['armor', '🛡 Доспехи'], ['jewelry', '💍 Бижутерия'], ['consum', '🧪 Расходники']];
    const bagTabs = `<div class="mk-subtabs">${BTABS.map(([id, label]) => `<button class="mk-subtab ${bagTab === id ? 'on' : ''}" onclick="bagTab='${id}';render()">${label}</button>`).join('')}</div>`;
    const cat = (it) => (it.slot ? _mkGearCat(it.slot) : 'consum');
    const items = player.inventory.filter((it) => cat(it) === bagTab);
    const grid = items.length ? `<div class="inv-grid">${items.map(itemCard).join('')}</div>` : '<p class="muted">В этой категории пусто.</p>';
    bodyHtml = bagTabs + grid;
  } else if (statsTab === 'stats') {
    bodyHtml = `<div class="cols">
      <div class="col"><h3>Статы</h3>${statRows}</div>
      <div class="col">
        <h3>Боевые параметры</h3><div class="kvgrid">${derivedRows}</div>
        <h3>⚔️ Боевые навыки</h3>${skillsPanelHtml()}
        <h3>Магия</h3>${viewMagicMini()}
        <h3>Профессии</h3>${viewProfessions()}
      </div>
    </div>`;
  } else if (statsTab === 'pets') {
    bodyHtml = `<h3>🐾 Питомцы</h3>${petsBodyHtml()}`;
  } else if (statsTab === 'daily') {
    bodyHtml = `<h3>🎁 Дары дня</h3>${_dailyBody()}`;
  } else { // codex
    bodyHtml = `<h3>🗂️ Коллекция сетов</h3>${_codexBody()}`;
  }

  return `<div class="panel">
    <h2>🧝 Покои героя</h2>
    <div class="mk-tabs mk-tabs-hero">${tabBtns}</div>
    ${bodyHtml}
  </div>`;
}

function viewMagicMini() {
  const els = ELEMENTS.map((e) => `${t(e)} <b>${player.elements[e]}</b>`).join(' · ');
  const dirs = DIRS.map((d) => `${d} <b>${player.dirs[d]}</b>`).join(' · ');
  const spells = player.spells.map((id) => {
    const s = SPELLS.find((x) => x.id === id);
    return `<li><b>${t(s.name)}</b> <span class="tag">${t(s.element)}/${t(s.dir)}</span> — ${esc(t(s.desc))} <i>(${s.cost} MP)</i></li>`;
  }).join('');
  return `<div class="magic-mini"><div class="muted">${t('Стихии:')} ${els}</div><div class="muted">${t('Направления:')} ${dirs}</div>
    <ul class="spell-list">${spells}</ul></div>`;
}

function viewMageGuild() {
  const sum = elementSum();
  const rank = mageRank();
  const els = ELEMENTS.map((e) => `${t(e)} <b>${player.elements[e]}</b>`).join(' · ');
  if (!player.mageGuild) {
    return `<div class="panel"><h2>🔮 Гильдия магов</h2>
      <p class="muted">Клуб магов: ранги, улучшение и изучение заклинаний. Ранг растёт с уровнями стихий (сумма сейчас ${sum}).</p>
      <div class="muted">${t('Стихии:')} ${els}</div>
      <p>Членский взнос — единоразово.</p>
      <button class="big" ${hasRes('gold', MAGE_GUILD_FEE) ? '' : 'disabled'} onclick="joinMageGuild()">${t('Вступить за')} ${MAGE_GUILD_FEE} 🪙</button>
    </div>`;
  }
  const cap = spellUpgradeCap(rank);
  const known = player.spells.map((id) => {
    const s = SPELLS.find((x) => x.id === id); if (!s) return '';
    const plus = player.spellPlus[id] || 0;
    const maxed = plus >= cap;
    const cost = spellUpgradeCost(plus);
    const can = !maxed && hasRes('gold', cost.gold) && hasRes('sparks', cost.sparks) && hasRes('gem', cost.gem);
    const btn = maxed ? `<span class="muted">+${plus} макс</span>`
      : `<button class="mini" ${can ? '' : 'disabled'} onclick="upgradeSpell('${id}')">⬆ +${plus + 1} · ${cost.gold}🪙 ${cost.sparks}🔥 ${cost.gem}💎</button>`;
    return `<div class="mg-row"><span class="mg-info">${esc(t(s.name))} <span class="tag">${t(s.element)}/${t(s.dir)}</span>${plus ? ` <span class="plus-tag">+${plus}</span>` : ''}</span>${btn}</div>`;
  }).join('');
  const learnable = Object.keys(SPELL_LEARN).filter((id) => !player.spells.includes(id)).map((id) => {
    const s = SPELLS.find((x) => x.id === id); const def = SPELL_LEARN[id]; if (!s) return '';
    const okRank = rank >= def.rank;
    const can = okRank && hasRes('gold', def.gold) && hasRes('sparks', def.sparks);
    const btn = okRank ? `<button class="mini" ${can ? '' : 'disabled'} onclick="learnSpell('${id}')">${t('изучить')} · ${def.gold}🪙 ${def.sparks}🔥</button>` : `<span class="muted">🔒 ${MAGE_RANKS[def.rank]}</span>`;
    return `<div class="mg-row"><span class="mg-info">${esc(t(s.name))} <span class="tag">${t(s.element)}/${t(s.dir)}</span><div class="muted">${esc(t(s.desc))}</div></span>${btn}</div>`;
  }).join('') || '<p class="muted">Все доступные заклинания изучены.</p>';
  const nextThr = rank < 3 ? [20, 60, 120][rank] : null;
  return `<div class="panel"><h2>🔮 Гильдия магов</h2>
    <div class="kv big-kv"><span>Ранг</span><b>${MAGE_RANKS[rank]}</b></div>
    <div class="muted">Сумма уровней стихий: <b>${sum}</b>${nextThr ? ` · ${tp('до ранга «{r}»: {n}', {r:t(MAGE_RANKS[rank + 1]), n:nextThr})}` : ' · ' + t('максимальный ранг')}</div>
    <div class="muted">${t('Стихии:')} ${els}</div>
    <h3>${tp('⬆️ Улучшение заклинаний (до +{cap} на ранге)', {cap})}</h3>
    <div class="mg-list">${known}</div>
    <h3>📜 Изучить заклинания</h3>
    <div class="mg-list">${learnable}</div>
  </div>`;
}

function viewProfessions() {
  const rows = PROF_ORDER.map((k) => {
    const p = player.professions[k];
    const info = PROFESSIONS[k];
    const need = profNeed(p.lvl);
    const pct = (p.xp / need) * 100;
    return `<div class="prof-row">
      <div class="pname">${info.icon} ${t(info.name)} <b>${t('ур.')} ${p.lvl}</b> <span class="tag">${profTitle(p.lvl)}</span></div>
      <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span>${Math.round(p.xp)}/${need}</span></div>
      <div class="sdesc"><i>${t(info.grows)}</i></div>
    </div>`;
  }).join('');
  return `<div class="prof-list">${rows}
    <div class="muted hint">Мастерство повышает качество изделий и открывает «тайные знания» — новые рецепты в мастерских.</div></div>`;
}

// <option> со всеми камнями в рюкзаке (для вставки в гнездо)
function gemOptions() {
  return player.inventory.filter((x) => x.type === 'усилитель')
    .map((g) => `<option value="${g.id}">${g.icon} ${esc(g.name)}</option>`).join('');
}
// строка гнёзд предмета (вставка/извлечение/сверление)
function socketsHtml(it) {
  if (!it.slot) return '';
  const max = maxSockets(it);
  const socks = it.sockets || [];
  if (it.rented) { // арендованное — только показ камней, без изменений
    const cells = socks.map((g) => g ? `<span class="sock filled" title="${esc(g.name)}">${g.icon}</span>` : '<span class="sock">◇</span>').join('');
    return cells ? `<div class="sockets">${cells}</div>` : '';
  }
  const opts = gemOptions();
  const cells = socks.map((g, idx) => {
    if (g) return `<button class="sock filled" title="${esc(g.name)} +${g.bonus} ${sName(g.gemStat)} — нажми, чтобы вынуть" onclick="unsocketGem(${it.id},${idx})">${g.icon}</button>`;
    return opts
      ? `<select class="sock-sel" title="Вставить усилитель в гнездо" onchange="if(this.value)socketGem(${it.id},${idx},+this.value)"><option value="">◇ вставить…</option>${opts}</select>`
      : `<span class="sock empty" title="Пустое гнездо. Сначала создай усилитель в «💎 Усилители (огранка)» (Покои → Экипировка), затем вставь его сюда.">◇</span>`;
  }).join('');
  const drill = socks.length < max
    ? `<button class="sock add" title="Просверлить новое гнездо за ${SOCKET_OPEN_COST[socks.length]} 🔥 искр" onclick="openSocket(${it.id})">＋</button>`
    : '';
  if (!cells && !drill) return '';
  return `<div class="sockets"><span class="sock-label" title="Гнёзда для усилителей-самоцветов (создаются огранкой камней 💎)">💠</span>${cells}${drill}</div>`;
}
// панель огранки усилителей
function gemForgeHtml() {
  const rows = STAT_ORDER.map((stat) => {
    const e = ENHANCERS[stat];
    const btns = [1, 2, 3].map((t) => {
      const T = GEM_TIERS[t];
      const aff = (player.resources.gem || 0) >= T.gem && (player.resources.sparks || 0) >= T.sparks;
      return `<button class="mini" ${aff ? '' : 'disabled'} title="${T.gem}💎 + ${T.sparks}🔥 → +${T.bonus} ${sName(stat)}" onclick="craftEnhancer('${stat}',${t})">${T.rom}<small> +${T.bonus}</small></button>`;
    }).join(' ');
    return `<div class="gem-row"><span>${e.icon} <b>${esc(e.name)}</b> <span class="muted">${sName(stat)}</span></span><div class="gem-btns">${btns}</div></div>`;
  }).join('');
  return `<p class="muted">Огранка усилителей: 💎 камень + 🔥 искры. Готовый камень вставляется в гнездо снаряжения (гнёзда сверлятся за 🔥, число — по рарности).</p>
    <div class="gem-forge">${rows}</div>`;
}

function loadoutsHtml() {
  const list = (player.loadouts || []).map((lo, i) => {
    const slots = Object.keys(lo.items || {}).length;
    return `<div class="loadout-row">
      <span>🎽 ${esc(lo.name)} <span class="muted">(${slots} ${t('предм.')})</span></span>
      <button class="mini" onclick="applyLoadout(${i})">надеть</button>
      <button class="mini danger" onclick="deleteLoadout(${i})">✕</button>
    </div>`;
  }).join('') || '<span class="muted">Нет сохранённых сборок. Оденься как нужно и сохрани комплект.</span>';
  return `<div class="loadouts">${list}</div>
    <div class="form-row loadout-save">
      <input id="loadout-name" class="mk-input" type="text" maxlength="20" placeholder="название (напр. Воин)">
      <button class="mini" onclick="saveLoadout(document.getElementById('loadout-name').value)">💾 Сохранить текущую</button>
    </div>`;
}

// Полоска прочности и кнопка починки (для оружия/брони с durability)
function durHtml(it) {
  if (!it || !it.durability) return '';
  const c = it.durability[0]; const m = it.durability[1];
  const pct = Math.max(0, Math.round((c / m) * 100));
  const cls = c <= 0 ? 'broken' : (pct < 25 ? 'low' : '');
  return `<div class="dur ${cls}"><div class="dur-bar"><i style="width:${pct}%"></i></div><span>🛠 ${c}/${m}${c <= 0 ? ' ⚠ сломано' : ''}</span></div>`;
}
function repairBtn(it) {
  const cost = (typeof repairCost === 'function') ? repairCost(it) : null;
  if (!cost) return '';
  const aff = hasRes('gold', cost.gold) && (!cost.sparks || hasRes('sparks', cost.sparks));
  return `<button class="mini" ${aff ? '' : 'disabled'} title="Починка: ${cost.gold} 🪙${cost.sparks ? ` + ${cost.sparks} 🔥` : ''}" onclick="repairItem(${it.id})">🔧</button>`;
}

function itemCard(it) {
  let stats = [];
  if (it.dmg) stats.push(`${t('урон')} ${it.dmg[0]}–${it.dmg[1]}`);
  if (it.armor) stats.push(`${t('броня')} ${it.armor}`);
  if (it.bonus) stats.push(Object.entries(it.bonus).map(([k, v]) => `+${v} ${sName(k)}`).join(', '));
  if (it.type === 'усилитель' && it.gemStat) stats.push(`+${it.bonus} ${sName(it.gemStat)}`);
  if (it.use) {
    const u = it.use;
    stats.push(u.heal ? `+${u.heal} HP` : u.mana ? `+${u.mana} MP` : u.throwDmg ? `${u.throwDmg} ${t('урона')}` : u.buff ? t('усиление') : u.cure === 'poison' ? t('снимает яд') : u.silence ? `${t('немота')} ${u.silence} ${t('р.')}` : u.stoneskin ? `${t('каменная кожа')} ${u.stoneskin} ${t('р.')}` : '');
  }
  if (it.conc && it.use) stats.push(`${t('конц.')} ${it.conc}`);
  if (it.req) stats.push(reqHtml(it.req));
  const inClan = !!(player.clan && player.clan.members);
  let act;
  if (it.rented) { // арендованное — только носить и вернуть
    const a = it.slot ? `<button class="mini" onclick="equipItem(${it.id})">${t('надеть')}</button>` : '';
    act = `${a} <button class="mini" title="${t('вернуть в арсенал')}" onclick="returnShopItem('${it.sid}')">↩️ ${t('вернуть')}</button>`;
  } else {
    const a = it.slot ? `<button class="mini" onclick="equipItem(${it.id})">${t('надеть')}</button>`
      : (it.use && !it.use.throwDmg && !it.use.heal && !it.use.mana ? '' : `<span class="muted">${t('в бою')}</span>`);
    const lend = (inClan && it.slot) ? `<button class="mini" title="${t('одолжить клану')}" onclick="lendItem(${it.id})">📦</button>` : '';
    act = `${a} ${enhanceBtn(it)} ${repairBtn(it)} ${lend} <button class="mini danger" onclick="dropItem(${it.id})">×</button>`;
  }
  const rar = it.rarity && RARITIES[it.rarity];
  const rarStyle = rar ? ` style="border-left-color:${rar.color}"` : '';
  const rarTag = rar ? ` <span class="rar-tag" style="color:${rar.color}">${t(rar.name)}</span>` : '';
  const rentTag = it.rented ? ` <span class="rent-tag" title="${t('Арендовано')}">🔒 ${t('аренда')}</span>` : '';
  const set = it.set && GEAR_SETS[it.set];
  const setLine = set ? `<div class="ic-set">🎽 ${esc(t(set.name))} (${setWorn(it.set)}/${Object.keys(set.pieces).length})</div>` : '';
  return `<div class="item-card ${it.type}${rar ? ' rar' : ''}${it.rented ? ' rented' : ''}"${rarStyle}>
    <div class="ic-art">${itemArt(it)}</div>
    <div class="ic-head"><b${rar ? ` style="color:${rar.color}"` : ''}>${esc(t(it.name))}${plusLabel(it)}</b>${it.qty ? ` ×${it.qty}` : ''}${rarTag}${rentTag}</div>
    <div class="ic-type">${t(it.type)}</div>
    ${setLine}
    <div class="ic-stats">${stats.filter(Boolean).join(' · ')}</div>
    ${durHtml(it)}
    ${socketsHtml(it)}
    <div class="ic-act">${act}</div>
  </div>`;
}

// метка уровня заточки и кнопка заточки
function plusLabel(it) { return it.plus ? ` <span class="plus-tag">+${it.plus}</span>` : ''; }
function enhanceBtn(it) {
  if (!it.slot) return '';
  const plus = it.plus || 0;
  if (plus >= ENHANCE_MAX) return '<span class="muted">+10 макс</span>';
  return `<button class="mini" title="Заточка до +${plus + 1}: ${costLabel(enhanceCost(plus))}" onclick="enhanceItem(${it.id})">⚒️ +${plus + 1}</button>`;
}

// Сколько частей данного сета сейчас надето.
function setWorn(setId) {
  return Object.values(player.equip).filter((it) => it && it.set === setId).length;
}

// Сводка по сет-бонусам надетых комплектов (для Покоев героя).
function setsSummaryHtml() {
  const counts = {};
  Object.values(player.equip).forEach((it) => { if (it && it.set) counts[it.set] = (counts[it.set] || 0) + 1; });
  const ids = Object.keys(counts);
  if (!ids.length) return '<p class="muted">Собери предметы одного класса (напр. «Звёздный аркан») — за надетые части дают сет-бонусы.</p>';
  return ids.map((id) => {
    const set = GEAR_SETS[id];
    const n = counts[id];
    const total = Object.keys(set.pieces).length;
    const tiers = [['2', 2], ['4', 4], ['full', total]].filter(([k]) => set.bonuses[k]).map(([k, need]) => {
      const on = n >= need;
      return `<div class="set-bonus ${on ? 'on' : ''}">${on ? '✅' : '🔒'} <b>(${need === total ? t('полный') : need})</b> ${esc(t(set.bonuses[k].desc))}</div>`;
    }).join('');
    return `<div class="set-block"><div class="set-title">${set.icon} ${esc(t(set.name))} <span class="muted">${t(set.class)} · ${n}/${total}</span></div>${tiers}</div>`;
  }).join('');
}

// ---------------- Коллекция: кодекс классовых сетов ----------------
const CODEX_SLOT_ICONS = { weapon:'⚔️', head:'🪖', body:'🛡', shield:'🔰', ring:'💍', amulet:'📿', earring:'✨' };
function _codexBody() {
  const codex = player.codex || {};
  const ownAll = [...player.inventory, ...Object.values(player.equip).filter(Boolean)];
  let totalPieces = 0, foundPieces = 0, fullSets = 0;
  const blocks = Object.entries(GEAR_SETS).map(([id, set]) => {
    const slots = Object.keys(set.pieces);
    const total = slots.length; totalPieces += total;
    const found = codex[id] || {};
    const nFound = slots.filter((s) => found[s]).length; foundPieces += nFound;
    if (nFound === total) fullSets++;
    const bestRank = Math.max(-1, ...slots.map((s) => (found[s] ? RARITY_ORDER.indexOf(found[s]) : -1)));
    const bestRar = bestRank >= 0 ? RARITIES[RARITY_ORDER[bestRank]] : null;
    const pieces = slots.map((s) => {
      const it = set.pieces[s];
      const rar = found[s] && RARITIES[found[s]];
      return `<div class="codex-piece ${rar ? '' : 'locked'}"${rar ? ` style="border-color:${rar.color}"` : ''}>
        <div class="cp-icon">${rar ? itemArt(it) : `<span class="cp-emoji">${CODEX_SLOT_ICONS[s] || '❔'}</span>`}</div>
        <div class="cp-name"${rar ? ` style="color:${rar.color}"` : ''}>${rar ? esc(t(it.name)) : '???'}</div>
        <div class="cp-rar">${rar ? rar.name : '🔒 не найдено'}</div>
      </div>`;
    }).join('');
    const bonuses = [['2', 2], ['4', 4], ['full', total]].filter(([k]) => set.bonuses[k]).map(([k, need]) =>
      `<div class="set-bonus on"><b>(${need === total ? t('полный') : need})</b> ${esc(t(set.bonuses[k].desc))}</div>`).join('');
    const ownedN = ownAll.filter((it) => it.set === id).length;
    const equipBtn = ownedN ? `<button class="mini" onclick="equipBestSet('${id}')">🎽 ${t('одеть лучшее')} (${ownedN})</button>` : '';
    return `<div class="codex-set">
      <div class="codex-head">
        <span class="codex-title">${set.icon} ${esc(t(set.name))}</span>
        <span class="muted">${t(set.class)} · ${t('с мира')} ${set.minTier} · ${nFound}/${total}${bestRar ? ` · ${t('макс.')} <b style="color:${bestRar.color}">${t(bestRar.name)}</b>` : ''}</span>
      </div>
      <div class="codex-pieces">${pieces}</div>
      <div class="codex-bonuses">${bonuses}</div>
      ${equipBtn ? `<div class="codex-actions">${equipBtn}</div>` : ''}
    </div>`;
  }).join('');
  return `<p class="muted">Собрано частей: <b>${foundPieces}/${totalPieces}</b> · Полных комплектов: <b>${fullSets}/${Object.keys(GEAR_SETS).length}</b>. Части падают в походах — рарность тем выше, чем выше уровень героя и сложность (на 200% — самые редкие).</p>
    ${blocks}`;
}

// ---------------- Лестница в Небо: выбор похода ----------------
function viewStairs() {
  const i = expedSel.world;
  const w = WORLDS[i];
  // полоса миров со статусом: ✓ зачищен · ⚔️ доступен · 🔒 закрыт
  const chips = WORLDS.map((ww, k) => {
    const ul = worldUnlocked(player, k);
    const cl = worldCleared(player, k);
    const icon = !ul ? '🔒' : (cl ? '✓' : '⚔️');
    const cls = `${k === i ? 'sel ' : ''}${!ul ? 'locked ' : ''}${cl ? 'cleared ' : ''}`.trim();
    return `<button class="world-chip ${cls}" onclick="expedSel.world=${k}; expedSel.loc=0; render()" title="${esc(t(ww.name))}${ul ? '' : ' (закрыт)'}">${k + 1} ${icon}</button>`;
  }).join('');
  const worldOpts = WORLDS.map((ww, k) => `<option value="${k}" ${i === k ? 'selected' : ''}>${k + 1}. ${t(ww.name)} (×${ww.tier})${worldUnlocked(player, k) ? (worldCleared(player, k) ? ' ✓' : '') : ' 🔒'}</option>`).join('');
  const locOpts = w.locations.map((l, j) => {
    const lc = l[1].every((n) => (player.defeatedMobs || []).includes(n));
    return `<option value="${j}" ${expedSel.loc === j ? 'selected' : ''}>${lc ? '✓ ' : ''}${t(l[0])} — ${l[1].map(mobLabel).join(', ')}</option>`;
  }).join('');
  const diffs = [75, 100, 125, 150, 175, 200].map((d) => `<option value="${d}" ${expedSel.diff === d ? 'selected' : ''}>${d}%</option>`).join('');
  const loc = w.locations[expedSel.loc];
  const unlocked = worldUnlocked(player, i);
  // прогресс зачистки выбранного мира
  const names = worldMobNames(i);
  const done = names.filter((n) => (player.defeatedMobs || []).includes(n)).length;
  const clearLine = `<div class="muted">Зачистка мира: <b>${done}/${names.length}</b> ${t('мобов')}${done >= names.length ? ' ✓' : ''}</div>`;
  let lockMsg = '';
  if (!unlocked) {
    const needLvl = WORLD_REQ_LEVEL[i] || 1;
    const reqs = [];
    if ((player.xpLevel || 1) < needLvl) reqs.push(tp('достичь <b>{n}</b> ур. (у вас {have})', {n:needLvl, have:player.xpLevel}));
    if (i > 0 && !worldCleared(player, i - 1)) reqs.push(tp('зачистить мир «{w}» (победить всех его мобов)', {w:esc(t(WORLDS[i - 1].name))}));
    lockMsg = `<div class="lock-note">🔒 ${t('Мир закрыт. Нужно:')} ${reqs.join(' и ')}.</div>`;
  }
  return `<div class="panel">
    <h2>🪜 Лестница в Небо</h2>
    <div class="world-strip">${chips}</div>
    <div class="banner">${worldBg(i, loc[0])}<span class="banner-cap">${esc(t(w.name))} · ${esc(t(loc[0]))}</span></div>
    <p class="muted">${esc(w.intro)}</p>
    <div class="form-row"><label>Мир</label>
      <select onchange="expedSel.world=+this.value; expedSel.loc=0; render()">${worldOpts}</select></div>
    ${clearLine}
    ${lockMsg}
    <div class="form-row"><label>Локация</label>
      <select onchange="expedSel.loc=+this.value; render()">${locOpts}</select></div>
    <div class="form-row"><label>Сложность локации</label>
      <select onchange="expedSel.diff=+this.value">${diffs}</select></div>
    <button class="big" ${unlocked ? '' : 'disabled'} onclick="startExpedition(expedSel.world, expedSel.loc, expedSel.diff)">⚔️ В поход</button>
    <p class="hint">✓ зачищен · ⚔️ доступен · 🔒 закрыт. Миры открываются по уровню и только после зачистки предыдущего. Сложность 75% — мобы слабее, 200% — вдвое сильнее.</p>
  </div>`;
}

function _oppCardHtml(opp, i) {
  return `<div class="pvp-card">
    <div class="pvp-card-info">
      <b>${esc(opp.name)}</b>${opp.isBot ? ' <span class="bot-tag">🤖</span>' : ''}
      <span class="muted">${t('Уровень')} ${opp.xpLevel} · ${t('Опасность')} ${opp.danger}</span>
      <span class="muted">HP ${opp.maxHp} · ${t('Урон')} ${opp.dmgMin}–${opp.dmgMax} · ${t('Броня')} ${opp.armor}</span>
    </div>
    <button class="mini" onclick="challengeOpponent(${i})">⚔️ Атаковать</button>
  </div>`;
}

// ---------------- Нижний мир: города и шахты смертных ----------------
let _lowerTimer = null;
// HTML строки накопления (для живого обновления без полного render)
// Бейдж почасового лимита действия (добыча/крафт).
function limitBadge(kind) {
  const left = limitRemaining(kind);
  const cap = limitCap(kind);
  const label = kind === 'gather' ? t('⛏️ Добыча') : t('🔧 Производство');
  const low = left === 0;
  return `<div class="limit-badge ${low ? 'empty' : ''}">${label}: ${t('осталось')} <b>${left}</b> ${t('из')} ${cap} ${t('в час')}${low ? ` · ${t('сброс через')} ${limitResetMins(kind)} ${t('мин')}` : ''}</div>`;
}

function lowerPendingHtml() {
  const totalRate = LOWER_ORDER.reduce((a, k) => a + lowerProdPerHour(k), 0);
  if (totalRate === 0) return '<span class="muted">постройки ещё не возведены — добывай руками ниже</span>';
  const pending = lowerPending();
  const entries = Object.entries(pending);
  const full = lowerElapsedHours() >= lowerCapHours();
  if (!entries.length) {
    const rate = LOWER_ORDER.filter((k) => lowerProdPerHour(k) > 0).map((k) => `${lowerProdPerHour(k)} ${RESOURCES[LOWER_BUILDINGS[k].res].icon}`).join(' · ');
    return `<span class="muted">${t('копится…')} ⏳ ${rate} ${t('в час')}</span>`;
  }
  const str = entries.map(([res, qty]) => `${RESOURCES[res].icon} ${qty} ${rName(res)}`).join(' · ');
  return `${str}${full ? ' <b>(склады полны!)</b>' : ''}`;
}
// Тикер: пока открыт Нижний мир, обновляем строку накопления каждые 2 сек.
function startLowerTicker() {
  clearInterval(_lowerTimer);
  _lowerTimer = setInterval(() => {
    if (activeView !== 'lower') { clearInterval(_lowerTimer); _lowerTimer = null; return; }
    const con = player.lowerWorld.construction;
    if (con && Date.now() >= con.finishAt) { lowerTick(); saveGame(); render(); return; } // достроилось — перерисуем
    const el = document.getElementById('lw-pending');
    if (el) { el.innerHTML = lowerPendingHtml(); if (typeof localizeDOM === 'function') localizeDOM(el); }
    const cd = document.getElementById('lw-countdown');
    if (cd && con) cd.textContent = fmtDuration((con.finishAt - Date.now()) / 1000);
  }, 1000);
}

function viewLower() {
  const lw = player.lowerWorld;
  const heroLvl = player.xpLevel || 1;
  const gated = heroLvl < LOWER_BUILD_LEVEL;
  const con = lw.construction;
  const rows = LOWER_ORDER.map((k) => {
    const b = LOWER_BUILDINGS[k];
    const lvl = lw.buildings[k] || 0;
    const perHour = lowerProdPerHour(k);
    const note = k === 'city' ? `<div class="lw-note">⬆ +${lvl * 5}% ${t('к шахтам')} · ${t('лимит склада')} ${lowerCapHours()} ${t('ч')}</div>` : '';
    let action;
    if (con && con.key === k) {
      const dur = con.finishAt - con.startAt;
      const pct = Math.max(0, Math.min(100, (1 - (con.finishAt - Date.now()) / dur) * 100));
      action = `<div class="lw-build">
        <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span id="lw-countdown">${fmtDuration((con.finishAt - Date.now()) / 1000)}</span></div>
        <button class="mini" onclick="rushLowerBuild()" title="Ускорить за Души">⚡ ${lowerRushCost()} 👻</button>
      </div>`;
    } else {
      const target = lvl + 1;
      const cost = upgradeLowerCost(k);
      const dur = fmtDuration(lowerBuildSeconds(target));
      const chk = canBuildLower(k);
      const label = lvl === 0 ? t('построить') : `${t('ур.')} ${target}`;
      action = `<button class="mini" ${chk.ok ? '' : 'disabled'} onclick="startLowerBuild('${k}')" title="${chk.ok ? ('⏳ ' + dur) : esc(chk.why)}">🏗️ ${label} · ${cost}🪙 · ${dur}</button>`;
    }
    return `<div class="lw-row">
      <div class="lw-icon">${b.icon}</div>
      <div class="lw-body">
        <div class="lw-head"><b>${t(b.name)}</b> <span class="tag">${t('ур.')} ${lvl}</span></div>
        <div class="lw-desc muted">${t(b.desc)}</div>
        <div class="lw-rate">⏳ ${perHour} ${RESOURCES[b.res].icon}/${t('час')}</div>
        ${note}
      </div>
      ${action}
    </div>`;
  }).join('');

  const gateBanner = gated
    ? `<div class="lw-gate">${tp('🔒 Стройка построек откроется на <b>{n}</b> уровне героя (сейчас {have}). Пока добывай ресурсы руками ниже.', {n:LOWER_BUILD_LEVEL, have:heroLvl})}</div>`
    : `<p class="muted">Возводи постройки (это занимает время — чем выше уровень, тем дольше) и собирай урожай. Город — стержень: его уровень задаёт потолок остальных построек, бустит шахты и расширяет склад. Строится одно здание за раз; можно ускорить за Души.</p>`;

  return `<div class="panel">
    <h2>🏘️ Нижний мир</h2>
    ${gateBanner}
    <div class="lw-collect">
      <div>📦 Накоплено: <span id="lw-pending">${lowerPendingHtml()}</span></div>
      <button class="big" onclick="collectLower()">Собрать урожай</button>
    </div>
    <h3>⛏️ Добыть руками (бесплатно)</h3>
    <p class="muted">Спустись к смертным и собери ресурсы 1 уровня сам — бесплатно, удача и навык дают шанс добыть больше.</p>
    ${limitBadge('gather')}
    <div class="gather-grid">${GATHER_TABLE.map((g) => `<button class="mini" onclick="gather('${g.res}')">${RESOURCES[g.res].icon} ${g.name}</button>`).join('')}</div>
    <h3>🏗️ Постройки смертных${con ? ` <span class="muted">— ${t('строится')} ${t(LOWER_BUILDINGS[con.key].name)}</span>` : ''}</h3>
    <div class="lw-list">${rows}</div>
  </div>`;
}

function viewArena() {
  const pvp = player.pvp || { wins: 0, losses: 0 };
  ensureDaily();
  const left = Math.max(0, arenaDailyLimit() - (player.daily.arena || 0));
  // Рендерим ботов синхронно сразу — никаких спиннеров, арена всегда заполнена
  arenaOpponents = _mixOpponents([]);
  const initHtml = arenaOpponents.length
    ? arenaOpponents.map(_oppCardHtml).join('')
    : '<span class="muted">Соперники не найдены</span>';
  return `<div class="panel">
    <h2>⚔️ Арена</h2>
    <div class="pvp-stats">
      <span>🏆 Побед: <b>${pvp.wins}</b></span>
      <span>💀 Поражений: <b>${pvp.losses}</b></span>
      <span>🎯 Боёв с наградой сегодня: <b>${left}/${arenaDailyLimit()}</b></span>
    </div>
    <h3>⚔️ Соперники</h3>
    <p class="muted">Бойцы рядом с тобой по силе. Бой авто-расчётный — победа даёт золото и опыт. Награда — за первые ${arenaDailyLimit()} боёв в день.</p>
    <div id="pvp-result"></div>
    <div id="pvp-opponents">${initHtml}</div>
    <h3>🤖 Тренировочный бой</h3>
    <p class="muted">Бой с тёмным двойником ради опыта.</p>
    <button class="big" onclick="startArena()">Выйти на бой с двойником</button>
  </div>`;
}

function _simulatePvp(opp) {
  let myHp = player.maxHp;
  let oppHp = opp.maxHp;
  const d = player.derived;
  const log = [];
  for (let r = 1; r <= 40 && myHp > 0 && oppHp > 0; r++) {
    const myDmg = Math.max(1, Math.round(
      (d.dmgMin + Math.random() * (d.dmgMax - d.dmgMin)) * 100 / (100 + (opp.armor || 0))
    ));
    oppHp -= myDmg;
    log.push(tp('Раунд {r}: ты {dmg} урона → HP врага {hp}', {r, dmg:myDmg, hp:Math.max(0, Math.round(oppHp))}));
    if (oppHp <= 0) break;
    const oppDmg = Math.max(1, Math.round(
      ((opp.dmgMin || 3) + Math.random() * ((opp.dmgMax || 8) - (opp.dmgMin || 3)))
      * 100 / (100 + (d.armor || 0))
    ));
    myHp -= oppDmg;
    log.push(tp('{opp} {dmg} урона → твой HP {hp}', {opp:esc(opp.name), dmg:oppDmg, hp:Math.max(0, Math.round(myHp))}));
  }
  return { won: myHp > 0 || oppHp <= 0, log: log.slice(-6) };
}

function challengeOpponent(idx) {
  const opp = arenaOpponents[idx];
  if (!opp) { showToast('Соперник недоступен'); return; }
  ensureDaily();
  const overCap = (player.daily.arena || 0) >= arenaDailyLimit(); // сверх дневного лимита — бой без награды
  const { won, log } = _simulatePvp(opp);
  player.daily.arena = (player.daily.arena || 0) + 1;

  // Награды умеренные, чтобы уровень не качался слишком быстро на арене.
  // Сверх дневного лимита бой засчитывается, но без золота/опыта/штрафа.
  const goldReward = overCap ? 0 : (won ? Math.round(12 * (opp.danger || 1)) : -Math.round(8 * player.danger));
  const xpReward  = overCap ? 0 : (won ? Math.round(6 * (opp.danger || 1)) : Math.round(2 * (opp.danger || 1)));

  if (won) { player.pvp.wins = (player.pvp.wins || 0) + 1; }
  else     { player.pvp.losses = (player.pvp.losses || 0) + 1; }
  addRes('gold', goldReward);
  gainXp(xpReward);
  const left = Math.max(0, arenaDailyLimit() - player.daily.arena);
  const capNote = overCap ? ' (сверх лимита — без награды)' : ` · осталось боёв: ${left}`;
  pushLog('{ic} PvP vs {opp}: {res}! Золото {sign}{gold}, XP +{xp}{cap}', {ic:won ? '🏆' : '💀', opp:opp.name, res:won ? L('победа') : L('поражение'), sign:goldReward > 0 ? '+' : '', gold:goldReward, xp:xpReward, cap:capNote});
  saveGame();

  // Уведомляем реального соперника на сервере (для ботов пропускаем)
  if (!opp.isBot && typeof _cloudReady === 'function' && _cloudReady()) {
    fetch(`${CLOUD_URL}/arena/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_USER.initData, targetId: opp.userId, targetName: opp.name, won }),
    }).catch(() => {});
  }

  // render() обновляет HUD/лог/статы и пересобирает панель арены; результат
  // кладём в отдельный контейнер #pvp-result, чтобы автообновление списка
  // соперников его не затирало. Висит, пока не закрыть крестиком.
  render();
  const el = document.getElementById('pvp-result');
  if (!el) return;
  el.innerHTML = `<div class="pvp-result ${won ? 'win' : 'lose'}">
    <button class="pvp-result-close" onclick="document.getElementById('pvp-result').innerHTML=''">✕</button>
    <div class="pvp-result-title">${won ? t('🏆 Победа!') : t('💀 Поражение')}</div>
    <div class="pvp-result-vs">vs <b>${esc(opp.name)}</b></div>
    <div class="pvp-log">${log.map(l => `<div>${esc(l)}</div>`).join('')}</div>
    <div class="pvp-rewards">${t('Золото:')} ${goldReward > 0 ? '+' : ''}${goldReward} · XP: +${xpReward}</div>
  </div>`;
  if (typeof localizeDOM === 'function') localizeDOM(el);
}

// Смешиваем реальных игроков (с сервера) с ботами, ближайшими по силе,
// чтобы всегда было до 6 соперников для боя.
function _mixOpponents(real) {
  const out = [];
  const seen = new Set();
  try {
    (Array.isArray(real) ? real : []).forEach((o) => {
      if (o && !seen.has(String(o.userId))) { seen.add(String(o.userId)); out.push(o); }
    });
  } catch (e) {}
  const botList = (typeof window !== 'undefined' && window.BOTS) || (typeof BOTS !== 'undefined' ? BOTS : []);
  if (out.length < 6 && botList.length) {
    const danger = (player && player.danger) || 1;
    const pool = botList.slice()
      .sort((a, b) => Math.abs(a.danger - danger) - Math.abs(b.danger - danger))
      .slice(0, 24);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const b of pool) {
      if (out.length >= 6) break;
      if (seen.has(b.userId)) continue;
      seen.add(b.userId); out.push(b);
    }
  }
  return out.slice(0, 6);
}

// Подгружает реальных игроков с сервера и добавляет их в начало списка.
// Боты уже отрисованы синхронно из viewArena() — этот вызов только обновляет
// список если нашлись живые соперники.
async function loadPvpOpponents() {
  const el = document.getElementById('pvp-opponents');
  if (!el) return;
  const userId = window.TG_USER && window.TG_USER.id;
  if (!userId) return; // вне Telegram — боты и так показаны
  try {
    const r = await fetch(`${CLOUD_URL}/arena/opponents?user_id=${userId}&danger=${player.danger}`);
    if (!r.ok) return;
    const real = await r.json();
    if (!Array.isArray(real) || !real.length) return; // реальных нет — ботов не трогаем
    arenaOpponents = _mixOpponents(real);
    if (arenaOpponents.length) { el.innerHTML = arenaOpponents.map(_oppCardHtml).join(''); if (typeof localizeDOM === 'function') localizeDOM(el); }
  } catch (e) { /* ботов уже показали — ничего не делаем */ }
}

// ---------------- Мастерские и Лаборатория ----------------
const SLOT_RU = { weapon:'оружие', head:'шлем', body:'доспех', shield:'щит', ring:'кольцо', amulet:'амулет', earring:'серьги' };
// Требования по статам с пометкой, выполнены ли они (по итоговому значению, как при экипировке).
// Зелёный — хватает, красный — нет. Помогает понять, сможешь ли надеть вещь.
function reqHtml(req) {
  if (!req || !Object.keys(req).length) return '';
  const parts = Object.entries(req).map(([k, v]) => {
    const have = (typeof statTotal === 'function') ? statTotal(k) : 0;
    return `<span class="req-stat ${have >= v ? 'ok' : 'lack'}">${sName(k)} ${v} <i>(${t('есть')} ${have})</i></span>`;
  });
  return `<span class="req-line">${t('треб:')} ${parts.join(', ')}</span>`;
}
function recipeCard(r) {
  const known = player.knownRecipes.includes(r.id);
  const out = r.out.res ? `${r.out.qty || 1}× ${rName(r.out.res)}` : t(r.out.item.name);
  const ok = canCraft(r) && known;

  // ингредиенты с пометкой нехватки (${t('есть')} N / нужно M)
  const lacks = [];
  const chip = (icon, name, req, have) => {
    const enough = have >= req;
    if (!enough) lacks.push(name);
    return `<span class="rc-chip ${enough ? '' : 'lack'}">${icon} ${req}× ${name} <i>(${t('есть')} ${have})</i></span>`;
  };
  let chips = Object.entries(r.in || {}).map(([k, v]) => chip(RESOURCES[k].icon, rName(k), v, player.resources[k] || 0)).join(' ');
  if (r.sparks) chips += ' ' + chip('🔥', 'Искры', r.sparks, player.resources.sparks || 0);
  // топливо: нужен 1× уголь ИЛИ 6× бревно на единицу топлива
  if (r.fuel) {
    const coal = player.resources.coal || 0, logs = player.resources.log || 0;
    const fuelOk = coal >= r.fuel || logs >= r.fuel * 6;
    if (!fuelOk) lacks.push('топливо');
    chips += ` <span class="rc-chip ${fuelOk ? '' : 'lack'}">🔥 ${t('топливо:')} ${r.fuel}× ⚫ ${t('уголь')} <i>(${t('есть')} ${coal})</i> ${t('или')} ${r.fuel * 6}× 🪵 ${t('бревно')} <i>(${t('есть')} ${logs})</i></span>`;
  }

  // подсказка, как открыть неизученный рецепт (профессия+уровень или босс)
  let lockHint = 'рецепт не изучен';
  if (!known) {
    const entry = (PROF_RECIPES[r.ws] || []).find(([id]) => id === r.id);
    if (entry) lockHint = `${t('откроется:')} ${PROFESSIONS[r.ws].icon} ${t(PROFESSIONS[r.ws].name)} ${t('ур.')} ${entry[1]}`;
    else if ((r.sparks || 0) >= 300) lockHint = '🐲 схема — трофей с боссов (миры 7+)';
  }
  // превью результата: арт предмета или иконка ресурса
  const art = r.out.item
    ? itemArt(r.out.item)
    : `<span class="rc-res-icon">${RESOURCES[r.out.res].icon}</span>`;
  // статы создаваемой вещи (базовые; мастерство и уголь повышают качество при ковке)
  let outStats = '';
  const oi = r.out.item;
  if (oi) {
    const st = [];
    if (oi.dmg) st.push(`⚔️ ${t('урон')} ${oi.dmg[0]}–${oi.dmg[1]}`);
    if (oi.armor) st.push(`🛡 броня ${oi.armor}`);
    if (oi.bonus) st.push(Object.entries(oi.bonus).map(([k, v]) => `+${v} ${sName(k)}`).join(', '));
    if (oi.use) st.push(oi.use.heal ? `+${oi.use.heal} HP` : oi.use.mana ? `+${oi.use.mana} MP` : oi.use.throwDmg ? `${oi.use.throwDmg} ${t('урона')}` : oi.use.cure === 'poison' ? t('снимает яд') : oi.use.silence ? `${t('немота')} ${oi.use.silence} ${t('р.')}` : oi.use.stoneskin ? `${t('каменная кожа')} ${oi.use.stoneskin} ${t('р.')}` : oi.use.buff ? (t('усиление:') + ' ' + Object.entries(oi.use.buff).map(([k, v]) => `+${v} ${sName(k)}`).join(', ')) : '');
    if (oi.conc) st.push(`${t('конц.')} ${oi.conc}`);
    if (oi.slot) st.push(`${t('слот:')} ${t(SLOT_RU[oi.slot] || oi.slot)}`);
    if (oi.req && Object.keys(oi.req).length) st.push(reqHtml(oi.req));
    const f = st.filter(Boolean);
    if (f.length) outStats = `<div class="rc-stats">${f.join(' · ')}</div>`;
  }
  return `<div class="recipe ${ok ? '' : 'locked'}">
    <div class="rc-art">${art}</div>
    <div class="rc-body">
      <div class="rc-out"><b>${esc(out)}</b> <span class="ws">[${t(WORKSHOPS[r.ws])}]</span></div>
      ${outStats}
      <div class="rc-in">${chips}</div>
      ${known
        ? (ok
            ? `<button class="mini" onclick="craft('${r.id}')">создать</button>${maxCraftable(r) > 1 ? ` <button class="mini" onclick="craftMax('${r.id}')">${t('создать')} ×${maxCraftable(r)}</button>` : ''}`
            : `<span class="muted">⚠ ${t('не хватает:')} ${lacks.join(', ')}</span>`)
        : `<span class="muted">${lockHint}</span>`}
    </div>
  </div>`;
}
function viewWorkshops() {
  const cats = [
    ['Переработка ресурсов', RECIPES.filter((r) => r.out.res)],
    ['Оружие', RECIPES.filter((r) => r.out.item && r.out.item.slot === 'weapon')],
    ['Броня', RECIPES.filter((r) => r.out.item && ['head','body','shield'].includes(r.out.item.slot))],
    ['Бижутерия', RECIPES.filter((r) => r.out.item && ['ring','amulet','earring'].includes(r.out.item.slot))],
  ];
  return `<div class="panel">
    <h2>🔨 Мастерские</h2>
    <p class="muted">Переработка ресурсов 1→2 уровня и создание снаряжения. Уголь как топливо повышает качество (закалка).</p>
    ${limitBadge('craft')}
    ${resInventory()}
    ${setsForgeHtml()}
    ${cats.map(([t, rs]) => `<h3>${t}</h3><div class="recipe-grid">${rs.map(recipeCard).join('')}</div>`).join('')}
  </div>`;
}

const FORGE_SLOT_ICONS = { weapon:'⚔️', head:'🪖', body:'🛡', shield:'🔰', ring:'💍', amulet:'📿', earring:'✨' };
// «было → будет» для перековки: считает статы целевой рарности (с учётом заточки).
function reforgeDelta(it) {
  const idx = RARITY_ORDER.indexOf(it.rarity || 'common');
  if (idx >= RARITY_ORDER.length - 1) return '';
  const target = RARITY_ORDER[idx + 1];
  const fresh = makeSetItem(it.set, it.slot, target);
  if (it.plus) {
    fresh.baseStats = { dmg: fresh.dmg ? [...fresh.dmg] : null, armor: fresh.armor != null ? fresh.armor : null, bonus: fresh.bonus ? { ...fresh.bonus } : null };
    fresh.plus = it.plus;
    recomputeEnhanced(fresh);
  }
  const parts = [];
  if (it.dmg && fresh.dmg) parts.push(`${t('урон')} ${it.dmg[0]}–${it.dmg[1]} → <b>${fresh.dmg[0]}–${fresh.dmg[1]}</b>`);
  if (it.armor != null && fresh.armor != null) parts.push(`${t('броня')} ${it.armor} → <b>${fresh.armor}</b>`);
  if (it.bonus && fresh.bonus) Object.keys(fresh.bonus).forEach((k) => parts.push(`${sName(k)} +${it.bonus[k] || 0}→<b>+${fresh.bonus[k]}</b>`));
  return parts.join(' · ');
}
function setsForgeHtml() {
  const discovered = Object.keys(player.codex || {});
  // ковка недостающих частей найденных сетов
  let craftHtml;
  if (!discovered.length) {
    craftHtml = '<p class="muted">Найди в походах хотя бы одну часть любого сета — и сможешь сковать остальные его части здесь.</p>';
  } else {
    craftHtml = discovered.map((id) => {
      const set = GEAR_SETS[id];
      if (!set) return '';
      const cost = setCraftCost(id);
      const aff = canAfford(cost);
      const firstSlot = Object.keys(set.pieces)[0];
      const thumb = itemArt(makeSetItem(id, firstSlot, 'common'));
      const slotBtns = Object.keys(set.pieces).map((slot) =>
        `<button class="mini" ${aff ? '' : 'disabled'} title="${esc(set.pieces[slot].name)}" onclick="craftSetPiece('${id}','${slot}')">${FORGE_SLOT_ICONS[slot]}</button>`
      ).join(' ');
      return `<div class="forge-row">
        <span class="shop-thumb">${thumb}</span>
        <span>${set.icon} <b>${esc(t(set.name))}</b> <span class="muted">${costLabel(cost)} / ${t('шт.')}</span></span>
        <div class="forge-slots">${slotBtns}</div>
      </div>`;
    }).join('');
  }
  // перековка рарности предметов сетов из рюкзака
  const reforgeable = player.inventory.filter((it) => it.set && RARITY_ORDER.indexOf(it.rarity || 'common') < RARITY_ORDER.length - 1);
  const reforgeHtml = reforgeable.length ? reforgeable.map((it) => {
    const idx = RARITY_ORDER.indexOf(it.rarity || 'common');
    const target = RARITY_ORDER[idx + 1];
    const cost = reforgeCost(target);
    const aff = canAfford(cost);
    const rc = RARITIES[it.rarity] || RARITIES.common;
    const tc = RARITIES[target];
    return `<div class="forge-row">
      <span class="shop-thumb">${itemArt(it)}</span>
      <span class="forge-info">
        <span><b style="color:${rc.color}">${esc(t(it.name))}</b> <span class="muted">${t(rc.name)} → <span style="color:${tc.color}">${t(tc.name)}</span></span></span>
        <span class="forge-delta">${reforgeDelta(it)}</span>
      </span>
      <span class="muted">${costLabel(cost)}</span>
      <button class="mini" ${aff ? '' : 'disabled'} onclick="reforgeItem(${it.id})">перековать</button>
    </div>`;
  }).join('') : '<p class="muted">Нет частей сетов в рюкзаке. Надетые сначала снимите в Покоях героя.</p>';

  const tabs = `<div class="mk-tabs" style="grid-template-columns:1fr 1fr;margin:.3em 0">
    <button class="mk-tab ${forgeTab==='craft'?'on':''}" onclick="forgeTab='craft';render()">🔨 ${t('Ковка частей')}</button>
    <button class="mk-tab ${forgeTab==='reforge'?'on':''}" onclick="forgeTab='reforge';render()">♻️ ${t('Перековка рарности')}</button>
  </div>`;
  const body = forgeTab === 'reforge'
    ? `<p class="muted">${t('Перековка сохраняет заточку и камни, но по Душам дороже прямой покупки — целую вещь нужной рарности выгоднее купить в Магазине.')}</p>${reforgeHtml}`
    : `<p class="muted">${t('Скуй недостающие части найденных комплектов.')}</p>${craftHtml}`;

  return `<h3>🔥 Кузница сетов</h3>${tabs}${body}`;
}
function viewLab() {
  const rs = RECIPES.filter((r) => r.out.item && ['эликсир','зелье','мазь'].includes(r.out.item.type));
  return `<div class="panel">
    <h2>⚗️ Лаборатории</h2>
    <p class="muted">Алхимия: эликсиры (лечат в бою), зелья (бросаются во врага), мази (усиления вне боя).</p>
    ${limitBadge('craft')}
    ${resInventory()}
    <div class="recipe-grid">${rs.map(recipeCard).join('')}</div>
  </div>`;
}

function resInventory() {
  const items = Object.keys(RESOURCES).filter((k) => !RESOURCES[k].special && (player.resources[k] || 0) > 0)
    .map((k) => `<span class="res-chip">${RESOURCES[k].icon} ${rName(k)}: <b>${player.resources[k]}</b></span>`).join('');
  return `<div class="res-inv">${items || '<span class="muted">Нет ресурсов — добудьте в Нижнем мире или в походах.</span>'}</div>`;
}

// ---------------- Магазин ----------------
const SHOP_SLOT_ICON = { weapon:'⚔️', head:'🪖', body:'🛡', shield:'🔰', ring:'💍', amulet:'📿', earring:'✨' };

function viewShop() {
  const tabs = `<div class="mk-tabs" style="grid-template-columns:1fr 1fr">
    <button class="mk-tab ${shopTab==='res'?'on':''}" onclick="shopTab='res';render()">🪙 ${t('За ресурсы')}</button>
    <button class="mk-tab ${shopTab==='souls'?'on':''}" onclick="shopTab='souls';render()">👻 ${t('За души')}</button>
  </div>`;
  const body = shopTab === 'souls' ? premiumShopBody() : freeShopBody();
  return `<div class="panel"><h2>🏪 Магазин</h2>${tabs}${body}</div>`;
}

function freeShopBody() {
  const buy = SHOP_GOODS.map((g) => `<div class="shop-row">
    <span>${RESOURCES[g.res].icon} ${rName(g.res)}</span>
    <span class="muted">${g.price} 🪙</span>
    <button class="mini" onclick="buyRes('${g.res}',1)">+1</button>
    <button class="mini" onclick="buyRes('${g.res}',10)">+10</button>
    <button class="mini" onclick="sellRes('${g.res}',1)">продать</button>
  </div>`).join('');
  const gearCat = (title, list) => {
    if (!list.length) return '';
    const rows = list.map((r) => {
      const it = r.out.item;
      const price = gearPrice(r);
      const icon = SHOP_SLOT_ICON[it.slot] || '🎒';
      const stat = it.dmg ? `${t('урон')} ${it.dmg[0]}–${it.dmg[1]}`
        : it.armor ? `${t('броня')} ${it.armor}`
        : (it.bonus ? Object.entries(it.bonus).map(([k, v]) => `+${v} ${sName(k)}`).join(', ') : '');
      const reqH = reqHtml(it.req); const req = reqH ? ` · ${reqH}` : '';
      return `<div class="shop-row gear">
        <span class="shop-thumb">${itemArt(it)}</span>
        <span>${icon} ${esc(t(it.name))} <span class="muted">${stat}${req}</span></span>
        <span class="muted">${price} 🪙</span>
        <button class="mini" ${hasRes('gold', price) ? '' : 'disabled'} onclick="buyGear('${r.id}')">купить</button>
      </div>`;
    }).join('');
    return `<h4 class="shop-sub">${title}</h4>${rows}`;
  };
  const gearHtml =
    gearCat('⚔️ Оружие', SHOP_GEAR.filter((r) => r.out.item.slot === 'weapon')) +
    gearCat('🛡 Броня', SHOP_GEAR.filter((r) => ['head', 'body', 'shield'].includes(r.out.item.slot))) +
    gearCat('💍 Бижутерия', SHOP_GEAR.filter((r) => ['ring', 'amulet', 'earring'].includes(r.out.item.slot)));

  return `
    <p class="muted">Купить ресурсы, снаряжение и расходники, продать трофеи. Цены продажи — половина закупки.</p>
    <h3>🪖 Снаряжение за золото</h3>
    <p class="muted">Готовое снаряжение без крафта — оденься хоть сейчас. Легендарки тут не продаются (их крафтят/добывают).</p>
    ${gearHtml}
    <h3>Ресурсы</h3>${buy}
    ${resInventory()}`;
}

function premiumShopBody() {
  const souls = player.resources.souls || 0;
  const per = PREMIUM_PIECE_PRICE[premiumRarity];
  const rtabs = PREMIUM_RARITIES.map((r) =>
    `<button class="mk-tab ${premiumRarity===r?'on':''}" onclick="premiumRarity='${r}';render()">${t(RARITIES[r].name)}</button>`).join('');
  const cards = Object.entries(GEAR_SETS).map(([id, set]) => {
    const pieces = Object.entries(set.pieces);
    const setPrice = premiumSetPrice(id, premiumRarity);
    const rows = pieces.map(([slot, p]) => {
      const it = makeSetItem(id, slot, premiumRarity);
      const icon = SHOP_SLOT_ICON[slot] || '🎒';
      const stat = it.dmg ? `${t('урон')} ${it.dmg[0]}–${it.dmg[1]}`
        : it.armor ? `${t('броня')} ${it.armor}`
        : (it.bonus ? Object.entries(it.bonus).map(([k, v]) => `+${v} ${sName(k)}`).join(', ') : '');
      return `<div class="shop-row gear">
        <span class="shop-thumb">${itemArt(it)}</span>
        <span>${icon} ${esc(t(p.name))} <span class="muted">${stat}</span></span>
        <span class="muted">${per} 👻</span>
        <button class="mini ${souls>=per?'':'unaff'}" onclick="buyPremiumPiece('${id}','${slot}')">${t('купить')}</button>
      </div>`;
    }).join('');
    return `<div class="prem-set">
      <h4 class="shop-sub">${set.icon} ${esc(t(set.name))} <span class="muted">· ${t(set.class)}</span></h4>
      ${rows}
      <button class="big buy-set ${souls>=setPrice?'':'unaff'}" onclick="buyPremiumSet('${id}')">${t('Весь сет')} (${pieces.length}) — ${setPrice} 👻</button>
    </div>`;
  }).join('');
  return `
    <p class="muted">${t('Готовые сетовые предметы за Души. Комплектом — дешевле.')}</p>
    <div class="kv big-kv"><span>👻 ${t('Души')}</span><b>${souls}</b></div>
    <div class="mk-tabs mk-tabs-4" style="margin:.4em 0">${rtabs}</div>
    ${cards}`;
}

// ---------------- Академия / Банк / Совет ----------------
function viewAcademy() {
  const visited = player.visitedLocations.length;
  const worlds = WORLDS.map((w, i) => {
    const seen = player.visitedLocations.some((v) => v.startsWith(w.name + ' /'));
    const ul = worldUnlocked(player, i);
    const cl = worldCleared(player, i);
    const badge = !ul ? ' <span class="tag tag-no">🔒 закрыт</span>' : (cl ? ' <span class="tag tag-ok">✓ зачищен</span>' : '');
    return `<div class="academy-row ${seen ? 'seen' : ''}">
      <b>${i + 1}. ${t(w.name)}</b> <span class="muted">${t('сложность')} ×${w.tier}</span>${badge}
      <div>${seen ? w.locations.map((l) => `${t(l[0])} — ${l[1].map(mobLabel).join(', ')}`).join('; ') : '<i>Terra Incognita — мир ещё не исследован</i>'}</div>
    </div>`;
  }).join('');

  const enc = buildEncyclopedia().map((s) => `
    <details class="enc" data-text="${esc(s.plain)}">
      <summary>${s.icon} ${esc(s.title)}</summary>
      <div class="enc-body">${s.body}</div>
    </details>`).join('');

  return `<div class="panel">
    <h2>📚 Академия — Энциклопедия</h2>
    <p class="muted">Ответы на вопросы об устройстве мира и механиках. Найдите тему или раскройте раздел.</p>
    <input id="encSearch" class="enc-search" type="search" placeholder="🔎 Поиск по энциклопедии (статы, топливо, заклинания…)" oninput="encFilter(this.value)">
    <div id="encList" class="enc-list">${enc}</div>
    <h3>Исследование мира</h3>
    <p class="muted">Посещено локаций: <b>${visited}</b> · Убито мобов: <b>${player.counters.kills}</b> · Создано вещей: <b>${player.counters.crafted}</b>.</p>
    ${worlds}
  </div>`;
}
// ---------------- Барахолка (торговля между игроками) ----------------
function _marketOnline() {
  return window.TG_USER && TG_USER.initData && typeof CLOUD_URL === 'string' && !CLOUD_URL.includes('YOUR_SUBDOMAIN');
}

async function loadMarket() {
  if (!_marketOnline()) return;
  try {
    const r = await fetch(`${CLOUD_URL}/market`);
    if (!r.ok) return;
    marketLots = await r.json();
    marketLoaded = true;
    if (activeView === 'market') render();
  } catch (e) {}
}

async function _marketPost(path, payload) {
  const r = await fetch(`${CLOUD_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: TG_USER.initData, ...payload }),
  });
  let data = null;
  try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, data };
}

// Выставить ресурс на продажу
async function listResourceLot(res) {
  if (marketBusy) return;
  const qty = Math.floor(+($(`mk-qty-${res}`)?.value || 0));
  const price = Math.floor(+($(`mk-price-${res}`)?.value || 0));
  if (!(qty > 0)) { showToast('Укажите количество'); return; }
  if (!(price > 0)) { showToast('Укажите цену'); return; }
  if (!hasRes(res, qty)) { showToast('Недостаточно ресурса'); return; }
  marketBusy = true;
  const resp = await _marketPost('/market/list', { lot: { kind: 'res', res, qty, price } });
  marketBusy = false;
  if (!resp.ok) { pushLog('❌ Не удалось выставить лот{lim}.', {lim:resp.status === 429 ? (' ' + L('(лимит лотов)')) : ''}); render(); return; }
  spendRes(res, qty);
  pushLog('🏷️ Лот выставлен: {qty}× {res} за {price} 🪙.', {qty, res:rName(res), price});
  saveGame();
  loadMarket();
  render();
}

// Выставить предмет (снаряжение) на продажу. Сетовые вещи продаются за Души, прочие — за монеты.
async function listItemLot(itemId) {
  if (marketBusy) return;
  const price = Math.floor(+($(`mk-iprice-${itemId}`)?.value || 0));
  if (!(price > 0)) { showToast('Укажите цену'); return; }
  const it = player.inventory.find((x) => x.id === itemId);
  if (!it) return;
  if (it.rented) { showToast('Нельзя продать арендованное — верните в арсенал'); return; }
  const currency = it.set ? 'souls' : 'gold';
  const icon = currency === 'souls' ? '👻' : '🪙';
  const itemCopy = JSON.parse(JSON.stringify(it));
  delete itemCopy.id;          // новый владелец получит свой id
  delete itemCopy.rented; delete itemCopy.sid; delete itemCopy.rentOwnerName; // на всякий случай
  marketBusy = true;
  const resp = await _marketPost('/market/list', { lot: { kind: 'item', item: itemCopy, price, currency } });
  marketBusy = false;
  if (!resp.ok) { pushLog('❌ Не удалось выставить лот{lim}.', {lim:resp.status === 429 ? (' ' + L('(лимит лотов)')) : ''}); render(); return; }
  player.inventory = player.inventory.filter((x) => x.id !== itemId);
  pushLog('🏷️ Лот выставлен: «{item}» за {price} {icon}.', {item:L(it.name), price, icon});
  saveGame();
  loadMarket();
  render();
}

// Купить лот (валюта — монеты или души, по лоту)
async function buyLot(id) {
  if (marketBusy) return;
  const lot = marketLots.find((l) => l.id === id);
  if (!lot) { showToast('Лот недоступен'); loadMarket(); return; }
  const cur = lot.currency === 'souls' ? 'souls' : 'gold';
  const icon = cur === 'souls' ? '👻' : '🪙';
  if (!hasRes(cur, lot.price)) { showToast(cur === 'souls' ? '👻 Недостаточно Душ' : '🪙 Недостаточно золота'); return; }
  marketBusy = true;
  const resp = await _marketPost('/market/buy', { id });
  marketBusy = false;
  if (!resp.ok) {
    const why = resp.data && resp.data.error === 'gone' ? 'лот уже продан' : resp.data && resp.data.error === 'own' ? 'это ваш лот' : 'ошибка';
    pushLog('❌ Покупка не удалась: {why}.', {why});
    loadMarket(); render(); return;
  }
  const bought = resp.data.lot;
  spendRes(cur, lot.price);
  if (bought.kind === 'res') { addRes(bought.res, bought.qty); pushLog('🛍️ Куплено: {qty}× {res} за {price} {icon}.', {qty:bought.qty, res:rName(bought.res), price:lot.price, icon}); }
  else { addItem(bought.item); pushLog('🛍️ Куплено: «{item}» за {price} {icon}.', {item:L(bought.item.name), price:lot.price, icon}); }
  saveGame();
  loadMarket();
  render();
}

// Снять свой лот (вернуть товар)
async function cancelLot(id) {
  if (marketBusy) return;
  marketBusy = true;
  const resp = await _marketPost('/market/cancel', { id });
  marketBusy = false;
  if (!resp.ok) { pushLog('❌ Не удалось снять лот.'); loadMarket(); render(); return; }
  const lot = resp.data.lot;
  if (lot.kind === 'res') { addRes(lot.res, lot.qty); pushLog('↩️ Лот снят, возвращено {qty}× {res}.', {qty:lot.qty, res:rName(lot.res)}); }
  else { addItem(lot.item); pushLog('↩️ Лот снят, «{item}» вернулся в рюкзак.', {item:L(lot.item.name)}); }
  saveGame();
  loadMarket();
  render();
}

function _lotLabel(lot) {
  if (lot.kind === 'res') return `${RESOURCES[lot.res] ? RESOURCES[lot.res].icon : '📦'} ${lot.qty}× ${RESOURCES[lot.res] ? rName(lot.res) : lot.res}`;
  const it = lot.item;
  let s = [];
  if (it.dmg) s.push(`${t('урон')} ${it.dmg[0]}–${it.dmg[1]}`);
  if (it.armor) s.push(`броня ${it.armor}`);
  if (it.bonus) s.push(Object.entries(it.bonus).map(([k, v]) => `+${v} ${sName(k)}`).join(', '));
  return `⚔️ ${esc(t(it.name))}${s.length ? ` <span class="muted">(${s.join(' · ')})</span>` : ''}`;
}

// категория слота для табов барахолки
function _mkGearCat(slot) {
  if (slot === 'weapon') return 'weapon';
  if (['head', 'body', 'shield'].includes(slot)) return 'armor';
  if (['ring', 'amulet', 'earring'].includes(slot)) return 'jewelry';
  return 'other';
}
function _mkItemStats(it) {
  const s = [];
  if (it.dmg) s.push(`${t('урон')} ${it.dmg[0]}–${it.dmg[1]}`);
  if (it.armor) s.push(`броня ${it.armor}`);
  if (it.bonus) s.push(Object.entries(it.bonus).map(([k, v]) => `+${v} ${sName(k)}`).join(', '));
  if (it.req) s.push(reqHtml(it.req));
  return s.filter(Boolean).join(' · ');
}
// карточка вещи на рынке (с артом, рарностью, заточкой, статами) + блок действий
function _mkItemCard(it, action) {
  const rar = it.rarity && RARITIES[it.rarity];
  const set = it.set && GEAR_SETS[it.set];
  return `<div class="mk-card${rar ? ' rar' : ''}"${rar ? ` style="border-left-color:${rar.color}"` : ''}>
    <div class="mk-card-art">${itemArt(it)}</div>
    <div class="mk-card-body">
      <div class="mk-card-name"><b${rar ? ` style="color:${rar.color}"` : ''}>${esc(t(it.name))}${plusLabel(it)}</b>${rar ? ` <span class="rar-tag" style="color:${rar.color}">${t(rar.name)}</span>` : ''}</div>
      ${set ? `<div class="ic-set">🎽 ${esc(t(set.name))}</div>` : ''}
      <div class="mk-card-stats">${_mkItemStats(it)}</div>
      ${action}
    </div>
  </div>`;
}

function viewMarket() {
  if (!_marketOnline()) {
    return `<div class="panel"><h2>🏷️ Барахолка</h2>
      <p class="muted">Торговля между игроками доступна только в Telegram (нужен облачный аккаунт). Открой игру через бота.</p></div>`;
  }
  const myId = String(TG_USER.id);
  const souls = marketCur === 'souls';
  const cur = souls ? 'souls' : 'gold';
  const icon = souls ? '👻' : '🪙';
  const lotCur = (l) => (l.currency === 'souls' ? 'souls' : 'gold');
  const inCur = (l) => lotCur(l) === cur;
  const mine = marketLots.filter((l) => String(l.sellerId) === myId && inCur(l));
  const others = marketLots.filter((l) => String(l.sellerId) !== myId && inCur(l));
  const myItemN = mine.filter((l) => l.kind === 'item').length;
  const myResN = mine.filter((l) => l.kind === 'res').length;

  // Верхние вкладки — валюта продажи
  const curTabs = `<div class="mk-tabs" style="grid-template-columns:1fr 1fr">
    <button class="mk-tab ${!souls ? 'on' : ''}" onclick="marketCur='gold';render()">🪙 ${t('За монеты')}</button>
    <button class="mk-tab ${souls ? 'on' : ''}" onclick="marketCur='souls';render()">👻 ${t('За души')}</button>
  </div>`;

  // Подвкладки: за души ресурсами не торгуют
  let mt = marketTab;
  if (souls && (mt === 'buyRes' || mt === 'sellRes')) mt = 'buyItems';
  const TABS = souls
    ? [['buyItems', '🛒 ' + t('Купить вещи')], ['sellItems', `🏷️ ${t('Продать вещи')}${myItemN ? ` (${myItemN})` : ''}`]]
    : [['buyItems', '🛒 ' + t('Купить вещи')], ['sellItems', `🏷️ ${t('Продать вещи')}${myItemN ? ` (${myItemN})` : ''}`], ['buyRes', '📥 ' + t('Купить ресурсы')], ['sellRes', `📤 ${t('Продать ресурсы')}${myResN ? ` (${myResN})` : ''}`]];
  const tabBtns = TABS.map(([id, label]) => `<button class="mk-tab ${mt === id ? 'on' : ''}" onclick="marketTab='${id}';render()">${label}</button>`).join('');
  const GTABS = [['weapon', '⚔️ Оружие'], ['armor', '🛡 Доспехи'], ['jewelry', '💍 Бижутерия']];
  const gearTabs = () => `<div class="mk-subtabs">${GTABS.map(([id, label]) => `<button class="mk-subtab ${marketGearTab === id ? 'on' : ''}" onclick="marketGearTab='${id}';render()">${label}</button>`).join('')}</div>`;

  let bodyHtml = '';
  if (mt === 'buyItems') {
    const lots = others.filter((l) => l.kind === 'item' && _mkGearCat(l.item.slot) === marketGearTab);
    const cards = lots.length ? `<div class="mk-grid">${lots.map((l) => _mkItemCard(l.item,
      `<div class="mk-card-foot"><span class="muted">${esc(l.sellerName || 'Полубог')}</span><span class="mk-price">${l.price} ${icon}</span>
        <button class="mini" ${hasRes(cur, l.price) ? '' : 'disabled'} onclick="buyLot('${l.id}')">купить</button></div>`)).join('')}</div>`
      : '<p class="muted">В этой категории пока никто ничего не продаёт.</p>';
    bodyHtml = gearTabs() + cards;
  } else if (mt === 'sellItems') {
    const myItemLots = mine.filter((l) => l.kind === 'item' && _mkGearCat(l.item.slot) === marketGearTab);
    const myHtml = myItemLots.length ? `<h4 class="mk-h4">📦 Мои выставленные</h4><div class="mk-grid">${myItemLots.map((l) => _mkItemCard(l.item,
      `<div class="mk-card-foot"><span class="mk-price">${l.price} ${icon}</span><button class="mini" onclick="cancelLot('${l.id}')">снять</button></div>`)).join('')}</div>` : '';
    // За души продаются только сетовые вещи, за монеты — только несетовые
    const inv = player.inventory.filter((it) => it.slot && !it.rented && _mkGearCat(it.slot) === marketGearTab && (!!it.set === souls));
    const invHtml = inv.length ? `<div class="mk-grid">${inv.map((it) => _mkItemCard(it,
      `<div class="mk-card-foot"><input id="mk-iprice-${it.id}" class="mk-input" type="number" min="1" placeholder="${t('цена')} ${icon}"><button class="mini" onclick="listItemLot(${it.id})">выставить</button></div>`)).join('')}</div>`
      : `<p class="muted">${souls ? t('В рюкзаке нет сетовых вещей этой категории.') : t('В рюкзаке нет вещей этой категории.')}</p>`;
    bodyHtml = gearTabs() + myHtml + '<h4 class="mk-h4">🎒 Из рюкзака</h4>' + invHtml;
  } else if (mt === 'buyRes') {
    const lots = others.filter((l) => l.kind === 'res');
    bodyHtml = lots.length ? `<div class="mk-list">${lots.map((l) => `<div class="mk-lot">
      <span>${_lotLabel(l)} <span class="muted">— ${esc(l.sellerName || 'Полубог')}</span></span>
      <span class="mk-price">${l.price} 🪙</span>
      <button class="mini" ${hasRes('gold', l.price) ? '' : 'disabled'} onclick="buyLot('${l.id}')">купить</button>
    </div>`).join('')}</div>` : '<p class="muted">Ресурсов на продажу пока нет.</p>';
  } else { // sellRes
    const myResLots = mine.filter((l) => l.kind === 'res');
    const myHtml = myResLots.length ? `<h4 class="mk-h4">📦 Мои выставленные</h4><div class="mk-list">${myResLots.map((l) => `<div class="mk-lot">
      <span>${_lotLabel(l)}</span><span class="mk-price">${l.price} 🪙</span>
      <button class="mini" onclick="cancelLot('${l.id}')">снять</button></div>`).join('')}</div>` : '';
    const sellRes = Object.keys(RESOURCES).filter((k) => !RESOURCES[k].special && (player.resources[k] || 0) > 0)
      .map((k) => `<div class="mk-sell-row">
        <span>${RESOURCES[k].icon} ${rName(k)} <span class="muted">(${t('есть')} ${player.resources[k]})</span></span>
        <input id="mk-qty-${k}" class="mk-input" type="number" min="1" max="${player.resources[k]}" placeholder="кол-во">
        <input id="mk-price-${k}" class="mk-input" type="number" min="1" placeholder="${t('цена')} 🪙">
        <button class="mini" onclick="listResourceLot('${k}')">выставить</button>
      </div>`).join('') || '<p class="muted">Нет ресурсов для продажи.</p>';
    bodyHtml = myHtml + '<h4 class="mk-h4">🪙 Выставить ресурсы</h4><div class="mk-sell">' + sellRes + '</div>';
  }

  const feeNote = souls
    ? t('За души продаются сетовые вещи. Комиссия — 10% (сжигается). Выручка приходит при следующей синхронизации.')
    : t('Торговля между полубогами. Комиссия с продажи — 1%. Выручка приходит при следующей синхронизации.');
  return `<div class="panel">
    <h2>🏷️ Барахолка</h2>
    <p class="muted">${feeNote}</p>
    ${!marketLoaded ? '<p class="muted">Загрузка лотов…</p>' : ''}
    ${curTabs}
    <div class="mk-tabs">${tabBtns}</div>
    ${bodyHtml}
  </div>`;
}

// ---------------- Кланы ----------------
const CLAN_CREATE_COST = 1000;

async function loadClansView() {
  if (!_marketOnline()) return;
  try {
    const [meR, allR] = await Promise.all([
      fetch(`${CLOUD_URL}/clan?user_id=${TG_USER.id}`),
      fetch(`${CLOUD_URL}/clans`),
    ]);
    player.clan = meR.ok ? await meR.json() : null;
    // защита от устаревшего KV: не даём GET откатить состояние босса к уже убитому
    if (_raidAuth && player.clan && player.clan.raid && _raidAuth._clanId === player.clan.id) player.clan.raid = _pickRaid(player.clan.raid, _raidAuth);
    clansList = allR.ok ? await allR.json() : [];
    clansLoaded = true;
    reconcileRentals(player.clan && player.clan.shop ? player.clan.shop : []);
    recalc();
    saveGame();
    if (activeView === 'clans') render();
  } catch (e) {}
}

async function createClan() {
  if (clanBusy) return;
  const name = ($('clan-name')?.value || '').trim();
  const tag = ($('clan-tag')?.value || '').trim();
  if (name.length < 3) { showToast('Название от 3 символов'); return; }
  if (!hasRes('gold', CLAN_CREATE_COST)) { showToast(tp('🪙 Нужно {n} золота', {n:CLAN_CREATE_COST})); return; }
  clanBusy = true;
  const resp = await _marketPost('/clan/create', { name, tag });
  clanBusy = false;
  if (!resp.ok) { pushLog(resp.data && resp.data.error === 'already' ? '❌ Вы уже состоите в клане.' : '❌ Не удалось создать клан.'); render(); return; }
  spendRes('gold', CLAN_CREATE_COST);
  pushLog('🛡 Клан «{name}» основан! Списано {cost} 🪙.', {name, cost:CLAN_CREATE_COST});
  saveGame();
  loadClansView();
  render();
}

async function joinClan(id) {
  if (clanBusy) return;
  clanBusy = true;
  const resp = await _marketPost('/clan/apply', { clanId: id });
  clanBusy = false;
  if (!resp.ok) {
    const why = resp.data && resp.data.error;
    pushLog('❌ Не удалось вступить: {why}.', {why:why === 'already' ? L('вы уже в клане') : why === 'full' ? L('клан переполнен') : why === 'gone' ? L('клан не найден') : L('ошибка')});
    loadClansView(); render(); return;
  }
  if (resp.data && resp.data.pending) { pushLog('📨 Заявка отправлена — ждите решения лидера.'); showToast('📨 Заявка отправлена'); }
  else pushLog('🛡 Вы вступили в клан!');
  loadClansView();
  render();
}

// действия лидера/офицера над участником и заявками
async function _clanAction(path, payload, okMsg) {
  if (clanBusy) return;
  clanBusy = true;
  const resp = await _marketPost(path, payload);
  clanBusy = false;
  if (!resp.ok) {
    const e = resp.data && resp.data.error;
    const map = { noperm: 'нет прав', notleader: 'только лидер', leader: 'нельзя над лидером', self: 'нельзя над собой', full: 'клан переполнен', busy: 'игрок уже в другом клане', notmember: 'не участник', noapp: 'заявки нет' };
    pushLog('❌ Не вышло: {why}.', {why:map[e] ? L(map[e]) : L('ошибка')});
    loadClansView(); render(); return;
  }
  if (okMsg) pushLog(okMsg);
  loadClansView();
  render();
}
function clanApplicant(targetId, action) { _clanAction('/clan/applicant', { targetId, action }, action === 'accept' ? '✅ Заявка принята.' : '🚫 Заявка отклонена.'); }
function clanPromote(targetId) { _clanAction('/clan/promote', { targetId }, '🎖 Роль обновлена.'); }
function clanKick(targetId) { if (typeof confirm === 'function' && !confirm(L('Исключить участника из клана?'))) return; _clanAction('/clan/kick', { targetId }, '⚔️ Участник исключён.'); }
function clanTransfer(targetId) { if (typeof confirm === 'function' && !confirm(L('Передать лидерство этому участнику? Вы станете офицером.'))) return; _clanAction('/clan/transfer', { targetId }, '👑 Лидерство передано.'); }
function clanToggleOpen() { _clanAction('/clan/toggle-open', {}, '🔁 Режим приёма изменён.'); }

async function leaveClan() {
  if (clanBusy) return;
  if (typeof confirm === 'function' && !confirm('Покинуть клан? Бонус клана пропадёт.')) return;
  clanBusy = true;
  const resp = await _marketPost('/clan/leave', {});
  clanBusy = false;
  if (!resp.ok) { pushLog('❌ Не удалось покинуть клан.'); return; }
  player.clan = null;
  recalc();
  pushLog('🚪 Вы покинули клан.');
  saveGame();
  loadClansView();
  render();
}

async function donateClan() {
  if (clanBusy) return;
  const amount = Math.floor(+($('clan-donate')?.value || 0));
  if (!(amount > 0)) { showToast('Укажите сумму'); return; }
  if (!hasRes('gold', amount)) { showToast('🪙 Недостаточно золота'); return; }
  clanBusy = true;
  const resp = await _marketPost('/clan/donate', { amount });
  clanBusy = false;
  if (!resp.ok) { pushLog('❌ Взнос не прошёл.'); return; }
  spendRes('gold', amount);
  pushLog('💰 Взнос в казну клана: {amount} 🪙.', {amount});
  saveGame();
  loadClansView();
  render();
}

async function upgradeClan(key) {
  if (clanBusy) return;
  clanBusy = true;
  const resp = await _marketPost('/clan/upgrade', { key });
  clanBusy = false;
  if (!resp.ok) {
    const e = resp.data && resp.data.error;
    pushLog('❌ Улучшение не прошло: {why}.', {why:e === 'treasury' ? L('мало золота в казне') : e === 'notleader' ? L('только лидер') : e === 'max' ? L('уже максимум') : L('ошибка')});
    render(); return;
  }
  pushLog('⚜️ Клан улучшен: {name}!', {name:CLAN_UPGRADES[key] ? L(CLAN_UPGRADES[key].name) : key});
  loadClansView();
  render();
}


// --- Клан-арсенал (магазин с арендой) ---
// Убирает у игрока арендованные вещи, которые он больше не арендует
// (владелец забрал или аренда отменена). Работает и для надетых вещей.
function reconcileRentals(shop) {
  const myId = String((window.TG_USER && TG_USER.id) || '');
  const mine = new Set((shop || []).filter((e) => String(e.rentedBy) === myId).map((e) => e.sid));
  const removed = [];
  Object.keys(player.equip || {}).forEach((slot) => {
    const it = player.equip[slot];
    if (it && it.rented && it.sid && !mine.has(it.sid)) { removed.push(it.name); player.equip[slot] = null; }
  });
  player.inventory = (player.inventory || []).filter((it) => {
    if (it && it.rented && it.sid && !mine.has(it.sid)) { removed.push(it.name); return false; }
    return true;
  });
  if (removed.length) {
    recalc();
    pushLog('🔒 Арендованное вернулось владельцу: {items}.', {items:removed.map((n) => L(n)).join(', ')});
    saveGame();
  }
}

async function lendItem(itemId) {
  if (clanBusy) return;
  const it = player.inventory.find((x) => x.id === itemId);
  if (!it || !it.slot) { showToast('Можно одолжить только экипировку'); return; }
  if (it.rented) { showToast('Нельзя одолжить арендованное'); return; }
  clanBusy = true;
  const resp = await _marketPost('/clan/shop/lend', { item: it });
  clanBusy = false;
  if (!resp.ok) {
    const e = resp.data && resp.data.error;
    pushLog('❌ Не удалось одолжить: {why}.', {why:e === 'shopfull' ? L('арсенал переполнен') : e === 'ownerfull' ? L('лимит 20 вещей от вас') : e === 'item' ? L('не экипировка') : L('ошибка')});
    render(); return;
  }
  player.inventory = player.inventory.filter((x) => x.id !== itemId);
  pushLog('📦 «{item}» выставлено в клановый арсенал.', {item:L(it.name)});
  saveGame();
  loadClansView();
  render();
}

async function rentShopItem(sid) {
  if (clanBusy) return;
  if ([...player.inventory, ...Object.values(player.equip)].some((it) => it && it.sid === sid)) { showToast('Уже арендовано'); return; }
  clanBusy = true;
  const resp = await _marketPost('/clan/shop/rent', { sid });
  clanBusy = false;
  if (!resp.ok) {
    const e = resp.data && resp.data.error;
    pushLog('❌ Не удалось арендовать: {why}.', {why:e === 'taken' ? L('уже арендовано') : e === 'own' ? L('это ваша вещь') : L('ошибка')});
    loadClansView(); render(); return;
  }
  const rec = { ...resp.data.item, id: ++_itemId, rented: true, sid, rentOwnerName: resp.data.ownerName || '' };
  player.inventory.push(rec);
  pushLog('🔑 Арендовано: «{item}» (владелец: {owner}). Можно только носить.', {item:L(rec.name), owner:rec.rentOwnerName});
  saveGame();
  loadClansView();
  render();
}

async function returnShopItem(sid) {
  if (clanBusy) return;
  clanBusy = true;
  const resp = await _marketPost('/clan/shop/return', { sid });
  clanBusy = false;
  if (!resp.ok) { pushLog('❌ Не удалось вернуть аренду.'); loadClansView(); render(); return; }
  reconcileRentals((player.clan && player.clan.shop ? player.clan.shop : []).map((e) => e.sid === sid ? { ...e, rentedBy: null } : e));
  pushLog('↩️ Аренда возвращена в арсенал.');
  saveGame();
  loadClansView();
  render();
}

async function reclaimShopItem(sid) {
  if (clanBusy) return;
  clanBusy = true;
  const resp = await _marketPost('/clan/shop/reclaim', { sid });
  clanBusy = false;
  if (!resp.ok) { pushLog('❌ Не удалось забрать вещь.'); loadClansView(); render(); return; }
  if (resp.data && resp.data.item) {
    const back = { ...resp.data.item, id: ++_itemId };
    delete back.rented; delete back.sid; delete back.rentOwnerName;
    player.inventory.push(back);
    pushLog('📥 «{item}» возвращена в ваш инвентарь.', {item:L(back.name)});
  }
  saveGame();
  loadClansView();
  render();
}

function clanAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts; const m = Math.floor(d / 60000);
  if (m < 1) return t('только что');
  if (m < 60) return tp('{n}м назад', {n:m});
  const h = Math.floor(m / 60);
  if (h < 24) return tp('{n}ч назад', {n:h});
  return tp('{n}д назад', {n:Math.floor(h / 24)});
}

// Клиентская локализация серверных строк клана (события, имя рейд-босса).
function _locBossName(n) {
  if (!n) return n;
  const suf = (String(n).match(/(\s*⭐|\s*\+\d+)+$/) || [''])[0];
  const base = String(n).slice(0, String(n).length - suf.length);
  return (t(base) !== base ? t(base) : base) + suf;
}
function localizeClanEvent(text) {
  if (LANG === 'ru' || !text) return text;
  const _it = (n) => t(n); // имя предмета/моба
  let m;
  if ((m = text.match(/^🐉 Босс «(.+?)» \(тир (\d+)\) повержен!$/))) return `🐉 Boss «${_locBossName(m[1])}» (tier ${m[2]}) defeated!`;
  if ((m = text.match(/^💰 (.+?): \+(\d+) 🪙 в казну$/))) return `💰 ${m[1]}: +${m[2]} 🪙 to treasury`;
  if ((m = text.match(/^🚪 (.+?) покинул клан$/))) return `🚪 ${m[1]} left the clan`;
  if ((m = text.match(/^👑 Новый лидер: (.+)$/))) return `👑 New leader: ${m[1]}`;
  if ((m = text.match(/^👑 Лидерство передано: (.+)$/))) return `👑 Leadership transferred: ${m[1]}`;
  if ((m = text.match(/^⚜️ Улучшение «(.+?)» до ур\. (\d+) \(−(\d+) 🪙\)$/))) {
    const u = (typeof CLAN_UPGRADES !== 'undefined' && CLAN_UPGRADES[m[1]]) ? t(CLAN_UPGRADES[m[1]].name) : m[1];
    return `⚜️ Upgrade «${u}» to lv. ${m[2]} (−${m[3]} 🪙)`;
  }
  if ((m = text.match(/^🛡 (.+?) вступил в клан$/))) return `🛡 ${m[1]} joined the clan`;
  if ((m = text.match(/^🛡 (.+?) принят в клан$/))) return `🛡 ${m[1]} accepted into the clan`;
  if ((m = text.match(/^⚔️ (.+?) исключён из клана$/))) return `⚔️ ${m[1]} kicked from the clan`;
  if ((m = text.match(/^🎖 (.+?) назначен офицером$/))) return `🎖 ${m[1]} made an officer`;
  if ((m = text.match(/^🎖 (.+?) снят с офицеров$/))) return `🎖 ${m[1]} removed from officers`;
  if ((m = text.match(/^📢 (.+?) обновил сообщение дня$/))) return `📢 ${m[1]} updated the message of the day`;
  if ((m = text.match(/^📦 (.+?) выставил «(.+?)» в арсенал$/))) return `📦 ${m[1]} listed «${_it(m[2])}» in the armory`;
  if ((m = text.match(/^🔑 (.+?) арендовал «(.+?)»$/))) return `🔑 ${m[1]} rented «${_it(m[2])}»`;
  if ((m = text.match(/^📥 (.+?) забрал «(.+?)» из арсенала$/))) return `📥 ${m[1]} retrieved «${_it(m[2])}» from the armory`;
  return text;
}

// Авторитетное состояние рейд-босса из ответа сервера на удар.
// KV у Cloudflare eventually consistent: сразу после убийства босса обычный
// GET /clan может вернуть СТАРОГО (уже убитого) босса с hp 0. Если по нему
// «воевать» — урон 0, кил не засчитывается и награды нет. Поэтому держим
// свежий снимок из ответа /clan/raid/hit и сверяем его с возможно устаревшим GET.
let _raidAuth = null;
function _pickRaid(a, b) {
  if (!a) return b; if (!b) return a;
  if ((a.tier || 0) !== (b.tier || 0)) return (a.tier > b.tier) ? a : b; // выше тир = босс уже сменился (новее)
  return ((a.hp || 0) <= (b.hp || 0)) ? a : b; // тот же тир — меньше HP = больше прогресса
}
// Рейд = настоящий интерактивный бой с боссом. HP босса = общий остаток пула
// клана; нанесённый в бою урон отправляется на сервер по завершении боя.
async function startClanRaid() {
  if (clanBusy || combat) return;
  // свежий снимок состояния босса (кто-то мог уже его потрепать)
  clanBusy = true;
  try { const r = await fetch(`${CLOUD_URL}/clan?user_id=${TG_USER.id}`); if (r.ok) player.clan = await r.json(); } catch (e) {}
  clanBusy = false;
  // сверяем GET с авторитетным снимком из последнего удара (защита от устаревшего KV)
  if (_raidAuth && player.clan && player.clan.raid && _raidAuth._clanId === player.clan.id) player.clan.raid = _pickRaid(player.clan.raid, _raidAuth);
  const rd = player.clan && player.clan.raid;
  if (!rd) { showToast('Рейд недоступен'); return; }
  if (rd.cdLeft > 0) { showToast(tp('⏳ Перезарядка ~{n} мин', {n:Math.ceil(rd.cdLeft / 60000)})); render(); return; }
  if (rd.hp <= 0) { loadClansView(); render(); return; }
  // характеристики босса — по тиру (с потолком агрессии, чтобы глубокие тиры
  // не ваншотили), HP = общий остаток пула клана
  const baseName = (rd.name || 'Босс').replace(/\s*\+\d+$/, '');
  const boss = genMob(Math.min(rd.tier, 6), baseName, 120);
  boss.isBoss = true;
  boss.name = rd.name || baseName;
  boss.maxHp = boss.hp = rd.hp;
  boss.worldTier = rd.tier;
  startCombat([boss], { raid: true, bossStartHp: rd.hp, raidTier: rd.tier });
  openCombat();
}

// Вызывается из endCombat по завершении рейд-боя — засчитывает урон серверу.
async function onRaidCombatEnd(dealt, killed) {
  if (!(dealt > 0)) { loadClansView(); return; }
  const resp = await _marketPost('/clan/raid/hit', { dmg: dealt });
  if (!resp.ok) {
    const e = resp.data && resp.data.error;
    pushLog(e === 'cooldown' ? '⏳ Рейд на перезарядке — урон не засчитан.' : '❌ Урон по боссу не засчитан.');
    loadClansView(); return;
  }
  // запоминаем авторитетное состояние босса (после кила — это уже следующий босс)
  if (resp.data.raid) _raidAuth = { ...resp.data.raid, _clanId: player.clan && player.clan.id };
  pushLog('⚔️ Боссу клана нанесено {dmg} урона.', {dmg:resp.data.dmg});
  if (resp.data.killed) { pushLog('🐉 Босс клана повержен! Забери награду: Кланы → Рейд.'); showToast('🐉 Босс повержен!'); }
  // обновим экран итога боя авторитетными данными сервера
  if (combat && combat.over && combat.ctx && combat.ctx.raid) {
    combat.raidKilled = !!resp.data.killed;
    combat.raidServerDmg = resp.data.dmg;
    if (typeof renderCombat === 'function') renderCombat();
  }
  loadClansView();
}

async function raidClaim() {
  if (clanBusy) return;
  clanBusy = true;
  const resp = await _marketPost('/clan/raid/claim', {});
  clanBusy = false;
  if (!resp.ok) { pushLog('❌ Награды нет.'); loadClansView(); render(); return; }
  const r = resp.data.reward || {};
  if (r.gold) addRes('gold', r.gold);
  if (r.sparks) addRes('sparks', r.sparks);
  if (r.xp) gainXp(r.xp);
  pushLog('🎁 Награда за рейд: +{gold} 🪙, +{sparks} ✨{xp}.', {gold:r.gold || 0, sparks:r.sparks || 0, xp:r.xp ? (', +' + r.xp + ' ' + L('опыта')) : ''});
  saveGame();
  loadClansView();
  render();
}

function viewClans() {
  if (!_marketOnline()) {
    return `<div class="panel"><h2>🛡️ Кланы</h2>
      <p class="muted">Кланы доступны только в Telegram (нужен облачный аккаунт). Открой игру через бота.</p></div>`;
  }
  if (!clansLoaded) return `<div class="panel"><h2>🛡️ Кланы</h2><p class="muted">Загрузка…</p></div>`;

  const c = player.clan;
  if (c && c.members) {
    const ups = c.upgrades || {};
    const sizeBuff = Math.min(4, Math.floor(c.size / 3));
    const buff = sizeBuff + (ups.artifact || 0);
    const myId = String(TG_USER.id);
    const isLeader = String(c.leaderId) === myId;
    const meMember = c.members.find((m) => String(m.id) === myId);
    const isOfficer = !!(meMember && meMember.isOfficer);
    const canManage = isLeader || isOfficer;
    const members = c.members.map((m) => {
      const role = m.isLeader ? '👑 ' : (m.isOfficer ? '🎖 ' : '');
      let ctrl = '';
      if (!m.isLeader && String(m.id) !== myId) {
        // лидер: офицер-тоггл, передача, кик; офицер: кик только рядовых
        if (isLeader) {
          ctrl += `<button class="mini" title="${m.isOfficer ? 'снять офицера' : 'сделать офицером'}" onclick="clanPromote('${m.id}')">${m.isOfficer ? '➖🎖' : '➕🎖'}</button>`;
          ctrl += `<button class="mini" title="передать лидерство" onclick="clanTransfer('${m.id}')">👑</button>`;
          ctrl += `<button class="mini danger" title="исключить" onclick="clanKick('${m.id}')">⚔️</button>`;
        } else if (isOfficer && !m.isOfficer) {
          ctrl += `<button class="mini danger" title="исключить" onclick="clanKick('${m.id}')">⚔️</button>`;
        }
      }
      return `<div class="clan-member">
      <span>${role}${esc(m.name)}</span>
      <span class="clan-member-r"><span class="muted">${t('ур.')} ${m.xpLevel} · ${t('опасн.')} ${m.danger}</span>${ctrl}</span>
    </div>`;
    }).join('');
    const apps = c.applicants || [];
    const appsHtml = (canManage && apps.length) ? `<h3>📨 ${t('Заявки')} (${apps.length})</h3>
      <div class="clan-apps">${apps.map((a) => `<div class="clan-member">
        <span>${esc(a.name)}</span>
        <span class="clan-member-r">
          <button class="mini" onclick="clanApplicant('${a.id}','accept')">✅ принять</button>
          <button class="mini danger" onclick="clanApplicant('${a.id}','reject')">🚫</button>
        </span>
      </div>`).join('')}</div>` : '';
    const upHtml = CLAN_UPGRADE_ORDER.map((key) => {
      const u = CLAN_UPGRADES[key]; const lvl = ups[key] || 0;
      const cost = clanUpgradeCost(lvl); const maxed = lvl >= CLAN_UPGRADE_MAX;
      const btn = isLeader
        ? (maxed ? '<span class="muted">макс</span>'
          : `<button class="mini" ${c.treasury >= cost ? '' : 'disabled'} onclick="upgradeClan('${key}')">⬆ ${cost} 🪙</button>`)
        : `<span class="tag">ур. ${lvl}</span>`;
      return `<div class="clan-up">
        <span class="clan-up-info">${u.icon} <b>${u.name}</b> <span class="tag">${lvl}/${CLAN_UPGRADE_MAX}</span><div class="muted">${u.desc}</div></span>
        ${btn}
      </div>`;
    }).join('');
    // клановый рейд (общий босс)
    let raidHtml = '';
    const rd = c.raid;
    if (rd) {
      const pct = Math.max(0, Math.min(100, Math.round((rd.hp / rd.hpMax) * 100)));
      const canHit = !(rd.cdLeft > 0);
      const cdMin = Math.ceil((rd.cdLeft || 0) / 60000);
      const top = (rd.top || []).map((t, i) => `<div class="kv"><span>${['🥇', '🥈', '🥉'][i] || '•'} ${esc(t.name)}</span><b>${t.dmg}</b></div>`).join('');
      raidHtml = `<h3>🐉 Клановый рейд</h3>
        <div class="raid-box">
          <div class="raid-head"><b>${esc(_locBossName(rd.name))}</b> <span class="tag">${t('тир')} ${rd.tier}</span></div>
          <div class="raid-bar"><div class="raid-bar-fill" style="width:${pct}%"></div><span class="raid-bar-txt">${rd.hp} / ${rd.hpMax} HP</span></div>
          <button class="big" ${canHit ? '' : 'disabled'} onclick="startClanRaid()">${canHit ? t('⚔️ В бой с боссом') : tp('⏳ Перезарядка ~{n} мин', {n:cdMin})}</button>
          <p class="muted">Твой вклад: <b>${rd.myDmg || 0}</b> урона · полноценный бой без лимита урона: бей сколько выдержишь. Перезарядка 10 мин — только если отступил/пал (босс выжил); убил — сразу следующий.</p>
          ${top ? `<div class="raid-top"><div class="muted">Лучшие бойцы:</div>${top}</div>` : ''}
        </div>`;
    }
    const rewardHtml = c.raidReward ? `<div class="raid-reward">🎁 Награда за рейд: <b>+${c.raidReward.gold || 0} 🪙, +${c.raidReward.sparks || 0} ✨${c.raidReward.xp ? `, +${c.raidReward.xp} опыта` : ''}</b> <button class="mini" onclick="raidClaim()">забрать</button></div>` : '';
    // лог событий клана
    const log = c.log || [];
    const logHtml = log.length ? `<h3>📜 События клана</h3>
      <div class="clan-log">${log.map((e) => `<div class="clan-log-row"><span>${esc(localizeClanEvent(e.text))}</span><span class="muted">${clanAgo(e.ts)}</span></div>`).join('')}</div>` : '';
    // клан-арсенал (магазин с арендой)
    const shop = c.shop || [];
    const shopRows = shop.length ? shop.map((e) => {
      const it = e.item || {};
      const mine = String(e.ownerId) === myId;
      const byMe = String(e.rentedBy) === myId;
      const stat = [];
      if (it.dmg) stat.push(`${t('урон')} ${it.dmg[0]}–${it.dmg[1]}`);
      if (it.armor) stat.push(`${t('броня')} ${it.armor}`);
      if (it.bonus && typeof it.bonus === 'object') stat.push(Object.entries(it.bonus).map(([k, v]) => `+${v} ${sName(k)}`).join(', '));
      const rar = it.rarity && RARITIES[it.rarity];
      let btn = '';
      let rentLine = '';
      if (mine) {
        btn = `<button class="mini danger" onclick="reclaimShopItem('${e.sid}')">📥 забрать</button>`;
        if (e.rentedBy) rentLine = `🔑 аренда: ${esc(e.rentedByName)}`;
      } else if (byMe) {
        btn = `<button class="mini" onclick="returnShopItem('${e.sid}')">↩️ вернуть</button>`;
        rentLine = 'вы арендуете';
      } else if (e.rentedBy) {
        rentLine = `занято: ${esc(e.rentedByName)}`;
      } else {
        btn = `<button class="mini" onclick="rentShopItem('${e.sid}')">🔑 арендовать</button>`;
      }
      return `<div class="shop-row">
        <span class="shop-thumb">${itemArt(it)}</span>
        <span class="shop-info"><b${rar ? ` style="color:${rar.color}"` : ''}>${esc(t(it.name))}${it.plus ? ` +${it.plus}` : ''}</b> <span class="muted">${esc(it.type || '')} · от ${esc(e.ownerName)}</span><div class="muted">${stat.filter(Boolean).join(' · ')}</div>${rentLine ? `<div class="shop-rent muted">${rentLine}</div>` : ''}</span>
        ${btn ? `<span class="shop-act">${btn}</span>` : ''}
      </div>`;
    }).join('') : '<p class="muted">Арсенал пуст. Одолжите вещь кнопкой 📦 в инвентаре.</p>';
    const shopHtml = `<h3>🏪 Клановый арсенал</h3>
      <p class="muted">Одолжи экипировку клану (📦 в инвентаре) или арендуй чужую. Арендованное можно только носить — владелец вправе забрать в любой момент.</p>
      <div class="clan-shop">${shopRows}</div>`;
    const openBadge = c.open ? '<span class="tag tag-ok">открыт</span>' : '<span class="tag tag-no">закрыт</span>';
    const openToggle = isLeader ? `<button class="mini" onclick="clanToggleOpen()">${c.open ? t('🔒 закрыть приём') : t('🔓 открыть приём')}</button>` : '';
    const appsCount = (canManage && apps.length) ? apps.length : 0;
    // вкладки внутри клана
    const tabs = [
      ['overview', '📋 ' + t('Обзор')],
      ['raid', `🐉 ${t('Рейд')}${c.raidReward ? ' 🎁' : ''}`],
      ['shop', `🏪 ${t('Арсенал')}${shop.length ? ` (${shop.length})` : ''}`],
      ['upgrades', '⚙️ ' + t('Улучшения')],
      ['roster', `👥 ${t('Состав')}${appsCount ? ` (${appsCount}❗)` : ''}`],
      ['chat', '💬 ' + t('Чат')],
      ['log', '📜 ' + t('Журнал')],
    ];
    const tabBar = `<div class="clan-tabs">${tabs.map(([k, l]) => `<button class="clan-tab${clanTab === k ? ' active' : ''}" onclick="setClanTab('${k}')">${l}</button>`).join('')}</div>`;
    let bodyHtml;
    if (clanTab === 'raid') {
      bodyHtml = `${rewardHtml}${raidHtml || '<p class="muted">Рейд пока недоступен.</p>'}`;
    } else if (clanTab === 'shop') {
      bodyHtml = shopHtml;
    } else if (clanTab === 'upgrades') {
      bodyHtml = `<h3>⚙️ Улучшения клана</h3>
        <p class="muted">${isLeader ? 'Вкладывай казну в улучшения — бонусы получают все участники.' : 'Улучшения покупает лидер из казны. Бонусы — всем участникам.'}</p>
        <div class="clan-ups">${upHtml}</div>`;
    } else if (clanTab === 'roster') {
      bodyHtml = `${appsHtml}
        <h3>Состав ${canManage ? '<span class="muted" style="font-weight:400">(👑 лидер · 🎖 офицер)</span>' : ''}</h3>
        <div class="clan-roster">${members}</div>`;
    } else if (clanTab === 'log') {
      bodyHtml = logHtml || '<p class="muted">Событий пока нет.</p>';
    } else if (clanTab === 'chat') {
      bodyHtml = `<p class="muted">Живой чат клана. Обновляется автоматически.</p>
        <div id="chat-msgs" class="chat-box">${chatMsgsHtml(chatClan)}</div>
        <div class="form-row chat-send">
          <input id="chat-input" class="mk-input" maxlength="240" placeholder="сообщение клану…" onkeydown="if(event.key==='Enter')sendClanChat()">
          <button class="mini chat-send-btn" onclick="sendClanChat()">отправить</button>
        </div>`;
    } else { // overview
      bodyHtml = `<div class="clan-buff">⚜️ ${t('Бонус клана:')} <b>+${buff}</b> ${t('ко всем статам')} (${sizeBuff} ${t('за состав')}${ups.artifact ? ` + ${ups.artifact} ${t('Артефакт')}` : ''})</div>
        ${rewardHtml}
        <div class="kv big-kv"><span>💰 Казна клана</span><b>${c.treasury} 🪙</b></div>
        <div class="form-row">
          <input id="clan-donate" class="mk-input" type="number" min="1" placeholder="сумма 🪙">
          <button class="mini" onclick="donateClan()">внести в казну</button>
          ${openToggle}
        </div>`;
    }
    return `<div class="panel">
      <h2>🛡️ ${esc(c.name)} ${c.tag ? `<span class="tag">[${esc(c.tag)}]</span>` : ''} ${openBadge}</h2>
      <p class="muted">Лидер: <b>${esc(c.leaderName)}</b> · Участников: <b>${c.size}/20</b></p>
      ${tabBar}
      <div class="clan-tab-body">${bodyHtml}</div>
      <button class="big danger" onclick="leaveClan()">🚪 Покинуть клан</button>
    </div>`;
  }

  const list = clansList.length ? clansList.map((cl) => `<div class="clan-row">
    <span><b>${esc(cl.name)}</b> ${cl.tag ? `<span class="tag">[${esc(cl.tag)}]</span>` : ''} ${cl.open ? '' : '<span class="tag tag-no">закрыт</span>'} <span class="muted">— ${esc(cl.leaderName)}</span></span>
    <span class="muted">👥 ${cl.size}/20 · 💰 ${cl.treasury}</span>
    <button class="mini" ${cl.size >= 20 ? 'disabled' : ''} onclick="joinClan('${cl.id}')">${cl.open ? 'вступить' : '📨 заявка'}</button>
  </div>`).join('') : '<p class="muted">Пока нет ни одного клана. Основай первый!</p>';

  return `<div class="panel">
    <h2>🛡️ Кланы</h2>
    <p class="muted">Вступи в клан или основай свой. Чем больше клан — тем выше пассивный бонус всем участникам (+1 к статам за каждые 3 бойца, до +4).</p>

    <h3>Основать клан</h3>
    <div class="form-row">
      <input id="clan-name" class="mk-input" style="width:160px" type="text" maxlength="24" placeholder="название">
      <input id="clan-tag" class="mk-input" style="width:80px" type="text" maxlength="5" placeholder="тег">
      <button class="mini" ${hasRes('gold', CLAN_CREATE_COST) ? '' : 'disabled'} onclick="createClan()">${t('создать за')} ${CLAN_CREATE_COST} 🪙</button>
    </div>

    <h3>${t('Кланы')} (${clansList.length})</h3>
    <div class="clan-list">${list}</div>
  </div>`;
}

function viewTavern() {
  const gold = player.resources.gold || 0;
  const t = (player.counters && player.counters.tavern) || { plays: 0, won: 0, lost: 0 };
  const bets = [10, 50, 100];
  const diceBtns = bets.map((b) => `<button class="mini" ${gold >= b ? '' : 'disabled'} onclick="playDice(${b})">${L('ставка')} ${b} 🪙</button>`).join('');
  const thimbleRows = [10, 50].map((b) => `<div class="thimble-row">
    <span class="muted">${L('ставка')} ${b} 🪙:</span>
    ${[0, 1, 2].map((i) => `<button class="mini" ${gold >= b ? '' : 'disabled'} onclick="playThimbles(${i},${b})">🥤 №${i + 1}</button>`).join('')}
  </div>`).join('');
  return `<div class="panel">
    <h2>🍺 Таверна</h2>
    <p class="muted">Хлеба и зрелищ! Азартные игры на золото. Дом всегда немного в выигрыше — играй с умом.</p>
    <div class="tavern-stats muted">Сыграно: <b>${t.plays}</b> · Выиграно: <b>${t.won}</b> 🪙 · Проиграно: <b>${t.lost}</b> 🪙</div>
    ${tavernResult ? `<div class="tavern-result">${esc(tavernResult)}</div>` : ''}

    <h3>🎲 Кости</h3>
    <p class="muted">Твои 2 кубика против заведения. Больше — выигрыш ×2, ничья — возврат ставки.</p>
    <div class="tavern-row">${diceBtns}</div>

    <h3>🥤 Напёрстки</h3>
    <p class="muted">Угадай, под каким стаканом шарик. Угадал — выигрыш ×3.</p>
    ${thimbleRows}

    <h3>🎟️ Лотерея</h3>
    <p class="muted">Билет за ${LOTTERY_PRICE} 🪙. Призы: золото, искры и — очень редко — Душа!</p>
    <button class="big" ${gold >= LOTTERY_PRICE ? '' : 'disabled'} onclick="playLottery()">${L('Купить билет')} (${LOTTERY_PRICE} 🪙)</button>
  </div>`;
}
function viewBank() {
  return `<div class="panel">
    <h2>🏛️ Банк</h2>
    <p class="muted">Души — премиум-валюта (реальные средства по GDD). Здесь их можно обменять.</p>
    <div class="kv big-kv"><span>👻 Души</span><b>${player.resources.souls || 0}</b></div>
    <button class="big" onclick="exchangeSouls('gold')">1 Душа → 1000 🪙 Золота</button>
    <button class="big" onclick="exchangeSouls('sparks')">1 Душа → 1000 🔥 Искр</button>
    <div id="soul-shop"></div>
    ${premiumAccountHtml()}
    <p class="hint">Души выдаются за ключевые квесты или покупаются за Telegram Stars (⭐).</p>
  </div>`;
}
// --- Премиум-аккаунт (Фаза 3) ---
function premiumAccountHtml() {
  const active = isPremium();
  const until = player.premiumUntil ? new Date(player.premiumUntil).toLocaleDateString() : '';
  const status = active
    ? `<div class="prem-status on">👑 ${t('Премиум активен до')} ${until}</div>`
    : `<div class="prem-status">${t('Премиум не активен')}</div>`;
  const perks = `<ul class="prem-perks">
    <li>${tp('Арена: {n} боёв с наградой в день', { n: 100 })}</li>
    <li>${tp('Сборки экипировки: до {n}', { n: LOADOUT_MAX + 3 })}</li>
    <li>${t('Значок 👑 в чате и рейтинге')}</li>
  </ul>`;
  const enough = (player.resources.souls || 0) >= PREMIUM_SOULS;
  return `<h3>👑 ${t('Премиум-аккаунт')}</h3>
    ${status}${perks}
    <div class="prem-buy">
      <button class="big" onclick="buyPremiumStars()">${tp('{d} дней за {s} ⭐', { d: PREMIUM_DAYS, s: PREMIUM_STARS })}</button>
      <button class="big ${enough ? '' : 'unaff'}" onclick="buyPremiumAccountSouls()">${tp('{d} дней за {s} 👻', { d: PREMIUM_DAYS, s: PREMIUM_SOULS })}</button>
    </div>`;
}
async function buyPremiumStars() {
  if (!_marketOnline()) { showToast(t('Покупки доступны только в Telegram.')); return; }
  const tg = window.Telegram && Telegram.WebApp;
  if (!tg || !tg.openInvoice) { showToast(t('Обновите Telegram для оплаты.')); return; }
  const resp = await _marketPost('/pay/create-invoice', { product: 'premium' });
  if (!resp.ok || !resp.data || !resp.data.url) { showToast(t('Не удалось создать счёт.')); return; }
  tg.openInvoice(resp.data.url, (status) => {
    if (status === 'paid') { claimSoulsRetry(); }
    else if (status === 'failed') { showToast(t('Платёж не прошёл.')); }
  });
}
// --- Монетизация (Фаза 1): покупка душ за Telegram Stars ---
let _soulPacks = null;
async function loadSoulShop() {
  if (!_marketOnline()) return; // покупки только в Telegram
  claimSouls(true); // доставить оплаченное ранее (вебхук мог прийти, пока был оффлайн)
  if (!_soulPacks) {
    try { const r = await fetch(`${CLOUD_URL}/pay/packs`); if (r.ok) _soulPacks = await r.json(); } catch (e) {}
  }
  renderSoulShop();
}
function renderSoulShop() {
  const el = document.getElementById('soul-shop');
  if (!el) return;
  if (!_soulPacks || !_soulPacks.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<h3>⭐ ${t('Купить души')}</h3>
    <p class="muted">${t('Оплата звёздами Telegram — души зачислятся автоматически.')}</p>
    <div class="soul-packs">${_soulPacks.map((p) => `<button class="big soul-pack" onclick="buySoulPack('${p.id}')"><b>${p.souls} 👻</b> <span class="muted">за ${p.stars} ⭐</span></button>`).join('')}</div>`;
  if (typeof localizeDOM === 'function') localizeDOM(el);
}
async function buySoulPack(id) {
  if (!_marketOnline()) { showToast(t('Покупки доступны только в Telegram.')); return; }
  const tg = window.Telegram && Telegram.WebApp;
  if (!tg || !tg.openInvoice) { showToast(t('Обновите Telegram для оплаты.')); return; }
  const resp = await _marketPost('/pay/create-invoice', { packId: id });
  if (!resp.ok || !resp.data || !resp.data.url) { showToast(t('Не удалось создать счёт.')); return; }
  tg.openInvoice(resp.data.url, (status) => {
    if (status === 'paid') { showToast(t('Оплата прошла! Души зачислятся в течение 1–2 минут.')); claimSoulsRetry(); }
    else if (status === 'failed') { showToast(t('Платёж не прошёл.')); }
  });
}
async function claimSouls(silent) {
  if (!_marketOnline()) return 0;
  const resp = await _marketPost('/pay/claim', {});
  const d = (resp && resp.data) || {};
  const n = d.souls || 0;
  const pd = d.premiumDays || 0;
  if (n > 0) { addRes('souls', n); if (!silent) showToast(tp('Начислено {n} 👻', { n })); }
  if (pd > 0) { extendPremium(pd); if (!silent) showToast(t('👑 Премиум-аккаунт активирован!')); }
  if (n > 0 || pd > 0) { saveGame(); render(); }
  return n + pd;
}
function claimSoulsRetry() {
  let tries = 0;
  const tick = async () => {
    const n = await claimSouls(false);
    if (n > 0 || ++tries >= 6) return;
    setTimeout(tick, 2500);
  };
  tick();
}
function _dailyBody() {
  ensureDaily();
  const today = todayKey();
  const d = player.daily;
  const loginDone = d.loginClaimedDay === today;
  const streak = loginDone ? d.streak : (d.loginClaimedDay && dayDiff(d.loginClaimedDay, today) === 1 ? d.streak + 1 : 1);
  const lr = dailyLoginReward(streak);
  const loginCard = `<div class="daily-login ${loginDone ? 'done' : ''}">
    <div class="dl-head">🎁 <b>Награда за вход</b> <span class="muted">${t('день')} ${streak} ${t('подряд')}${streak % 7 === 0 ? ' — бонусная Душа!' : ''}</span></div>
    <div class="dl-reward">${rewardLabel(lr)}</div>
    ${loginDone
      ? '<span class="muted">✅ Сегодня получено. Загляни завтра!</span>'
      : `<button class="big" onclick="claimDailyLogin()">Забрать награду</button>`}
  </div>`;

  const done = DAILY_QUESTS.filter((q) => d.questClaimed[q.id]).length;
  const quests = DAILY_QUESTS.map((q) => {
    const prog = dailyQuestProgress(q);
    const claimed = !!d.questClaimed[q.id];
    const ready = prog >= q.goal && !claimed;
    const pct = Math.min(100, (prog / q.goal) * 100);
    return `<div class="daily-q ${claimed ? 'done' : ''}">
      <div class="dq-head">${q.icon} <b>${esc(q.name)}</b> <span class="muted">${esc(q.desc)}</span></div>
      <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span>${prog} / ${q.goal}</span></div>
      <div class="dq-foot"><span class="dq-reward">${t('Награда:')} ${rewardLabel(q.reward)}</span>
        ${claimed ? '<span class="muted">✅ получено</span>'
          : ready ? `<button class="mini" onclick="claimDailyQuest('${q.id}')">забрать</button>`
          : '<span class="muted">в процессе</span>'}</div>
    </div>`;
  }).join('');

  const allCard = `<div class="daily-all ${d.allClaimed ? 'done' : ''}">
    🌟 <b>Все задания дня</b> <span class="muted">(${done}/${DAILY_QUESTS.length})</span> — ${t('бонус:')} ${rewardLabel(DAILY_ALL_REWARD)}
    ${d.allClaimed ? ' <span class="muted">✅ получен</span>' : ''}
  </div>`;

  return `<p class="muted">Заходи каждый день за наградой (стрик повышает её на 7-й день) и выполняй ежедневные задания. Сброс — каждый день.</p>
    ${loginCard}
    <h3>Ежедневные задания</h3>
    ${allCard}
    ${quests}`;
}

function viewCouncil() {
  const rows = QUESTS.map((q) => {
    const st = player.quests[q.id];
    const stages = Array.isArray(q.goal) ? q.goal.length : 1;
    const goal = questCurrentGoal(q);
    const val = questProgressValue(q);
    const pct = st.done ? 100 : Math.min(100, (val / goal) * 100);
    const reward = Object.entries(q.reward).map(([k, v]) => `${v} ${RESOURCES[k].icon}`).join(' ');
    return `<div class="quest ${st.done ? 'done' : ''}">
      <div class="q-head"><b>${q.name}</b> ${st.done ? '✅' : `<span class="muted">этап ${st.stage + (st.stage < stages ? 1 : 0)}/${stages}</span>`}</div>
      <div class="q-desc">${esc(q.desc)}</div>
      <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span>${val} / ${goal}</span></div>
      <div class="q-reward">${t('Награда за этап:')} ${reward}</div>
    </div>`;
  }).join('');
  const TABS = [['quests', '📜 ' + t('Квесты')], ['ach', `🏆 ${t('Достижения')} (${(player.achievements || []).length})`], ['fame', '👑 ' + t('Зал славы')]];
  const tabBtns = TABS.map(([id, label]) => `<button class="mk-tab ${councilTab === id ? 'on' : ''}" onclick="councilTab='${id}';render()">${label}</button>`).join('');

  let bodyHtml = '';
  if (councilTab === 'quests') {
    bodyHtml = `<p class="muted">Журнал заданий. Многие квесты имеют «градиент» — повторяются с растущей целью (10 / 100 / 1000).</p>${rows}`;
  } else if (councilTab === 'ach') {
    bodyHtml = `<h3>🏆 ${t('Достижения')} ${achievementsCountHtml()}</h3>${achievementsHtml()}`;
  } else { // fame
    bodyHtml = `<div class="lb-box">
      <h3>🏆 ${t('Зал славы')}</h3>
      <div class="ref-board" id="lbBoard"><span class="muted">⏳ Загрузка…</span></div>
    </div>
    ${_refSectionHtml()}`;
  }

  return `<div class="panel"><h2>📜 Совет старейшин</h2>
    <div class="mk-tabs mk-tabs-3">${tabBtns}</div>
    ${bodyHtml}
  </div>`;
}

function achievementsCountHtml() {
  const got = (player.achievements || []).length;
  return `<span class="muted">${got} / ${ACHIEVEMENTS.length}</span>`;
}
function achievementsHtml() {
  return `<div class="ach-grid">${ACHIEVEMENTS.map((a) => {
    const got = (player.achievements || []).includes(a.id);
    const reward = a.reward ? Object.entries(a.reward).map(([k, v]) => `${v} ${RESOURCES[k].icon}`).join(' ') : '';
    return `<div class="ach ${got ? 'got' : 'locked'}">
      <div class="ach-ic">${got ? a.icon : '🔒'}</div>
      <div class="ach-body">
        <div class="ach-name">${esc(t(a.name))} ${got ? '✅' : ''}</div>
        <div class="ach-desc">${esc(a.desc)}</div>
        ${reward ? `<div class="ach-reward">${t('Награда:')} ${reward}</div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// Персональный промокод игрока = его Telegram-id в base36 (декодируется обратно в id).
function myPromoCode() {
  const id = window.TG_USER && window.TG_USER.id;
  return id == null ? '' : Number(id).toString(36).toUpperCase();
}
function _refSectionHtml() {
  const userId = window.TG_USER && window.TG_USER.id;
  if (!userId) return '';
  const code = myPromoCode();
  const refCount = player.refCount || 0;
  const earned = refCount * 200;
  const already = !!(player.referredBy || player.refRegistered);
  const windowOpen = Date.now() - (player.createdAt || 0) <= 7 * 86400000;
  let enterBlock;
  if (already) enterBlock = '<p class="muted">✅ Промокод пригласившего уже применён.</p>';
  else if (!windowOpen) enterBlock = '<p class="muted">⌛ Окно ввода промокода (7 дней с создания героя) истекло.</p>';
  else enterBlock = `<div class="ref-link-row">
      <input class="ref-link-input" id="promoInput" type="text" maxlength="16" placeholder="промокод пригласившего" oninput="this.value=this.value.toUpperCase()">
      <button class="mini" onclick="applyPromoCode(document.getElementById('promoInput').value)">Применить</button>
    </div>
    <p class="muted">Введи код друга — получишь <b>+500 🪙 и +100 🔥</b>. Только один раз, в течение 7 дней с создания героя.</p>`;
  return `<div class="ref-box">
    <h3>🤝 Реферальная программа</h3>
    <p class="muted">Приглашай друзей промокодом — за каждого нового игрока <b>+200 🪙</b>.</p>
    <div class="promo-mine">Твой промокод: <b class="promo-code">${esc(code)}</b>
      <button class="mini" onclick="copyPromo()">📋</button>
      <button class="mini" onclick="sharePromo()">📤</button>
    </div>
    <div class="ref-stats">
      <span>Приглашено: <b>${refCount}</b></span>
      <span>Заработано: <b>${earned} 🪙</b></span>
    </div>
    <h4 class="mk-h4">Ввести промокод пригласившего</h4>
    ${enterBlock}
    <div class="ref-board" id="refBoard"><span class="muted">⏳ Загрузка таблицы…</span></div>
  </div>`;
}
function applyPromoCode(raw) {
  if (!window.TG_USER) { showToast('Доступно только в Telegram'); return; }
  if (player.referredBy || player.refRegistered) { pushLog('❌ Промокод уже вводился.'); render(); return; }
  if (Date.now() - (player.createdAt || 0) > 7 * 86400000) { pushLog('⌛ Окно ввода промокода (7 дней) истекло.'); render(); return; }
  const code = String(raw || '').trim().toUpperCase();
  if (!code) { showToast('Введите промокод'); return; }
  const id = parseInt(code, 36);
  if (!Number.isFinite(id) || id <= 0 || Number(id).toString(36).toUpperCase() !== code) { pushLog('❌ Неверный промокод.'); render(); return; }
  if (String(id) === String(window.TG_USER.id)) { pushLog('❌ Нельзя ввести свой промокод.'); render(); return; }
  player.referredBy = String(id);
  player.resources.gold = (player.resources.gold || 0) + 500;
  player.resources.sparks = (player.resources.sparks || 0) + 100;
  pushLog('🎁 Промокод принят! +500 🪙 и +100 🔥. Пригласившему начислится награда при синхронизации.');
  if (typeof showToast === 'function') showToast('🎁 Промокод принят: +500 🪙, +100 🔥');
  saveGame();
  if (typeof _pushToCloud === 'function') _pushToCloud();
  render();
}
function copyPromo() {
  const code = myPromoCode();
  try { navigator.clipboard.writeText(code).then(() => showToast('📋 Промокод скопирован: ' + code)); }
  catch (e) { showToast('Промокод: ' + code); }
}
function sharePromo() {
  const code = myPromoCode();
  const text = `Мой промокод в «Вавилоне»: ${code} — введи его в Совете старейшин и получи +500 🪙 и +100 🔥!`;
  const link = window.BOT_HANDLE ? `https://t.me/${window.BOT_HANDLE}` : '';
  if (navigator.share) { navigator.share({ title: 'Проект «Вавилон»', text, url: link }); }
  else if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`); }
  else copyPromo();
}

function copyRefLink() {
  const inp = document.getElementById('refLinkInput');
  if (!inp) return;
  inp.select();
  try {
    navigator.clipboard.writeText(inp.value).then(() => showToast('🔗 Ссылка скопирована!'));
  } catch (e) {
    try { document.execCommand('copy'); showToast('🔗 Ссылка скопирована!'); } catch (e2) {}
  }
}

function shareRef() {
  const inp = document.getElementById('refLinkInput');
  if (!inp) return;
  const link = inp.value;
  if (navigator.share) {
    navigator.share({ title: 'Проект «Вавилон»', text: 'Сыграй со мной в «Вавилон»!', url: link });
  } else if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Сыграй со мной в «Вавилон»!')}`);
  } else {
    copyRefLink();
  }
}

async function loadLeaderboard() {
  const board = document.getElementById('lbBoard');
  if (!board) return;
  try {
    const r = await fetch(`${CLOUD_URL}/leaderboard`);
    if (!r.ok) { board.innerHTML = '<span class="muted">Нет данных</span>'; localizeDOM(board); return; }
    const list = await r.json();
    if (!list.length) { board.innerHTML = '<span class="muted">Ещё никто не попал в зал славы</span>'; localizeDOM(board); return; }
    const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
    const myName = player.name || '';
    board.innerHTML = `<table class="ref-table lb-table">
      <thead><tr><th>#</th><th>Герой</th><th class="c-lvl">Ур.</th><th class="c-xp">Опыт</th><th class="c-kills">☠️</th></tr></thead>
      <tbody>${list.map((row, i) => `<tr${row.name === myName ? ' class="self"' : ''}>
        <td>${medal(i)}</td>
        <td>${esc(row.name)}${row.prem ? ' 👑' : ''}</td>
        <td class="c-lvl"><b>${row.xpLevel}</b></td>
        <td class="c-xp">${totalXp(row.xpLevel, row.xp).toLocaleString('ru-RU')}</td>
        <td class="c-kills">${row.kills || 0}</td>
      </tr>`).join('')}</tbody>
    </table>`;
    if (typeof localizeDOM === 'function') localizeDOM(board);
  } catch (e) {
    board.innerHTML = '<span class="muted">Ошибка загрузки</span>'; localizeDOM(board);
  }
}

async function loadRefLeaderboard() {
  const board = document.getElementById('refBoard');
  if (!board) return;
  try {
    const r = await fetch(`${CLOUD_URL}/referrals`);
    if (!r.ok) { board.innerHTML = '<span class="muted">Нет данных</span>'; localizeDOM(board); return; }
    const list = await r.json();
    if (!list.length) { board.innerHTML = '<span class="muted">Пока никто не приглашал игроков</span>'; localizeDOM(board); return; }
    const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
    board.innerHTML = `<table class="ref-table">
      <thead><tr><th>#</th><th>Игрок</th><th>Приглашено</th></tr></thead>
      <tbody>${list.map((row, i) => `<tr${String(row.userId) === String(window.TG_USER && window.TG_USER.id) ? ' class="self"' : ''}>
        <td>${medal(i)}</td>
        <td>${esc(row.name || row.userId)}</td>
        <td><b>${row.count}</b></td>
      </tr>`).join('')}</tbody>
    </table>`;
    if (typeof localizeDOM === 'function') localizeDOM(board);
  } catch (e) {
    board.innerHTML = '<span class="muted">Ошибка загрузки</span>'; localizeDOM(board);
  }
}

// ---------------- Бой ----------------
function openCombat() { $('combat').classList.add('open'); renderCombat(); }
function closeCombat() { $('combat').classList.remove('open'); }

function renderCombat() {
  if (!combat) return;
  const mobsHtml = combat.mobs.map((m, i) => `
    <div class="mob ${m.hp <= 0 ? 'dead' : ''} ${m.isBoss ? 'boss' : ''} ${combatSel.target === i ? 'sel' : ''}" onclick="combatSel.target=${i}; combat.target=${i}; renderCombat()">
      ${m.isBoss ? '<div class="boss-badge">👑 БОСС</div>' : ''}
      <div class="mob-art">${mobArt(m.name, { boss: m.isBoss })}</div>
      <div class="mname">${esc(_locBossName(m.name))}</div>
      ${bar(Math.max(0, m.hp), m.maxHp, 'hp')}
      <div class="mtags">${m.isCaster ? '🔮' : ''}${m.isRanged ? '🏹' : ''} атк ${m.attack} · защ ${m.defense}${m.effects.length ? ' · ' + m.effects.map((e) => e.type).join(',') : ''}</div>
    </div>`).join('');

  const zoneOpts = (sel) => ZONES.map((z) => `<option value="${z}" ${sel === z ? 'selected' : ''}>${z}</option>`).join('');
  const curSpell = combatSel.spell || (player.spells[0] || '');
  const _cs = SPELLS.find((x) => x.id === curSpell);
  const curSpellDesc = _cs ? `${t(_cs.element)}/${t(_cs.dir)} · ${t(_cs.desc)}` : '';
  const spellOpts = player.spells.map((id) => { const s = SPELLS.find((x) => x.id === id); return `<option value="${id}" ${id === curSpell ? 'selected' : ''}>${t(s.name)} (${s.cost} MP)</option>`; }).join('');
  const elixirs = player.inventory.filter((it) => it.use);
  const elixirBtns = elixirs.map((it) => `<button class="mini" onclick="playerUseItem(${it.id}); renderCombat()">${esc(t(it.name))}${it.qty ? ' ×' + it.qty : ''}</button>`).join('') || '<span class="muted">нет расходников</span>';

  const _ct = combat.mobs[combat.target];
  const canTame = _ct && _ct.hp > 0 && !_ct.isBoss && !combat.ctx.raid && _ct.hp <= _ct.maxHp * 0.35 && (player.pets || []).length < PETS_MAX;
  const tameBtn = canTame ? `<button class="mini" title="Приручить ослабленного зверя" onclick="tameMob(${combat.target}); renderCombat()">🐾 приручить</button>` : '';
  const activePets = (player.pets || []).filter((p) => p.active).slice(0, activePetCap());
  const isRaid = combat.ctx && combat.ctx.raid;
  const raidDmg = combat.raidServerDmg != null ? combat.raidServerDmg : (combat.raidDamage || 0);
  const controls = combat.over ? `
    <div class="combat-result ${isRaid ? (combat.raidKilled ? 'win' : '') : (combat.won ? 'win' : 'lose')}">
      <h3>${isRaid ? t('🐉 Рейд') : (combat.won ? t('🏆 Победа!') : t('☠️ Поражение'))}</h3>
      ${isRaid
        ? `<p>Нанесено боссу клана: <b>${raidDmg}</b> урона.${combat.raidKilled ? `<br><b>${t('🐉 Босс повержен!')}</b> ${t('Забери награду: Кланы → Рейд.')}` : `<br>${t('Босс ещё жив — продолжите всем кланом.')}`}</p>`
        : (combat.won ? lootHtml() : '<p>Вы вернётесь в башню ослабленным.</p>')}
      <button class="big" onclick="finishCombatView()">Вернуться в башню</button>
    </div>` : `
    <div class="combat-controls">
      <div class="cc-zones">
        <div class="cc-field"><label>Атака</label><select onchange="combatSel.atkZone=this.value">${zoneOpts(combatSel.atkZone)}</select></div>
        <div class="cc-field"><label>Блок</label><select onchange="combatSel.blockZone=this.value">${zoneOpts(combatSel.blockZone)}</select></div>
        <button class="big cc-atk" onclick="playerAttack(combatSel.atkZone, combatSel.blockZone); renderCombat()">🗡️ Удар</button>
      </div>
      <div class="cc-row">
        <select onchange="combatSel.spell=this.value; renderCombat()" id="spellSel">${spellOpts}</select>
        <button class="mini" ${combat.castUsed ? 'disabled title="Уже кастовали в этот ход"' : ''} onclick="playerCast(document.getElementById('spellSel').value || player.spells[0], combatSel.atkZone); renderCombat()">✨ Каст</button>
        ${tameBtn}
        <button class="mini danger" onclick="playerFlee(); renderCombat()">🏃</button>
      </div>
      ${curSpellDesc ? `<div class="cc-spell-desc">${esc(curSpellDesc)}</div>` : ''}
      <div class="cc-row">${elixirBtns}</div>
    </div>`;

  const logHtml = `<div class="combat-log" id="clog">${combat.logLines.slice(0, 20).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;

  const backdrop = combat.ctx.worldIndex != null
    ? worldBg(combat.ctx.worldIndex, combat.ctx.location) : towerArt();
  $('combat-body').innerHTML = `
    <div class="combat-backdrop">${backdrop}</div>
    <div class="combat-top">
      <div class="combat-hero">
        <b>${esc(player.name)}</b> · ${t('раунд')} ${combat.round}
        ${bar(player.hp, player.maxHp, 'hp')} ${bar(player.mp, player.maxMp, 'mp')}
        ${combat.pBuffs.length ? `<div class="mtags">${t('эффекты:')} ${combat.pBuffs.map((b) => b.type).join(', ')}</div>` : ''}
        ${activePets.length ? `<div class="mtags">🐾 ${activePets.map((p) => esc(p.name)).join(', ')}</div>` : ''}
        ${!combat.over ? `<div class="turn-timer${combat.turnTimeLeft <= 10 ? ' urgent' : ''}">⏱ ${combat.turnTimeLeft} ${t('сек')}</div>` : ''}
      </div>
      <div class="combat-mobs">${mobsHtml}</div>
    </div>
    ${logHtml}
    ${controls}`;
  if (typeof localizeDOM === 'function') localizeDOM($('combat-body'));
}

function lootHtml() {
  const l = combat.loot;
  const res = Object.entries(l.res).map(([k, v]) => `${v}× ${rName(k)}`).join(', ');
  return `<div class="loot">
    <div>⭐ ${t('Опыт:')} +${l.xp || 0} · 🪙 ${t('Золото:')} +${l.gold} · 🔥 ${t('Искры:')} +${l.sparks}</div>
    ${res ? `<div>${t('Трофеи:')} ${res}</div>` : ''}
    ${l.item ? `<div>🎁 ${t('Вещь:')} ${esc(l.item)}</div>` : ''}
    ${l.spell ? `<div>📜 ${t('Формула заклинания:')} ${esc(l.spell)}</div>` : ''}
    ${l.recipe ? `<div>📐 ${t('Схема снаряжения:')} ${esc(l.recipe)}</div>` : ''}
  </div>`;
}

// ---------------- Приветственное окно для новых игроков ----------------
function showWelcome() {
  if (document.getElementById('welcome-overlay')) return;
  const name = player.name ? `, ${esc(player.name)}` : '';
  const div = document.createElement('div');
  div.id = 'welcome-overlay';
  div.className = 'welcome-overlay';
  div.innerHTML = `
    <div class="welcome-modal">
      <div class="welcome-icon">🏯</div>
      <h2>${t('Добро пожаловать')}${name}!</h2>
      <p>${t('Ты — полубог, пробудившийся в недрах древней башни. Здесь сталкиваются порядок и хаос, боги и смертные.')}</p>
      <p>${t('Исследуй Вавилонскую башню, развивай героя, сражайся с монстрами и отправляйся в экспедиции за трофеями.')}</p>
      <button class="big welcome-cta" onclick="dismissWelcome()">${t('⚔️ Отправиться в путь!')}</button>
    </div>`;
  document.body.appendChild(div);
}

function dismissWelcome() {
  const el = document.getElementById('welcome-overlay');
  if (el) { el.classList.add('closing'); setTimeout(() => el.remove(), 300); }
  player.welcomeSeen = true;
  saveGame();
  if (typeof _cloudReady === 'function' && _cloudReady()) _pushToCloud();
}

// всплывающий тост (используется при левел-апе)
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// старт
window.addEventListener('DOMContentLoaded', () => {
  recalc(); checkQuests(); render();
  const afterLang = () => { if (!player.welcomeSeen) showWelcome(); };
  if (!LANG && typeof showLangPicker === 'function') showLangPicker(afterLang); // выбор языка при первом входе
  else afterLang();
});
