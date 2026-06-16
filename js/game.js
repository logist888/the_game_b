/*
 * Игровая логика «Вавилон»: добыча ресурсов, крафт, магазин, банк,
 * экипировка, походы в миры и проверка квестов.
 */

// --- Квесты: убедимся, что прогресс инициализирован ---
function ensureQuests() {
  QUESTS.forEach((q) => {
    if (!player.quests[q.id]) player.quests[q.id] = { stage: 0, done: false };
  });
}
ensureQuests();

function questCurrentGoal(q) {
  const st = player.quests[q.id];
  if (Array.isArray(q.goal)) return q.goal[Math.min(st.stage, q.goal.length - 1)];
  return q.goal;
}
function questProgressValue(q) {
  switch (q.type) {
    case 'kill': return player.counters.kills;
    case 'gather': return player.counters.gathered;
    case 'craft': return player.counters.crafted;
    case 'gold': return player.resources.gold || 0;
    case 'locations': return player.visitedLocations.length;
    case 'pvp': return player.pvp ? player.pvp.wins : 0;
    case 'boss': return player.counters.bossKills || 0;
    case 'spells': return player.spells.length;
    default: return 0;
  }
}
function checkQuests() {
  QUESTS.forEach((q) => {
    const st = player.quests[q.id];
    const stages = Array.isArray(q.goal) ? q.goal.length : 1;
    while (st.stage < stages && questProgressValue(q) >= questCurrentGoal(q)) {
      // выдать награду за этап
      Object.entries(q.reward).forEach(([k, v]) => addRes(k, v));
      st.stage += 1;
      const rstr = Object.entries(q.reward).map(([k, v]) => `${v} ${RESOURCES[k].name}`).join(', ');
      pushLog(`✅ Квест «${q.name}» — этап ${st.stage}! Награда: ${rstr}.`);
      if (st.stage >= stages) st.done = true;
    }
  });
  saveGame();
}

// --- Добыча ресурсов «своими руками» (квест «Заготовщик») ---
const GATHER_TABLE = [
  { res:'log', name:'Срубить дерево' }, { res:'stone', name:'Наколоть камня' },
  { res:'ore', name:'Добыть руду' }, { res:'fiber', name:'Собрать волокно' },
  { res:'herb', name:'Собрать ромашку' }, { res:'mushroom', name:'Собрать мухоморы' },
  { res:'mica', name:'Наколоть слюды' }, { res:'sand', name:'Набрать песка' },
  { res:'salt', name:'Выпарить соль' }, { res:'thinHide', name:'Снять тонкую шкуру' },
];
function gather(res) {
  const entry = GATHER_TABLE.find((g) => g.res === res);
  if (!entry) return;
  // удача и навык дают шанс добыть больше
  let qty = rnd(1, 3);
  if (chance(player.derived.luk)) qty += rnd(1, 2);
  // мастерство собирателя добавляет к каждой добыче
  qty += Math.floor((profLevel('gathering') - 1) / 3);
  addRes(res, qty);
  player.counters.gathered += qty;
  gainProfXp('gathering', qty);
  pushLog(`⛏️ ${entry.name}: +${qty} ${RESOURCES[res].name}.`);
  if (typeof showToast === 'function') showToast(`+${qty} ${RESOURCES[res].icon} ${RESOURCES[res].name}`);
  checkQuests();
  render();
}

