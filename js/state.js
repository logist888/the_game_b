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
  const professions = {};
  PROF_ORDER.forEach((k) => { professions[k] = { lvl: 1, xp: 0 }; });
  return {
    name: name || (window.TG_USER && window.TG_USER.name) || 'Полубог',
    professions,
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
    counters: { kills:0, gathered:0, crafted:0, expeditions:0, bossKills:0 },
    lastTick: Date.now(),
    log: [],
    refCount: 0,
    clan: null,           // кэш данных клана (обновляется с сервера, не авторитетен)
    referredBy: null,
    refRegistered: false,
    welcomeSeen: false,
    pvp: { wins: 0, losses: 0 },
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

let player = loadGame() || (() => {
  const p = newPlayer();
  grantStarterResources(p);
  const sp = window.TG_USER && window.TG_USER.startParam;
  if (sp && sp.startsWith('ref_')) {
    const referrerId = sp.slice(4);
    if (referrerId && String(referrerId) !== String(window.TG_USER && window.TG_USER.id)) {
      p.referredBy = referrerId;
      p.resources.gold += 500;
      p.resources.sparks += 100;
      p.log.unshift({ t: Date.now(), msg: '🎁 Бонус за приглашение: +500 🪙 и +100 🔥!' });
    }
  }
  return p;
})();

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

// --- Профессии: опыт, уровни и открытие рецептов («тайные знания») ---
function profLevel(key) {
  const p = player.professions && player.professions[key];
  return p ? p.lvl : 1;
}
// Опыт до следующего уровня профессии (плавный рост).
function profNeed(lvl) { return 20 + (lvl - 1) * 15; }
// Бонус качества изделия от мастерства мастерской (множитель к урону/броне).
function profQuality(ws) { return 1 + (profLevel(ws) - 1) * 0.012; }

function gainProfXp(key, amount) {
  const p = player.professions[key];
  if (!p || !amount) return;
  p.xp += amount;
  let need = profNeed(p.lvl);
  while (p.xp >= need) {
    p.xp -= need;
    p.lvl += 1;
    const info = PROFESSIONS[key];
    pushLog(`📈 ${info.icon} ${info.name}: уровень ${p.lvl} (${profTitle(p.lvl)})!`);
    if (typeof showToast === 'function') showToast(`${info.icon} ${info.name} ур. ${p.lvl}`);
    _learnProfRecipes(key, p.lvl);
    need = profNeed(p.lvl);
  }
}

// Открыть рецепты, ставшие доступными на достигнутом уровне профессии.
function _learnProfRecipes(key, lvl) {
  const list = (typeof PROF_RECIPES !== 'undefined' && PROF_RECIPES[key]) || [];
  list.forEach(([id, req]) => {
    if (req <= lvl && !player.knownRecipes.includes(id)) {
      player.knownRecipes.push(id);
      const rec = RECIPES.find((x) => x.id === id);
      pushLog(`📜 Тайное знание: изучен рецепт «${rec ? rec.name : id}»!`);
    }
  });
}

// При старте/загрузке выдаём все рецепты, положенные по текущим уровням.
function syncProfRecipes() {
  PROF_ORDER.forEach((k) => _learnProfRecipes(k, profLevel(k)));
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
    if (player.xpLevel % 5 === 0) _notifyLevelUp(player.xpLevel);
    need = xpNeed(player.xpLevel);
  }
}

