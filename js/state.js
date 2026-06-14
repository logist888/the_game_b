/*
 * Состояние игрока «Вавилон»: статы, рост от использования, производные
 * параметры (HP/MP/атака/защита/урон), инвентарь, сохранение в localStorage.
 */

const SAVE_KEY = window.TG_USER ? `babylon_save_v1_${window.TG_USER.id}` : 'babylon_save_v1';

// URL Cloudflare Worker — заменить после деплоя (см. babylon/worker/save-worker.js)
const CLOUD_URL = 'https://babylon-save.logist888.workers.dev';
let _cloudTimer = null;
let _itemId = Date.now();

function newPlayer(name) {
  const stats = {};
  // База: всё по 5 единиц; прогресс роста по геометрической прогрессии.
  STAT_ORDER.forEach((k) => { stats[k] = { val: 5, prog: 0, cap: 40 }; });
  return {
    name: name || (window.TG_USER && window.TG_USER.name) || 'Полубог',
    level: 1,
    danger: 1,            // «опасность» героя — влияет на силу мобов
    xp: 0,
    xpLevel: 1,           // классический уровень (растёт от опыта)
    hp: 0, mp: 0,         // заполнятся в recalc()
    stats,
    // магия: уровни стихий и направлений + изученные заклинания
    elements: { ветер:0, вода:0, огонь:0, земля:0 },
    dirs: { свет:0, тьма:0, сумрак:0 },
    spells: ['small_heal','light_ray','air_shield'],
    // экипировка по слотам
    equip: { weapon:null, head:null, body:null, shield:null, ring:null, amulet:null, earring:null },
    inventory: [],        // предметы (оружие/броня/бижутерия/зелья)
    resources: { gold:200, souls:3, sparks:300 }, // старт по GDD: душа за квест + искры на крафт
    knownRecipes: RECIPES.filter(r => r.out.res).map(r => r.id)
      .concat(['dagger','cap','hp_elixir','mp_elixir']), // часть рецептов известна сразу
    // прогресс квестов
    quests: {},
    visitedLocations: [],
    counters: { kills:0, gathered:0, crafted:0, expeditions:0 },
    lastTick: Date.now(),
    log: [],
  };
}

// Стартовый набор: ресурсы 1 уровня, простое оружие и эликсиры
function grantStarterResources(p) {
  ['fiber','log','stone','ore','herb','mica','thinHide'].forEach((r) => {
    p.resources[r] = (p.resources[r] || 0) + 10;
  });
  // ржавый кинжал на старте, чтобы не драться кулаками
  const dagger = { name:'Ржавый кинжал', slot:'weapon', type:'оружие', hands:1, dist:'ближняя',
    dmg:[3,7], req:{}, weight:2, durability:[800,1000], id: ++_itemId };
  p.equip.weapon = dagger;
  // пара эликсиров жизни
  for (let i = 0; i < 3; i++) addItemTo(p, { name:'Эликсир жизни', type:'эликсир', slot:null, use:{ heal:40 }, stack:true });
}

function addItemTo(p, item) {
  const it = JSON.parse(JSON.stringify(item));
  if (it.stack) {
    const ex = p.inventory.find((x) => x.name === it.name && x.stack);
    if (ex) { ex.qty = (ex.qty || 1) + 1; return; }
    it.qty = 1;
  }
  it.id = ++_itemId;
  p.inventory.push(it);
}

let player = loadGame() || (() => { const p = newPlayer(); grantStarterResources(p); return p; })();

// --- Рост стата от использования (геометрическая прогрессия) ---
function trainStat(key, amount) {
  const s = player.stats[key];
  if (!s) return;
  s.prog += amount;
  while (s.prog >= s.cap) {
    s.prog -= s.cap;
    s.val += 1;
    s.cap = Math.round(s.cap * 1.6); // 40 -> 64 -> 102 ... (мягкая геометрия)
    pushLog(`📈 ${STATS[key].name} выросла до ${s.val}!`);
  }
  recalc();
}

function trainElement(el, dir, amount) {
  if (el in player.elements) player.elements[el] += amount;
  if (dir in player.dirs) player.dirs[dir] += amount;
}

// --- Классический уровень и опыт (видимая полоска) ---
// Сколько опыта нужно, чтобы уйти с уровня lvl на следующий.
function xpNeed(lvl) { return 100 + (lvl - 1) * 75; }
function gainXp(n) {
  if (!n) return;
  player.xp = (player.xp || 0) + n;
  let need = xpNeed(player.xpLevel);
  while (player.xp >= need) {
    player.xp -= need;
    player.xpLevel += 1;
    player.hp = player.maxHp; player.mp = player.maxMp; // полное восстановление
    const reward = player.xpLevel * 20;
    addRes('sparks', reward);
    pushLog(`🎉 Новый уровень ${player.xpLevel}! Полное восстановление и +${reward} 🔥 искр.`);
    if (typeof showToast === 'function') showToast(`🎉 Уровень ${player.xpLevel}!`);
    need = xpNeed(player.xpLevel);
  }
}