// --- Крафт ---
function canCraft(recipe) {
  for (const [k, v] of Object.entries(recipe.in || {})) if (!hasRes(k, v)) return false;
  if (recipe.sparks && !hasRes('sparks', recipe.sparks)) return false;
  if (recipe.fuel && !hasRes('coal', recipe.fuel) && !hasRes('log', recipe.fuel * 6)) return false;
  return true;
}
function craft(recipeId) {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r || !canCraft(r)) { pushLog('❌ Недостаточно ресурсов для крафта.'); render(); return; }
  Object.entries(r.in || {}).forEach(([k, v]) => spendRes(k, v));
  if (r.sparks) spendRes('sparks', r.sparks);
  let quality = 1;
  if (r.fuel) {
    if (hasRes('coal', r.fuel)) { spendRes('coal', r.fuel); quality = 1.15; } // уголь = выше температура/качество
    else { spendRes('log', r.fuel * 6); quality = 1.0; }
  }
  // мастерство профессии повышает качество изделия (раздел GDD «Профессии»)
  const mastery = profQuality(r.ws);
  quality *= mastery;
  if (r.out.res) {
    let qty = r.out.qty || 1;
    // мастер-плавильщик/столяр изредка получает лишнюю единицу ресурса
    if (chance((profLevel(r.ws) - 1) * 3)) qty += 1;
    addRes(r.out.res, qty);
    pushLog(`🔧 Создано: ${qty}× ${RESOURCES[r.out.res].name}.`);
  } else if (r.out.item) {
    const item = JSON.parse(JSON.stringify(r.out.item));
    if (item.armor) item.armor = Math.round(item.armor * quality);
    if (item.dmg) item.dmg = item.dmg.map((d) => Math.round(d * quality));
    item.durability = [1000, 1000];
    addItem(item);
    const tags = [quality >= 1.15 ? 'закал. углём' : '', mastery > 1.05 ? `мастерство ×${mastery.toFixed(2)}` : ''].filter(Boolean).join(', ');
    pushLog(`🔧 Создан предмет: ${item.name}${tags ? ` (${tags})` : ''}.`);
  }
  // опыт профессии: ресурсы +2, снаряжение +5, легендарное +20
  const legendary = (r.sparks || 0) >= 300;
  gainProfXp(r.ws, r.out.res ? 2 : legendary ? 20 : 5);
  player.counters.crafted += 1;
  checkQuests();
  render();
}

// --- Кузница сетов: ковка частей и перековка рарности ---
function canAfford(cost) {
  if (cost.sparks && (player.resources.sparks || 0) < cost.sparks) return false;
  if (cost.souls && (player.resources.souls || 0) < cost.souls) return false;
  if (cost.res) { for (const [k, v] of Object.entries(cost.res)) if ((player.resources[k] || 0) < v) return false; }
  return true;
}
function payCost(cost) {
  if (cost.sparks) spendRes('sparks', cost.sparks);
  if (cost.souls) spendRes('souls', cost.souls);
  if (cost.res) Object.entries(cost.res).forEach(([k, v]) => spendRes(k, v));
}
function costLabel(cost) {
  const parts = [];
  if (cost.res) Object.entries(cost.res).forEach(([k, v]) => parts.push(`${RESOURCES[k].icon}${v}`));
  if (cost.sparks) parts.push(`🔥${cost.sparks}`);
  if (cost.souls) parts.push(`👻${cost.souls}`);
  return parts.join(' ');
}
// стоимость ковки части сета зависит от minTier комплекта
function setCraftCost(setId) {
  const t = GEAR_SETS[setId].minTier || 1;
  const cost = { sparks: 50 + t * 20, res: {} };
  if (t <= 3) cost.res = { metal: 3, cloth: 2, gem: 2 };
  else if (t <= 6) cost.res = { metal: 5, gem: 3, dragonScale: 1 };
  else cost.res = { hellSteel: 3, soulGem: 2, starCrystal: 2 };
  if (t >= 9) cost.souls = 1;
  return cost;
}
// стоимость перековки до целевой рарности (target — ключ рарности)
function reforgeCost(target) {
  const i = RARITY_ORDER.indexOf(target); // 1..5
  const cost = { sparks: 60 * i, res: {} };
  if (i <= 2) cost.res = { metal: 2 * i, gem: i };
  else cost.res = { dragonScale: i - 1, soulGem: Math.max(1, i - 2) };
  if (i >= 4) cost.souls = i - 3; // легендарный: 1 Душа, мифический: 2
  return cost;
}
function craftSetPiece(setId, slot) {
  const set = GEAR_SETS[setId];
  if (!set || !set.pieces[slot]) return;
  if (!player.codex || !player.codex[setId]) { pushLog('❌ Сначала найди хотя бы одну часть этого сета в походе.'); render(); return; }
  const cost = setCraftCost(setId);
  if (!canAfford(cost)) { pushLog('❌ Недостаточно ресурсов для ковки.'); render(); return; }
  payCost(cost);
  const it = makeSetItem(setId, slot, 'common');
  addItem(it);
  const ws = ['ring', 'amulet', 'earring'].includes(slot) ? 'jewelry' : 'smithy';
  gainProfXp(ws, 8);
  player.counters.crafted += 1;
  pushLog(`🔥 Скована часть сета: ${it.name} [Обычный].`);
  checkQuests();
  saveGame();
  render();
}
function reforgeItem(itemId) {
  const i = player.inventory.findIndex((x) => x.id === itemId);
  if (i < 0) return;
  const it = player.inventory[i];
  if (!it.set) return;
  const idx = RARITY_ORDER.indexOf(it.rarity || 'common');
  if (idx >= RARITY_ORDER.length - 1) { pushLog('❌ Уже максимальная рарность (Мифический).'); render(); return; }
  const target = RARITY_ORDER[idx + 1];
  const cost = reforgeCost(target);
  if (!canAfford(cost)) { pushLog('❌ Недостаточно ресурсов для перековки.'); render(); return; }
  payCost(cost);
  const fresh = makeSetItem(it.set, it.slot, target);
  fresh.id = it.id; // сохраняем тот же id
  player.inventory[i] = fresh;
  recordCodex(fresh);
  gainProfXp('jewelry', 6);
  pushLog(`🔨 Перековка: ${fresh.name} → [${RARITIES[target].name}]!`);
  saveGame();
  render();
}