// --- Производные параметры из статов (формулы из раздела «статы») ---
function recalc() {
  if (player.xpLevel == null) player.xpLevel = 1;   // миграция старых сохранений
  if (player.xp == null) player.xp = 0;
  if (player.welcomeSeen == null) player.welcomeSeen = true; // старые игроки не видят приветствие
  if (!player.pvp) player.pvp = { wins: 0, losses: 0 };
  if (!player.counters) player.counters = { kills: player.kills || 0, gathered: player.gathered || 0, crafted: player.crafted || 0, expeditions: player.expeditions || 0, bossKills: 0 };
  if (player.counters.bossKills == null) player.counters.bossKills = 0;
  if (!player.professions) player.professions = {};
  PROF_ORDER.forEach((k) => { if (!player.professions[k]) player.professions[k] = { lvl: 1, xp: 0 }; });
  // Пассивный бонус клана («клановый артефакт»): +1 ко всем статам за каждые
  // 3 участника, максимум +4. Берётся из кэша player.clan (обновляется с сервера).
  const clanBuff = player.clan && player.clan.size ? Math.min(4, Math.floor(player.clan.size / 3)) : 0;
  player.clanBuff = clanBuff;
  const v = (k) => player.stats[k].val + equipBonus(k) + clanBuff;
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
    const resp = await fetch(`${CLOUD_URL}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_USER.initData, save: player }),
    });
    // После успешного пуша помечаем реферал как зарегистрированный локально
    if (resp.ok && player.referredBy && !player.refRegistered) {
      player.refRegistered = true;
      localStorage.setItem(SAVE_KEY, JSON.stringify(player));
    }
  } catch (e) {}
}

async function syncFromCloud() {
  if (!window.TG_USER) return;
  if (CLOUD_URL.includes('YOUR_SUBDOMAIN')) return;
  try {
    const r = await fetch(`${CLOUD_URL}/save?user_id=${TG_USER.id}`);
    if (!r.ok) return;
    const remote = await r.json();

    if (!remote || typeof remote !== 'object') {
      // Новый игрок — нет облачного сохранения. Пушим немедленно если есть реферал.
      if (player.referredBy && !player.refRegistered) _pushToCloud();
      return;
    }

    // Extract server-injected meta fields before comparing saves
    const pendingBonus = remote._pendingBonus || 0;
    const remoteRefCount = remote._refCount;
    const pendingMarketGold = remote._pendingMarketGold || 0;
    delete remote._pendingBonus;
    delete remote._refCount;
    delete remote._pendingMarketGold;

    const local = loadGame();
    if (!local || (remote.lastSaved || 0) > (local.lastSaved || 0)) {
      localStorage.setItem(SAVE_KEY, JSON.stringify(remote));
      player = remote;
      recalc();
      applyRegen();
    }

    if (pendingBonus) {
      player.resources.gold = (player.resources.gold || 0) + pendingBonus;
      pushLog(`🎁 Бонус от рефералов: +${pendingBonus} 🪙`);
      if (typeof showToast === 'function') showToast(`🎁 +${pendingBonus} 🪙 от рефералов!`);
    }
    if (remoteRefCount != null) player.refCount = remoteRefCount;

    if (pendingMarketGold) {
      player.resources.gold = (player.resources.gold || 0) + pendingMarketGold;
      pushLog(`💰 Выручка с барахолки: +${pendingMarketGold} 🪙`);
      if (typeof showToast === 'function') showToast(`💰 +${pendingMarketGold} 🪙 за проданные лоты!`);
    }

    if (pendingBonus || remoteRefCount != null || pendingMarketGold) saveGame();
    if (typeof render === 'function') render();

    // Новый реферальный игрок: пушим немедленно вместо ожидания 30 с
    if (player.referredBy && !player.refRegistered) _pushToCloud();
  } catch (e) {}
}

function _scheduleHpNotify() {
  if (!_cloudReady() || !player.derived) return;
  if (player.hp >= player.maxHp) { _cancelHpNotify(); return; }
  const secsUntilFull = Math.ceil((player.maxHp - player.hp) / player.derived.hpRegen * 60);
  if (secsUntilFull <= 0) return;
  fetch(`${CLOUD_URL}/hp-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: TG_USER.initData, secsUntilFull }),
  }).catch(() => {});
}

function _cancelHpNotify() {
  if (!_cloudReady()) return;
  fetch(`${CLOUD_URL}/hp-notify`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: TG_USER.initData }),
  }).catch(() => {});
}

function _notifyLevelUp(level) {
  if (!_cloudReady()) return;
  fetch(`${CLOUD_URL}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: TG_USER.initData, type: 'levelup', payload: { level } }),
  }).catch(() => {});
}

recalc();
syncProfRecipes();
applyRegen();

// Подтягиваем облачное сохранение после загрузки страницы
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncFromCloud);
  } else {
    syncFromCloud();
  }

  // Сохраняем в облако при сворачивании/закрытии (важно для Telegram Mini App)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _cloudReady()) {
      clearTimeout(_cloudTimer);
      _pushToCloud();
      _scheduleHpNotify();
    } else if (document.visibilityState === 'visible' && _cloudReady()) {
      _cancelHpNotify(); // вернулся — HP возможно уже восстановился
    }
  });
  window.addEventListener('beforeunload', () => {
    if (_cloudReady()) { _pushToCloud(); _scheduleHpNotify(); }
  });
}