// --- Производные параметры из статов (формулы из раздела «статы») ---
function recalc() {
  if (player.xpLevel == null) player.xpLevel = 1;   // миграция старых сохранений
  if (player.xp == null) player.xp = 0;
  const v = (k) => player.stats[k].val + equipBonus(k);
  const maxHp = 100 + v('end') * 5;
  const maxMp = 20 + v('int') * 5;
  player.maxHp = maxHp;
  player.maxMp = maxMp;
  if (player.hp === 0 || player.hp > maxHp) player.hp = maxHp;
  if (player.mp === 0 || player.mp > maxMp) player.mp = maxMp;

  const weapon = player.equip.weapon;
  const wdmg = weapon ? [...weapon.dmg] : [1, 2]; // кулаки
  const dmgMult = 1 + v('str') * 0.02 + v('end') * 0.01;
  player.derived = {
    str:v('str'), agi:v('agi'), end:v('end'), int:v('int'), fai:v('fai'),
    fur:v('fur'), luk:v('luk'), rea:v('rea'), ref:v('ref'),
    attack: 10 + v('agi') * 2,
    defense: 5 + v('agi') * 1 + Math.round(v('rea') * 0.5),
    armor: armorTotal(),
    dmgMin: Math.max(1, Math.round(wdmg[0] * dmgMult)),
    dmgMax: Math.max(2, Math.round(wdmg[1] * dmgMult)),
    physCrit: Math.min(95, v('fur') * 2),
    magCrit: Math.min(95, v('fai') * 2),
    physCounter: Math.min(75, v('rea') * 2),
    magCounter: Math.min(75, v('ref') * 2),
    maxDmgChance: Math.min(90, v('luk')),
    lootBonus: v('luk') * 5,
    hpRegen: 1 + v('end') + v('fur'),
    mpRegen: 1 + v('int') + v('fai'),
    spellMult: 1 + v('int') * 0.02,
    weaponDist: weapon ? weapon.dist : 'ближняя',
    carry: v('str') * 5 + v('end') * 2,
  };
  // уровень героя = сумма статов / 5 (грубая агрегация)
  player.level = Math.max(1, Math.floor(STAT_ORDER.reduce((a, k) => a + player.stats[k].val, 0) / 9));
  player.danger = player.level;
}

function equipBonus(stat) {
  let b = 0;
  Object.values(player.equip).forEach((it) => {
    if (it && it.bonus && it.bonus[stat]) b += it.bonus[stat];
  });
  return b;
}

function armorTotal() {
  let a = 0;
  ['head','body','shield'].forEach((s) => { if (player.equip[s]) a += player.equip[s].armor || 0; });
  return a;
}

// --- Регенерация по времени (HP/MP в минуту) ---
function applyRegen() {
  const now = Date.now();
  const mins = (now - player.lastTick) / 60000;
  if (mins <= 0) { player.lastTick = now; return; }
  if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + mins * player.derived.hpRegen);
  if (player.mp < player.maxMp) player.mp = Math.min(player.maxMp, player.mp + mins * player.derived.mpRegen);
  player.hp = Math.round(player.hp); player.mp = Math.round(player.mp);
  player.lastTick = now;
}

// --- Ресурсы / инвентарь ---
function addRes(key, qty) { player.resources[key] = (player.resources[key] || 0) + qty; }
function hasRes(key, qty) { return (player.resources[key] || 0) >= qty; }
function spendRes(key, qty) { if (!hasRes(key, qty)) return false; player.resources[key] -= qty; return true; }

function addItem(item) {
  const it = JSON.parse(JSON.stringify(item));
  it.id = ++_itemId;
  if (it.stack) {
    const ex = player.inventory.find((x) => x.name === it.name && x.stack);
    if (ex) { ex.qty = (ex.qty || 1) + 1; return ex; }
    it.qty = 1;
  }
  player.inventory.push(it);
  return it;
}

function pushLog(msg) {
  player.log.unshift({ t: Date.now(), msg });
  if (player.log.length > 60) player.log.pop();
}

// --- Сохранение ---
function saveGame() {
  player.lastSaved = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(player));
  _scheduleCloudSave();
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  player = newPlayer();
  grantStarterResources(player);
  recalc();
  saveGame();
}

// --- Облачный sync (Cloudflare Workers + KV) ---
function _cloudReady() {
  return window.TG_USER && TG_USER.initData && !CLOUD_URL.includes('YOUR_SUBDOMAIN');
}

function _scheduleCloudSave() {
  if (!_cloudReady()) return;
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(_pushToCloud, 30000);
}

async function _pushToCloud() {
  if (!_cloudReady()) return;
  try {
    await fetch(`${CLOUD_URL}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_USER.initData, save: player }),
    });
  } catch (e) {}
}

async function syncFromCloud() {
  if (!window.TG_USER) return;
  if (CLOUD_URL.includes('YOUR_SUBDOMAIN')) return;
  try {
    const r = await fetch(`${CLOUD_URL}/save?user_id=${TG_USER.id}`);
    if (!r.ok) return;
    const remote = await r.json();
    if (!remote || typeof remote !== 'object') return;
    const local = loadGame();
    if (!local || (remote.lastSaved || 0) > (local.lastSaved || 0)) {
      localStorage.setItem(SAVE_KEY, JSON.stringify(remote));
      player = remote;
      recalc();
      applyRegen();
      if (typeof renderAll === 'function') renderAll();
    }
  } catch (e) {}
}

recalc();
applyRegen();

// Подтягиваем облачное сохранение после загрузки страницы
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncFromCloud);
  } else {
    syncFromCloud();
  }
}