// --- Экипировка ---
function equipItem(itemId) {
  const it = player.inventory.find((x) => x.id === itemId);
  if (!it || !it.slot) return;
  // проверка требований по статам — по ИТОГОВОМУ значению (с учётом надетой
  // бижутерии/брони и бонуса клана), чтобы можно было «добрать» статы вещами
  if (it.req) {
    for (const [k, v] of Object.entries(it.req)) {
      if (statTotal(k) < v) { pushLog(`❌ Требуется ${STATS[k].name} ${v} для «${it.name}» (у вас ${statTotal(k)}).`); render(); return; }
    }
  }
  const prev = player.equip[it.slot];
  player.equip[it.slot] = it;
  player.inventory = player.inventory.filter((x) => x.id !== it.id);
  if (prev) player.inventory.push(prev);
  recalc();
  pushLog(`🎽 Надето: ${it.name}.`);
  render();
}
// --- Сборки экипировки (лоадауты): сохранить текущий комплект и быстро надевать ---
const LOADOUT_MAX = 6;
function saveLoadout(name) {
  name = String(name || '').trim() || `Сборка ${(player.loadouts.length || 0) + 1}`;
  const items = {};
  Object.entries(player.equip).forEach(([slot, it]) => { if (it) items[slot] = it.id; });
  if (!Object.keys(items).length) { pushLog('❌ Нечего сохранять — экипировка пуста.'); render(); return; }
  if (!player.loadouts) player.loadouts = [];
  if (player.loadouts.length >= LOADOUT_MAX) { pushLog(`❌ Лимит сборок (${LOADOUT_MAX}). Удалите лишнюю.`); render(); return; }
  player.loadouts.push({ name, items });
  pushLog(`💾 Сборка «${name}» сохранена.`);
  saveGame();
  render();
}
function applyLoadout(idx) {
  const lo = player.loadouts && player.loadouts[idx];
  if (!lo) return;
  // пул всех вещей: рюкзак + надетые
  const pool = [...player.inventory];
  Object.values(player.equip).forEach((it) => { if (it) pool.push(it); });
  const newEquip = { weapon:null, head:null, body:null, shield:null, ring:null, amulet:null, earring:null };
  let missing = 0;
  Object.entries(lo.items).forEach(([slot, id]) => {
    const it = pool.find((x) => x.id === id);
    if (it && it.slot === slot) newEquip[slot] = it; else missing++;
  });
  const equippedIds = new Set(Object.values(newEquip).filter(Boolean).map((x) => x.id));
  player.equip = newEquip;
  player.inventory = pool.filter((x) => !equippedIds.has(x.id));
  recalc();
  pushLog(`🎽 Надета сборка «${lo.name}»${missing ? ` (${missing} предметов уже нет)` : ''}.`);
  saveGame();
  render();
}
function deleteLoadout(idx) {
  if (!player.loadouts || !player.loadouts[idx]) return;
  const [removed] = player.loadouts.splice(idx, 1);
  pushLog(`🗑 Сборка «${removed.name}» удалена.`);
  saveGame();
  render();
}

