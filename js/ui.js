/*
 * Интерфейс «Вавилон»: рендер Вавилонской башни, панелей зданий и боя.
 */

let activeView = 'tower';
let expedSel = { world: 0, loc: 0, diff: 100 };
let combatSel = { target: 0, atkZone: 'торс', blockZone: 'голова', spell: '' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function setView(v) { activeView = v; render(); }

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
    return `<span title="${esc(it.name)}">${icon}${qty}</span>`;
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
      <div class="hero-name">${esc(player.name)} <span class="lvl">🎖 Уровень ${player.xpLevel} · ⚔️ опасность ${player.danger}</span></div>
      ${bar(player.hp, player.maxHp, 'hp')} ${bar(player.mp, player.maxMp, 'mp')}
      <div class="xpwrap"><span class="xplabel">Опыт</span>${bar(player.xp, xpNeed(player.xpLevel), 'xp')}</div>
    </div>
    ${resStrip()}`;

  const views = {
    tower: viewTower, stats: viewStats, stairs: viewStairs, arena: viewArena,
    workshops: viewWorkshops, lab: viewLab, shop: viewShop, academy: viewAcademy,
    tavern: viewTavern, bank: viewBank, council: viewCouncil,
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

  const homeTab = `<button class="tab home ${activeView === 'tower' ? 'on' : ''}" onclick="setView('tower')"><span class="tabicon">${buildingArt('babylon_tower', '🏯')}</span><small>Башня</small></button>`;
  const buildingTabs = TOWER_BUILDINGS.map((b) =>
    `<button class="tab ${activeView === b.id ? 'on' : ''}" onclick="setView('${b.id}')"><span class="tabicon">${buildingArt(b.name, b.icon)}</span><small>${b.name}</small></button>`
  ).join('');
  $('tabs').innerHTML = homeTab + buildingTabs;

  $('logbox').innerHTML = player.log.slice(0, 12).map((l) => `<div>${esc(l.msg)}</div>`).join('');
  saveGame();
}

// баннер-шапка страницы здания: арт здания (cover) + название
function buildingBanner(b) {
  const base = `img/tower/${artSlug(b.name)}`;
  const art = artFrame(base, `<span class="bemoji" style="font-size:3rem">${b.icon}</span>`, 'af-bg', ['jpg', 'png']);
  return `<div class="banner page-banner">${art}<span class="banner-cap">${b.icon} ${b.name}</span></div>`;
}

// ---------------- Вавилонская башня (хаб) ----------------
function viewTower() {
  return `<div class="tower">
    <div class="banner">${towerArt()}</div>
    <h2>🏯 Вавилонская башня</h2>
    <p class="muted">Цитадель порядка в хаосе. Полубоги обитают здесь, между нижним миром смертных и нестабильным верхним миром. Выберите помещение.</p>
    <div class="grid build-grid">
      ${TOWER_BUILDINGS.map((b) => `
        <button class="build" onclick="setView('${b.id}')">
          <div class="bicon">${buildingArt(b.name, b.icon)}</div>
          <div class="bname">${b.name}</div>
          <div class="bdesc">${esc(b.desc)}</div>
        </button>`).join('')}
    </div>
  </div>`;
}

// ---------------- Покои героя: статы / навыки / магия / инвентарь ----------------
function viewStats() {
  const d = player.derived;
  const statRows = STAT_ORDER.map((k) => {
    const s = player.stats[k];
    const pct = (s.prog / s.cap) * 100;
    return `<div class="stat-row">
      <div class="sname">${STATS[k].name} <b>${s.val}</b></div>
      <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span>${Math.round(s.prog)}/${s.cap}</span></div>
      <div class="sdesc">${STATS[k].desc} <i>(растёт от: ${STATS[k].grows})</i></div>
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
    <div class="kv"><span>Реген HP/мин</span><b>${d.hpRegen}</b></div>
    <div class="kv"><span>Реген MP/мин</span><b>${d.mpRegen}</b></div>`;

  const SLOT_ICONS = {weapon:'⚔️',head:'🪖',body:'🛡',shield:'🔰',ring:'💍',amulet:'📿',earring:'✨'};
  const slots = [['weapon','Оружие'],['head','Шлем'],['body','Доспех'],['shield','Щит'],['ring','Кольцо'],['amulet','Амулет'],['earring','Серьги']];
  const equipHtml = `<div class="equip-grid">${slots.map(([s, label]) => {
    const it = player.equip[s];
    let stat = '';
    if (it) {
      if (it.dmg) stat = `${it.dmg[0]}–${it.dmg[1]} урон`;
      else if (it.armor) stat = `${it.armor} броня`;
      else if (it.bonus) stat = Object.entries(it.bonus).map(([k,v])=>`+${v} ${STATS[k]?.name||k}`).join(', ');
    }
    return `<div class="equip-card ${it ? 'equipped' : 'empty'}">
      <div class="equip-img">${it ? itemArt(it) : `<span class="equip-empty-icon">${SLOT_ICONS[s]}</span>`}</div>
      <div class="equip-label">${label}</div>
      ${it ? `<div class="equip-name">${esc(it.name)}</div>
        ${stat ? `<div class="equip-stat">${stat}</div>` : ''}
        <button class="mini" onclick="unequip('${s}')">снять</button>`
        : `<div class="equip-name muted">пусто</div>`}
    </div>`;
  }).join('')}</div>`;

  const inv = player.inventory.length ? player.inventory.map(itemCard).join('') : '<p class="muted">Рюкзак пуст.</p>';

  return `<div class="panel">
    <h2>🧝 Покои героя</h2>
    <div class="cols">
      <div class="col">
        <h3>Статы</h3>${statRows}
      </div>
      <div class="col">
        <h3>Боевые параметры</h3><div class="kvgrid">${derivedRows}</div>
        <h3>Магия</h3>${viewMagicMini()}
        <h3>Профессии</h3>${viewProfessions()}
        <h3>Экипировка</h3>${equipHtml}
      </div>
    </div>
    <h3>Рюкзак (${player.inventory.length})</h3>
    <div class="inv-grid">${inv}</div>
  </div>`;
}

function viewMagicMini() {
  const els = ELEMENTS.map((e) => `${e} <b>${player.elements[e]}</b>`).join(' · ');
  const dirs = DIRS.map((d) => `${d} <b>${player.dirs[d]}</b>`).join(' · ');
  const spells = player.spells.map((id) => {
    const s = SPELLS.find((x) => x.id === id);
    return `<li><b>${s.name}</b> <span class="tag">${s.element}/${s.dir}</span> — ${esc(s.desc)} <i>(${s.cost} MP)</i></li>`;
  }).join('');
  return `<div class="magic-mini"><div class="muted">Стихии: ${els}</div><div class="muted">Направления: ${dirs}</div>
    <ul class="spell-list">${spells}</ul></div>`;
}

function viewProfessions() {
  const rows = PROF_ORDER.map((k) => {
    const p = player.professions[k];
    const info = PROFESSIONS[k];
    const need = profNeed(p.lvl);
    const pct = (p.xp / need) * 100;
    return `<div class="prof-row">
      <div class="pname">${info.icon} ${info.name} <b>ур. ${p.lvl}</b> <span class="tag">${profTitle(p.lvl)}</span></div>
      <div class="bar tiny"><div class="fill" style="width:${pct}%"></div><span>${Math.round(p.xp)}/${need}</span></div>
      <div class="sdesc"><i>${info.grows}</i></div>
    </div>`;
  }).join('');
  return `<div class="prof-list">${rows}
    <div class="muted hint">Мастерство повышает качество изделий и открывает «тайные знания» — новые рецепты в мастерских.</div></div>`;
}

function itemCard(it) {
  let stats = [];
  if (it.dmg) stats.push(`урон ${it.dmg[0]}–${it.dmg[1]}`);
  if (it.armor) stats.push(`броня ${it.armor}`);
  if (it.bonus) stats.push(Object.entries(it.bonus).map(([k, v]) => `+${v} ${STATS[k].name}`).join(', '));
  if (it.use) stats.push(it.use.heal ? `+${it.use.heal} HP` : it.use.mana ? `+${it.use.mana} MP` : it.use.throwDmg ? `${it.use.throwDmg} урона` : it.use.buff ? 'усиление' : '');
  if (it.req) stats.push('треб: ' + Object.entries(it.req).map(([k, v]) => `${STATS[k].name} ${v}`).join(', '));
  const action = it.slot ? `<button class="mini" onclick="equipItem(${it.id})">надеть</button>`
    : (it.use && !it.use.throwDmg && !it.use.heal && !it.use.mana ? '' : `<span class="muted">в бою</span>`);
  return `<div class="item-card ${it.type}">
    <div class="ic-art">${itemArt(it)}</div>
    <div class="ic-head"><b>${esc(it.name)}</b>${it.qty ? ` ×${it.qty}` : ''}</div>
    <div class="ic-type">${it.type}</div>
    <div class="ic-stats">${stats.filter(Boolean).join(' · ')}</div>
    <div class="ic-act">${action} <button class="mini danger" onclick="dropItem(${it.id})">×</button></div>
  </div>`;
}

// ---------------- Лестница в Небо: выбор похода ----------------
function viewStairs() {
  const worldOpts = WORLDS.map((w, i) => `<option value="${i}" ${expedSel.world === i ? 'selected' : ''}>${i + 1}. ${w.name} (сложность ×${w.tier})</option>`).join('');
  const w = WORLDS[expedSel.world];
  const locOpts = w.locations.map((l, i) => `<option value="${i}" ${expedSel.loc === i ? 'selected' : ''}>${l[0]} — ${l[1].join(', ')}</option>`).join('');
  const diffs = [75, 100, 125, 150, 175, 200].map((d) => `<option value="${d}" ${expedSel.diff === d ? 'selected' : ''}>${d}%</option>`).join('');
  const loc = w.locations[expedSel.loc];
  return `<div class="panel">
    <h2>🪜 Лестница в Небо</h2>
    <div class="banner">${worldBg(expedSel.world, loc[0])}<span class="banner-cap">${esc(w.name)} · ${esc(loc[0])}</span></div>
    <p class="muted">${esc(w.intro)}</p>
    <div class="form-row"><label>Мир</label>
      <select onchange="expedSel.world=+this.value; expedSel.loc=0; render()">${worldOpts}</select></div>
    <div class="form-row"><label>Локация</label>
      <select onchange="expedSel.loc=+this.value; render()">${locOpts}</select></div>
    <div class="form-row"><label>Сложность локации</label>
      <select onchange="expedSel.diff=+this.value">${diffs}</select></div>
    <button class="big" onclick="startExpedition(expedSel.world, expedSel.loc, expedSel.diff)">⚔️ В поход</button>
    <p class="hint">Сложность 75% — мобы слабее на 25%; 200% — вдвое сильнее. Победа даёт золото, искры, трофеи и иногда формулы заклинаний.</p>
  </div>`;
}

function _oppCardHtml(opp) {
  return `<div class="pvp-card">
    <div class="pvp-card-info">
      <b>${esc(opp.name)}</b>${opp.isBot ? ' <span class="bot-tag">🤖</span>' : ''}
      <span class="muted">Уровень ${opp.xpLevel} · Опасность ${opp.danger}</span>
      <span class="muted">HP ${opp.maxHp} · Урон ${opp.dmgMin}–${opp.dmgMax} · Броня ${opp.armor}</span>
    </div>
    <button class="mini" onclick="challengeOpponent(${JSON.stringify(JSON.stringify(opp))})">⚔️ Атаковать</button>
  </div>`;
}

function viewArena() {
  const pvp = player.pvp || { wins: 0, losses: 0 };
  // Рендерим ботов синхронно сразу — никаких спиннеров, арена всегда заполнена
  const initList = _mixOpponents([]);
  const initHtml = initList.length
    ? initList.map(_oppCardHtml).join('')
    : '<span class="muted">Соперники не найдены</span>';
  return `<div class="panel">
    <h2>⚔️ Арена</h2>
    <div class="pvp-stats">
      <span>🏆 Побед: <b>${pvp.wins}</b></span>
      <span>💀 Поражений: <b>${pvp.losses}</b></span>
    </div>
    <h3>⚔️ Соперники</h3>
    <p class="muted">Бойцы рядом с тобой по силе. Бой авто-расчётный — победа даёт золото и опыт.</p>
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
    log.push(`Раунд ${r}: ты ${myDmg} урона → HP врага ${Math.max(0, Math.round(oppHp))}`);
    if (oppHp <= 0) break;
    const oppDmg = Math.max(1, Math.round(
      ((opp.dmgMin || 3) + Math.random() * ((opp.dmgMax || 8) - (opp.dmgMin || 3)))
      * 100 / (100 + (d.armor || 0))
    ));
    myHp -= oppDmg;
    log.push(`${esc(opp.name)} ${oppDmg} урона → твой HP ${Math.max(0, Math.round(myHp))}`);
  }
  return { won: myHp > 0 || oppHp <= 0, log: log.slice(-6) };
}