function unequip(slot) {
  const it = player.equip[slot];
  if (!it) return;
  player.equip[slot] = null;
  player.inventory.push(it);
  recalc();
  render();
}
function dropItem(itemId) {
  player.inventory = player.inventory.filter((x) => x.id !== itemId);
  render();
}

// --- Магазин (раздел «Магазин») ---
const SHOP_GOODS = [
  { res:'log', price:2 }, { res:'stone', price:2 }, { res:'ore', price:3 }, { res:'fiber', price:2 },
  { res:'herb', price:3 }, { res:'mushroom', price:3 }, { res:'mica', price:4 }, { res:'salt', price:3 },
  { res:'gem', price:25 }, { res:'thinHide', price:4 },
];
function buyRes(res, qty) {
  const g = SHOP_GOODS.find((x) => x.res === res); if (!g) return;
  const cost = g.price * qty;
  if (!hasRes('gold', cost)) { pushLog('🪙 Недостаточно золота.'); render(); return; }
  spendRes('gold', cost); addRes(res, qty);
  pushLog(`🛒 Куплено ${qty}× ${RESOURCES[res].name} за ${cost} золота.`);
  render();
}
function sellRes(res, qty) {
  if (!hasRes(res, qty)) return;
  const g = SHOP_GOODS.find((x) => x.res === res);
  const price = g ? Math.ceil(g.price / 2) : 1;
  spendRes(res, qty); addRes('gold', price * qty);
  pushLog(`💰 Продано ${qty}× ${RESOURCES[res].name} за ${price * qty} золота.`);
  checkQuests();
  render();
}

// --- Снаряжение за золото (обычное, нелегендарное) ---
// Цена по «силе» предмета: искры рецепта как прокса + топливо + база.
function gearPrice(r) { return 360 + (r.sparks || 0) * 12 + (r.fuel || 0) * 180; }
// Список снаряжения, доступного к покупке (всё нелегендарное снаряжение со слотом).
const SHOP_GEAR = RECIPES.filter((r) => r.out.item && r.out.item.slot && (r.sparks || 0) < 300);
function buyGear(recipeId) {
  const r = SHOP_GEAR.find((x) => x.id === recipeId);
  if (!r) return;
  const price = gearPrice(r);
  if (!hasRes('gold', price)) { pushLog('🪙 Недостаточно золота на снаряжение.'); render(); return; }
  spendRes('gold', price);
  const item = JSON.parse(JSON.stringify(r.out.item));
  item.durability = [1000, 1000];
  addItem(item);
  pushLog(`🛒 Куплено снаряжение: ${item.name} за ${price} 🪙.`);
  render();
}

// --- Банк (монетизация GDD: Души → Золото / Искры) ---
function exchangeSouls(kind) {
  if (!hasRes('souls', 1)) { pushLog('👻 Нет Душ для обмена.'); render(); return; }
  spendRes('souls', 1);
  if (kind === 'gold') { addRes('gold', 1000); pushLog('🏛️ 1 Душа → 1000 Золота.'); }
  else { addRes('sparks', 1000); pushLog('🏛️ 1 Душа → 1000 Искр.'); }
  render();
}

// --- Таверна: азартные игры на золото (раздел GDD «Таверна») ---
// Результат последней игры для отрисовки в панели.
let tavernResult = '';

function _tavernEnsure() { if (!player.counters.tavern) player.counters.tavern = { plays: 0, won: 0, lost: 0 }; }
function _tavernBank(delta) {
  _tavernEnsure();
  player.counters.tavern.plays += 1;
  if (delta > 0) player.counters.tavern.won += delta;
  else player.counters.tavern.lost += -delta;
}

// Кости: ставка, 2d6 игрока против 2d6 заведения. Больше — выигрыш ×2, ничья — возврат.
function playDice(bet) {
  if (!hasRes('gold', bet)) { tavernResult = '🪙 Недостаточно золота для ставки.'; render(); return; }
  spendRes('gold', bet);
  const me = rnd(1, 6) + rnd(1, 6);
  const house = rnd(1, 6) + rnd(1, 6);
  let net;
  if (me > house) { addRes('gold', bet * 2); net = bet; tavernResult = `🎲 Ты ${me} против ${house} — победа! +${bet} 🪙`; }
  else if (me === house) { addRes('gold', bet); net = 0; tavernResult = `🎲 Ничья ${me}:${house} — ставка возвращена.`; }
  else { net = -bet; tavernResult = `🎲 Ты ${me} против ${house} — проигрыш. −${bet} 🪙`; }
  _tavernBank(net);
  pushLog(tavernResult);
  checkQuests();
  render();
}

// Напёрстки: выбери 1 из 3, шарик под случайным. Угадал — выигрыш ×3.
function playThimbles(pick, bet) {
  if (!hasRes('gold', bet)) { tavernResult = '🪙 Недостаточно золота для ставки.'; render(); return; }
  spendRes('gold', bet);
  const ball = rnd(0, 2);
  let net;
  if (pick === ball) { addRes('gold', bet * 3); net = bet * 2; tavernResult = `🥤 Шарик под №${ball + 1} — угадал! +${bet * 2} 🪙`; }
  else { net = -bet; tavernResult = `🥤 Шарик был под №${ball + 1}, ты выбрал №${pick + 1}. −${bet} 🪙`; }
  _tavernBank(net);
  pushLog(tavernResult);
  checkQuests();
  render();
}

// Лотерея: билет за фикс. цену, взвешенная таблица призов (вкл. редкую Душу).
const LOTTERY_PRICE = 50;
function playLottery() {
  if (!hasRes('gold', LOTTERY_PRICE)) { tavernResult = `🪙 Билет стоит ${LOTTERY_PRICE} золота.`; render(); return; }
  spendRes('gold', LOTTERY_PRICE);
  const roll = Math.random() * 100;
  let net = -LOTTERY_PRICE;
  if (roll < 55) { tavernResult = '🎟️ Пусто. Удача отвернулась.'; }
  else if (roll < 80) { addRes('gold', 50); net += 50; tavernResult = '🎟️ Мелкий выигрыш: +50 🪙'; }
  else if (roll < 94) { addRes('gold', 150); net += 150; tavernResult = '🎟️ Неплохо: +150 🪙'; }
  else if (roll < 98.5) { addRes('sparks', 200); tavernResult = '🎟️ Джекпот искр: +200 🔥'; }
  else { addRes('souls', 1); tavernResult = '🎟️ 💎 СУПЕРПРИЗ: +1 Душа!'; }
  _tavernBank(net);
  pushLog(tavernResult);
  if (typeof showToast === 'function') showToast(tavernResult);
  checkQuests();
  render();
}