function challengeOpponent(dataJson) {
  const opp = JSON.parse(dataJson);
  const { won, log } = _simulatePvp(opp);

  const goldReward = won ? Math.round(30 * (opp.danger || 1)) : -Math.round(10 * player.danger);
  const xpReward  = won ? Math.round(50 * (opp.danger || 1)) : Math.round(10 * (opp.danger || 1));

  if (won) { player.pvp.wins = (player.pvp.wins || 0) + 1; }
  else     { player.pvp.losses = (player.pvp.losses || 0) + 1; }
  addRes('gold', goldReward);
  gainXp(xpReward);
  pushLog(`${won ? '🏆' : '💀'} PvP vs ${opp.name}: ${won ? 'победа' : 'поражение'}! Золото ${goldReward > 0 ? '+' : ''}${goldReward}, XP +${xpReward}`);
  saveGame();

  // Уведомляем реального соперника на сервере (для ботов пропускаем)
  if (!opp.isBot && typeof _cloudReady === 'function' && _cloudReady()) {
    fetch(`${CLOUD_URL}/arena/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_USER.initData, targetId: opp.userId, targetName: opp.name, won }),
    }).catch(() => {});
  }

  // render() сначала — обновляет HUD, лог, статы. Потом поверх ставим результат боя.
  render();
  const el = document.getElementById('pvp-opponents');
  if (!el) return;
  el.innerHTML = `<div class="pvp-result ${won ? 'win' : 'lose'}">
    <div class="pvp-result-title">${won ? '🏆 Победа!' : '💀 Поражение'}</div>
    <div class="pvp-result-vs">vs <b>${esc(opp.name)}</b></div>
    <div class="pvp-log">${log.map(l => `<div>${esc(l)}</div>`).join('')}</div>
    <div class="pvp-rewards">Золото: ${goldReward > 0 ? '+' : ''}${goldReward} · XP: +${xpReward}</div>
    <button class="mini" onclick="render()">Найти ещё соперника</button>
  </div>`;
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
    const list = _mixOpponents(real);
    if (list.length) el.innerHTML = list.map(_oppCardHtml).join('');
  } catch (e) { /* ботов уже показали — ничего не делаем */ }
}

// ---------------- Мастерские и Лаборатория ----------------
function recipeCard(r) {
  const ins = Object.entries(r.in || {}).map(([k, v]) => `${v}× ${RESOURCES[k].name}`).join(', ');
  const extra = [r.sparks ? `${r.sparks} 🔥` : '', r.fuel ? `${r.fuel} топлива (уголь/брёвна)` : ''].filter(Boolean).join(', ');
  const known = player.knownRecipes.includes(r.id);
  const out = r.out.res ? `${r.out.qty || 1}× ${RESOURCES[r.out.res].name}` : r.out.item.name;
  const ok = canCraft(r) && known;
  // подсказка, как открыть неизученный рецепт (профессия+уровень или босс)
  let lockHint = 'рецепт не изучен';
  if (!known) {
    const entry = (PROF_RECIPES[r.ws] || []).find(([id]) => id === r.id);
    if (entry) lockHint = `откроется: ${PROFESSIONS[r.ws].icon} ${PROFESSIONS[r.ws].name} ур. ${entry[1]}`;
    else if ((r.sparks || 0) >= 300) lockHint = '🐲 схема — трофей с боссов (миры 7+)';
  }
  return `<div class="recipe ${ok ? '' : 'locked'}">
    <div class="rc-out"><b>${esc(out)}</b> <span class="ws">[${WORKSHOPS[r.ws]}]</span></div>
    <div class="rc-in">${ins}${extra ? ' · ' + extra : ''}</div>
    ${known ? `<button class="mini" ${ok ? '' : 'disabled'} onclick="craft('${r.id}')">создать</button>`
            : `<span class="muted">${lockHint}</span>`}
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
    ${resInventory()}
    ${cats.map(([t, rs]) => `<h3>${t}</h3><div class="recipe-grid">${rs.map(recipeCard).join('')}</div>`).join('')}
  </div>`;
}
function viewLab() {
  const rs = RECIPES.filter((r) => r.out.item && ['эликсир','зелье','мазь'].includes(r.out.item.type));
  return `<div class="panel">
    <h2>⚗️ Лаборатории</h2>
    <p class="muted">Алхимия: эликсиры (лечат в бою), зелья (бросаются во врага), мази (усиления вне боя).</p>
    ${resInventory()}
    <div class="recipe-grid">${rs.map(recipeCard).join('')}</div>
  </div>`;
}

function resInventory() {
  const items = Object.keys(RESOURCES).filter((k) => !RESOURCES[k].special && (player.resources[k] || 0) > 0)
    .map((k) => `<span class="res-chip">${RESOURCES[k].icon} ${RESOURCES[k].name}: <b>${player.resources[k]}</b></span>`).join('');
  return `<div class="res-inv">${items || '<span class="muted">Нет ресурсов — добудьте в Магазине или в Лестнице вниз.</span>'}</div>`;
}

// ---------------- Магазин ----------------
function viewShop() {
  const buy = SHOP_GOODS.map((g) => `<div class="shop-row">
    <span>${RESOURCES[g.res].icon} ${RESOURCES[g.res].name}</span>
    <span class="muted">${g.price} 🪙</span>
    <button class="mini" onclick="buyRes('${g.res}',1)">+1</button>
    <button class="mini" onclick="buyRes('${g.res}',10)">+10</button>
    <button class="mini" onclick="sellRes('${g.res}',1)">продать</button>
  </div>`).join('');
  return `<div class="panel">
    <h2>🏪 Магазин</h2>
    <p class="muted">Купить ресурсы и расходники, продать трофеи. Цены продажи — половина закупки.</p>
    <h3>Добыть руками (бесплатно)</h3>
    <div class="gather-grid">${GATHER_TABLE.map((g) => `<button class="mini" onclick="gather('${g.res}')">${RESOURCES[g.res].icon} ${g.name}</button>`).join('')}</div>
    <h3>Торговля</h3>${buy}
    ${resInventory()}
  </div>`;
}

// ---------------- Академия / Банк / Совет ----------------
function viewAcademy() {
  const visited = player.visitedLocations.length;
  const worlds = WORLDS.map((w, i) => {
    const seen = player.visitedLocations.some((v) => v.startsWith(w.name + ' /'));
    return `<div class="academy-row ${seen ? 'seen' : ''}">
      <b>${i + 1}. ${w.name}</b> <span class="muted">сложность ×${w.tier}</span>
      <div>${seen ? w.locations.map((l) => `${l[0]} — ${l[1].join(', ')}`).join('; ') : '<i>Terra Incognita — мир ещё не исследован</i>'}</div>
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
function viewTavern() {
  const gold = player.resources.gold || 0;
  const t = (player.counters && player.counters.tavern) || { plays: 0, won: 0, lost: 0 };
  const bets = [10, 50, 100];
  const diceBtns = bets.map((b) => `<button class="mini" ${gold >= b ? '' : 'disabled'} onclick="playDice(${b})">ставка ${b} 🪙</button>`).join('');
  const thimbleRows = [10, 50].map((b) => `<div class="thimble-row">
    <span class="muted">ставка ${b} 🪙:</span>
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
    <button class="big" ${gold >= LOTTERY_PRICE ? '' : 'disabled'} onclick="playLottery()">Купить билет (${LOTTERY_PRICE} 🪙)</button>
  </div>`;
}
function viewBank() {
  return `<div class="panel">
    <h2>🏛️ Банк</h2>
    <p class="muted">Души — премиум-валюта (реальные средства по GDD). Здесь их можно обменять.</p>
    <div class="kv big-kv"><span>👻 Души</span><b>${player.resources.souls || 0}</b></div>
    <button class="big" onclick="exchangeSouls('gold')">1 Душа → 1000 🪙 Золота</button>
    <button class="big" onclick="exchangeSouls('sparks')">1 Душа → 1000 🔥 Искр</button>
    <p class="hint">Души выдаются за ключевые квесты. В полной версии — пополняются за реальные деньги с возможностью вывода (см. бизнес-план GDD).</p>
  </div>`;
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
      <div class="q-reward">Награда за этап: ${reward}</div>
    </div>`;
  }).join('');
  return `<div class="panel"><h2>📜 Совет старейшин</h2>
    <div class="lb-box">
      <h3>🏆 Зал славы</h3>
      <div class="ref-board" id="lbBoard"><span class="muted">⏳ Загрузка…</span></div>
    </div>
    ${_refSectionHtml()}
    <p class="muted">Журнал заданий. Многие квесты имеют «градиент» — повторяются с растущей целью (10 / 100 / 1000).</p>
    ${rows}
    <button class="mini danger" onclick="if(confirm('Сбросить весь прогресс?')){resetGame();render();}">Начать заново</button>
  </div>`;
}

function _refSectionHtml() {
  const userId = window.TG_USER && window.TG_USER.id;
  const botHandle = window.BOT_HANDLE;
  if (!userId || !botHandle || botHandle === 'YOUR_BOT_USERNAME') return '';
  const refLink = `https://t.me/${botHandle}?start=ref_${userId}`;
  const refCount = player.refCount || 0;
  const earned = refCount * 200;
  return `<div class="ref-box">
    <h3>🤝 Реферальная программа</h3>
    <p class="muted">Приглашайте друзей — за каждого нового игрока получайте <b>+200 🪙</b>. Новый игрок получает бонус <b>+500 🪙 и +100 🔥</b>.</p>
    <div class="ref-stats">
      <span>Приглашено: <b>${refCount}</b></span>
      <span>Заработано: <b>${earned} 🪙</b></span>
    </div>
    <div class="ref-link-row">
      <input class="ref-link-input" id="refLinkInput" readonly value="${esc(refLink)}">
      <button class="mini" onclick="copyRefLink()">📋 Копировать</button>
      <button class="mini" onclick="shareRef()">📤 Поделиться</button>
    </div>
    <div class="ref-board" id="refBoard"><span class="muted">⏳ Загрузка таблицы…</span></div>
  </div>`;
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
    if (!r.ok) { board.innerHTML = '<span class="muted">Нет данных</span>'; return; }
    const list = await r.json();
    if (!list.length) { board.innerHTML = '<span class="muted">Ещё никто не попал в зал славы</span>'; return; }
    const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
    const myName = player.name || '';
    board.innerHTML = `<table class="ref-table">
      <thead><tr><th>#</th><th>Герой</th><th>Уровень</th><th>Опыт</th><th>Убийств</th></tr></thead>
      <tbody>${list.map((row, i) => `<tr${row.name === myName ? ' class="self"' : ''}>
        <td>${medal(i)}</td>
        <td>${esc(row.name)}</td>
        <td><b>${row.xpLevel}</b></td>
        <td>${(row.xp || 0).toLocaleString()}</td>
        <td>${row.kills || 0}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch (e) {
    board.innerHTML = '<span class="muted">Ошибка загрузки</span>';
  }
}

async function loadRefLeaderboard() {
  const board = document.getElementById('refBoard');
  if (!board) return;
  try {
    const r = await fetch(`${CLOUD_URL}/referrals`);
    if (!r.ok) { board.innerHTML = '<span class="muted">Нет данных</span>'; return; }
    const list = await r.json();
    if (!list.length) { board.innerHTML = '<span class="muted">Пока никто не приглашал игроков</span>'; return; }
    const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
    board.innerHTML = `<table class="ref-table">
      <thead><tr><th>#</th><th>Игрок</th><th>Приглашено</th></tr></thead>
      <tbody>${list.map((row, i) => `<tr${String(row.userId) === String(window.TG_USER && window.TG_USER.id) ? ' class="self"' : ''}>
        <td>${medal(i)}</td>
        <td>${esc(row.name || row.userId)}</td>
        <td><b>${row.count}</b></td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch (e) {
    board.innerHTML = '<span class="muted">Ошибка загрузки</span>';
  }
}

// ---------------- Бой ----------------
function openCombat() { $('combat').classList.add('open'); renderCombat(); }
function closeCombat() { $('combat').classList.remove('open'); }

function renderCombat() {
  if (!combat) return;
  const mobsHtml = combat.mobs.map((m, i) => `
    <div class="mob ${m.hp <= 0 ? 'dead' : ''} ${combatSel.target === i ? 'sel' : ''}" onclick="combatSel.target=${i}; combat.target=${i}; renderCombat()">
      <div class="mob-art">${mobArt(m.name, { boss: m.isBoss })}</div>
      <div class="mname">${esc(m.name)}</div>
      ${bar(Math.max(0, m.hp), m.maxHp, 'hp')}
      <div class="mtags">${m.isCaster ? '🔮' : ''}${m.isRanged ? '🏹' : ''} атк ${m.attack} · защ ${m.defense}${m.effects.length ? ' · ' + m.effects.map((e) => e.type).join(',') : ''}</div>
    </div>`).join('');

  const zoneOpts = (sel) => ZONES.map((z) => `<option value="${z}" ${sel === z ? 'selected' : ''}>${z}</option>`).join('');
  const spellOpts = player.spells.map((id) => { const s = SPELLS.find((x) => x.id === id); return `<option value="${id}">${s.name} (${s.cost} MP)</option>`; }).join('');
  const elixirs = player.inventory.filter((it) => it.use);
  const elixirBtns = elixirs.map((it) => `<button class="mini" onclick="playerUseItem(${it.id}); renderCombat()">${esc(it.name)}${it.qty ? ' ×' + it.qty : ''}</button>`).join('') || '<span class="muted">нет расходников</span>';

  const controls = combat.over ? `
    <div class="combat-result ${combat.won ? 'win' : 'lose'}">
      <h3>${combat.won ? '🏆 Победа!' : '☠️ Поражение'}</h3>
      ${combat.won ? lootHtml() : '<p>Вы вернётесь в башню ослабленным.</p>'}
      <button class="big" onclick="finishCombatView()">Вернуться в башню</button>
    </div>` : `
    <div class="combat-controls">
      <div class="cc-zones">
        <div class="cc-field"><label>Атака</label><select onchange="combatSel.atkZone=this.value">${zoneOpts(combatSel.atkZone)}</select></div>
        <div class="cc-field"><label>Блок</label><select onchange="combatSel.blockZone=this.value">${zoneOpts(combatSel.blockZone)}</select></div>
        <button class="big cc-atk" onclick="playerAttack(combatSel.atkZone, combatSel.blockZone); renderCombat()">🗡️ Удар</button>
      </div>
      <div class="cc-row">
        <select onchange="combatSel.spell=this.value" id="spellSel">${spellOpts}</select>
        <button class="mini" ${combat.castUsed ? 'disabled title="Уже кастовали в этот ход"' : ''} onclick="playerCast(document.getElementById('spellSel').value || player.spells[0], combatSel.atkZone); renderCombat()">✨ Каст</button>
        <button class="mini danger" onclick="playerFlee(); renderCombat()">🏃</button>
      </div>
      <div class="cc-row">${elixirBtns}</div>
    </div>`;

  const logHtml = `<div class="combat-log" id="clog">${combat.logLines.slice(0, 20).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;

  const backdrop = combat.ctx.worldIndex != null
    ? worldBg(combat.ctx.worldIndex, combat.ctx.location) : towerArt();
  $('combat-body').innerHTML = `
    <div class="combat-backdrop">${backdrop}</div>
    <div class="combat-top">
      <div class="combat-hero">
        <b>${esc(player.name)}</b> · раунд ${combat.round}
        ${bar(player.hp, player.maxHp, 'hp')} ${bar(player.mp, player.maxMp, 'mp')}
        ${combat.pBuffs.length ? `<div class="mtags">эффекты: ${combat.pBuffs.map((b) => b.type).join(', ')}</div>` : ''}
        ${!combat.over ? `<div class="turn-timer${combat.turnTimeLeft <= 10 ? ' urgent' : ''}">⏱ ${combat.turnTimeLeft} сек</div>` : ''}
      </div>
      <div class="combat-mobs">${mobsHtml}</div>
    </div>
    ${logHtml}
    ${controls}`;
}

function lootHtml() {
  const l = combat.loot;
  const res = Object.entries(l.res).map(([k, v]) => `${v}× ${RESOURCES[k].name}`).join(', ');
  return `<div class="loot">
    <div>⭐ Опыт: +${l.xp || 0} · 🪙 Золото: +${l.gold} · 🔥 Искры: +${l.sparks}</div>
    ${res ? `<div>Трофеи: ${res}</div>` : ''}
    ${l.spell ? `<div>📜 Формула заклинания: ${esc(l.spell)}</div>` : ''}
    ${l.recipe ? `<div>📐 Схема легендарного предмета: ${esc(l.recipe)}</div>` : ''}
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
      <h2>Добро пожаловать${name}!</h2>
      <p>Ты — полубог, пробудившийся в недрах древней башни. Здесь сталкиваются порядок и хаос, боги и смертные.</p>
      <p>Исследуй Вавилонскую башню, развивай героя, сражайся с монстрами и отправляйся в экспедиции за трофеями.</p>
      <button class="big welcome-cta" onclick="dismissWelcome()">⚔️ Отправиться в путь!</button>
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
  if (!player.welcomeSeen) showWelcome();
});