// --- Нижний мир: пассивная добыча смертными (раздел GDD «нижний мир») ---
// Множитель добычи всех шахт от уровня Города (+5% за уровень).
function lowerCityMult() { return 1 + (player.lowerWorld.buildings.city || 0) * 0.05; }
// Добыча постройки в час на текущем уровне.
function lowerProdPerHour(key) {
  const lvl = player.lowerWorld.buildings[key] || 0;
  const b = LOWER_BUILDINGS[key];
  if (!lvl) return 0;
  return b.res === 'gold' ? b.base * lvl : Math.round(b.base * lvl * lowerCityMult());
}
// Сколько часов накоплено с последнего сбора (с потолком LOWER_CAP_HOURS).
function lowerElapsedHours() {
  const last = player.lowerWorld.lastCollect || Date.now();
  return Math.min(LOWER_CAP_HOURS, Math.max(0, (Date.now() - last) / 3600000));
}
// Готовый к сбору урожай по ресурсам.
function lowerPending() {
  const hours = lowerElapsedHours();
  const out = {};
  LOWER_ORDER.forEach((k) => {
    const amt = Math.floor(lowerProdPerHour(k) * hours);
    if (amt > 0) { const res = LOWER_BUILDINGS[k].res; out[res] = (out[res] || 0) + amt; }
  });
  return out;
}
function collectLower() {
  const pending = lowerPending();
  const entries = Object.entries(pending);
  if (!entries.length) { pushLog('🏘️ Пока нечего собирать — смертные ещё трудятся.'); render(); return; }
  entries.forEach(([res, qty]) => addRes(res, qty));
  player.lowerWorld.lastCollect = Date.now();
  const str = entries.map(([res, qty]) => `${qty} ${RESOURCES[res].icon}`).join(', ');
  pushLog(`🏘️ Собран урожай нижнего мира: ${str}.`);
  if (typeof showToast === 'function') showToast(`🏘️ Собрано: ${str}`);
  checkQuests();
  render();
}
// Стоимость улучшения постройки (золото, квадратичный рост).
function upgradeLowerCost(key) {
  const lvl = player.lowerWorld.buildings[key] || 0;
  return 150 * (lvl + 1) * (lvl + 1);
}
function upgradeLower(key) {
  if (!LOWER_BUILDINGS[key]) return;
  const cost = upgradeLowerCost(key);
  if (!hasRes('gold', cost)) { pushLog('🪙 Недостаточно золота на постройку.'); render(); return; }
  // при улучшении сначала фиксируем накопленный урожай, чтобы не потерять
  const pending = lowerPending();
  Object.entries(pending).forEach(([res, qty]) => addRes(res, qty));
  if (Object.keys(pending).length) player.lowerWorld.lastCollect = Date.now();
  spendRes('gold', cost);
  player.lowerWorld.buildings[key] = (player.lowerWorld.buildings[key] || 0) + 1;
  pushLog(`🏗️ ${LOWER_BUILDINGS[key].name} улучшен до уровня ${player.lowerWorld.buildings[key]} за ${cost} 🪙.`);
  render();
}

// --- Походы: выбор мира → локации → бой ---
function startExpedition(worldIdx, locIdx, difficulty) {
  const world = WORLDS[worldIdx];
  const loc = world.locations[locIdx];
  const names = loc[1];
  // формируем отряд мобов локации (1-2 штуки). Игрок действует раз в раунд,
  // поэтому в паре каждый моб ослаблен, чтобы суммарная угроза была честной.
  const squad = names.slice(0, 2).map((n) => genMob(world.tier, n, difficulty));
  if (squad.length > 1) {
    squad.forEach((m) => {
      m.hp = m.maxHp = Math.round(m.maxHp * 0.7);
      m.dmg = [Math.round(m.dmg[0] * 0.65), Math.round(m.dmg[1] * 0.65)];
    });
  }
  const key = `${world.name} / ${loc[0]}`;
  if (!player.visitedLocations.includes(key)) player.visitedLocations.push(key);
  player.counters.expeditions += 1;
  startCombat(squad, { world: world.name, worldIndex: worldIdx, location: loc[0], difficulty });
  checkQuests();
  openCombat();
}

// --- Арена: тренировочный бой с двойником ---
function startArena() {
  const clone = genMob(Math.max(1, player.level), 'Тёмный двойник', 100);
  clone.hp = clone.maxHp = Math.round(player.maxHp * 0.8);
  clone.attack = player.derived.attack; clone.defense = player.derived.defense;
  clone.dmg = [player.derived.dmgMin, player.derived.dmgMax];
  startCombat([clone], { training: true });
  openCombat();
}

// финализация боя в UI (закрытие)
function finishCombatView() {
  if (combat && combat.won) checkQuests();
  combat = null;
  recalc();
  saveGame();
  closeCombat();
  render();
}
