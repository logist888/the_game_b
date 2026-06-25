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
      pushLog('✅ Квест «{q}» — этап {stage}! Награда: {rstr}.', {q:L(q.name), stage:st.stage, rstr});
      if (st.stage >= stages) st.done = true;
    }
  });
  checkAchievements();
  saveGame();
}

// --- Ежедневное: вход (стрик) + ежедневные задания ---
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayDiff(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
function dailyMetric(key) {
  const p = player;
  switch (key) {
    case 'kills': return p.counters.kills;
    case 'expeditions': return p.counters.expeditions || 0;
    case 'bossKills': return p.counters.bossKills || 0;
    case 'pvpWins': return p.pvp ? p.pvp.wins : 0;
    case 'gathered': return p.counters.gathered;
    case 'crafted': return p.counters.crafted;
    default: return 0;
  }
}
function dailyBaselineSnapshot() {
  const b = {};
  DAILY_QUESTS.forEach((q) => { b[q.metric] = dailyMetric(q.metric); });
  return b;
}
// гарантируем актуальный дневной цикл (вызывается из recalc)
function ensureDaily() {
  const today = todayKey();
  if (!player.daily) {
    player.daily = { cycleDay: today, baseline: dailyBaselineSnapshot(), questClaimed: {}, allClaimed: false, loginClaimedDay: null, streak: 0, arena: 0 };
    return;
  }
  if (player.daily.cycleDay !== today) {
    player.daily.cycleDay = today;
    player.daily.baseline = dailyBaselineSnapshot();
    player.daily.questClaimed = {};
    player.daily.allClaimed = false;
    player.daily.arena = 0;
  }
  if (player.daily.arena == null) player.daily.arena = 0;
}
function dailyQuestProgress(q) {
  const base = (player.daily.baseline && player.daily.baseline[q.metric]) || 0;
  return Math.max(0, Math.min(q.goal, dailyMetric(q.metric) - base));
}
function rewardLabel(r) {
  const parts = [];
  ['gold', 'sparks', 'souls'].forEach((k) => { if (r[k]) parts.push(`${r[k]} ${RESOURCES[k].icon}`); });
  if (r.res) Object.entries(r.res).forEach(([k, v]) => parts.push(`${v} ${RESOURCES[k].icon}`));
  Object.entries(r).forEach(([k, v]) => { if (!['gold', 'sparks', 'souls', 'res'].includes(k) && RESOURCES[k]) parts.push(`${v} ${RESOURCES[k].icon}`); });
  return parts.join(' ');
}
function grantReward(r) {
  ['gold', 'sparks', 'souls'].forEach((k) => { if (r[k]) addRes(k, r[k]); });
  if (r.res) Object.entries(r.res).forEach(([k, v]) => addRes(k, v));
  Object.entries(r).forEach(([k, v]) => { if (!['gold', 'sparks', 'souls', 'res'].includes(k) && RESOURCES[k]) addRes(k, v); });
}
function dailyLoginReward(streak) {
  return { gold: 500, sparks: 50, res: { ore: 5, herb: 5, log: 5 }, souls: (streak % 7 === 0) ? 1 : 0 };
}
function claimDailyLogin() {
  ensureDaily();
  const today = todayKey();
  if (player.daily.loginClaimedDay === today) { pushLog('Сегодня награда за вход уже получена.'); render(); return; }
  const prev = player.daily.loginClaimedDay;
  player.daily.streak = (prev && dayDiff(prev, today) === 1) ? (player.daily.streak + 1) : 1;
  player.daily.loginClaimedDay = today;
  const r = dailyLoginReward(player.daily.streak);
  grantReward(r);
  pushLog('🎁 Награда за вход (день {streak} подряд): +{r}.', {streak:player.daily.streak, r:rewardLabel(r)});
  if (typeof showToast === 'function') showToast(tp('🎁 +{gold} золота!', {gold:r.gold}));
  checkAchievements();
  saveGame();
  render();
}
function claimDailyQuest(qid) {
  ensureDaily();
  const q = DAILY_QUESTS.find((x) => x.id === qid);
  if (!q || player.daily.questClaimed[qid]) return;
  if (dailyQuestProgress(q) < q.goal) { pushLog('❌ Задание ещё не выполнено.'); render(); return; }
  player.daily.questClaimed[qid] = true;
  grantReward(q.reward);
  pushLog('🎁 Ежедневное «{q}» выполнено! +{r}.', {q:L(q.name), r:rewardLabel(q.reward)});
  if (!player.daily.allClaimed && DAILY_QUESTS.every((x) => player.daily.questClaimed[x.id])) {
    player.daily.allClaimed = true;
    grantReward(DAILY_ALL_REWARD);
    pushLog('🌟 Все ежедневные выполнены! Бонус: +{r}.', {r:rewardLabel(DAILY_ALL_REWARD)});
    if (typeof showToast === 'function') showToast('🌟 Ежедневные выполнены!');
  }
  saveGame();
  render();
}

// Достижения: разблокируем выполненные, выдаём награду один раз.
function checkAchievements() {
  if (!player.achievements) player.achievements = [];
  ACHIEVEMENTS.forEach((a) => {
    if (player.achievements.includes(a.id)) return;
    let ok = false;
    try { ok = a.check(player); } catch (e) { ok = false; }
    if (!ok) return;
    player.achievements.push(a.id);
    if (a.reward) Object.entries(a.reward).forEach(([k, v]) => addRes(k, v));
    const rstr = a.reward ? ` Награда: ${Object.entries(a.reward).map(([k, v]) => `${v} ${RESOURCES[k].name}`).join(', ')}.` : '';
    pushLog('🏆 Достижение «{a}»!{rstr}', {a:L(a.name), rstr});
    if (typeof showToast === 'function') showToast(tp('🏆 {a}', {a:L(a.name)}));
  });
}

// --- Почасовые лимиты действий (растут с уровнем героя) ---
// gather — ручная добыча, craft — производство вещей. Окно сбрасывается раз в час.
function limitCap(kind) {
  const lvl = player.xpLevel || 1;
  if (kind === 'gather') return (20 + lvl * 3) * 100;
  if (kind === 'craft') return (10 + lvl * 2) * 100;
  return 9999;
}
function limitState(kind) {
  if (!player.limits) player.limits = {};
  if (!player.limits[kind]) player.limits[kind] = { count: 0, hourStart: Date.now() };
  const st = player.limits[kind];
  if (Date.now() - st.hourStart >= 3600000) { st.count = 0; st.hourStart = Date.now(); }
  return st;
}
function limitRemaining(kind) { return Math.max(0, limitCap(kind) - limitState(kind).count); }
function limitResetMins(kind) { const st = limitState(kind); return Math.max(1, Math.ceil((3600000 - (Date.now() - st.hourStart)) / 60000)); }
function useLimit(kind, n) {
  n = n || 1;
  const st = limitState(kind);
  if (st.count + n > limitCap(kind)) return false;
  st.count += n;
  return true;
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
  if (!useLimit('gather', 1)) { pushLog('⛔ Лимит добычи на час исчерпан ({cap}/час). Сброс через {min} мин.', {cap:limitCap('gather'), min:limitResetMins('gather')}); render(); return; }
  // удача и навык дают шанс добыть больше
  let qty = rnd(1, 3);
  if (chance(player.derived.luk)) qty += rnd(1, 2);
  // мастерство собирателя добавляет к каждой добыче
  qty += Math.floor((profLevel('gathering') - 1) / 3);
  addRes(res, qty);
  player.counters.gathered += qty;
  gainProfXp('gathering', qty);
  pushLog('⛏️ {src}: +{qty} {res}.', {src:L(entry.name), qty, res:rName(res)});
  if (typeof showToast === 'function') showToast(tp('+{qty} {icon} {res}', {qty, icon:RESOURCES[res].icon, res:rName(res)}));
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
  if (!useLimit('craft', 1)) { pushLog('⛔ Лимит производства на час исчерпан ({cap}/час). Сброс через {min} мин.', {cap:limitCap('craft'), min:limitResetMins('craft')}); render(); return; }
  _craftOnce(r, false);
  checkQuests();
  render();
}
// Сколько изделий можно создать из текущих ресурсов (с учётом ингредиентов, искр и топлива)
function maxCraftable(r) {
  let max = Infinity;
  Object.entries(r.in || {}).forEach(([k, v]) => { max = Math.min(max, Math.floor((player.resources[k] || 0) / v)); });
  if (r.sparks) max = Math.min(max, Math.floor((player.resources.sparks || 0) / r.sparks));
  if (r.fuel) {
    const fuelUnits = (player.resources.coal || 0) + Math.floor((player.resources.log || 0) / 6); // 1 уголь или 6 брёвен = 1 топливо
    max = Math.min(max, Math.floor(fuelUnits / r.fuel));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}
// Создать максимум изделий из имеющихся ресурсов
function craftMax(recipeId) {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r) return;
  const byRes = maxCraftable(r);
  if (byRes <= 0) { pushLog('❌ Недостаточно ресурсов для крафта.'); render(); return; }
  const left = limitRemaining('craft');
  if (left <= 0) { pushLog('⛔ Лимит производства на час исчерпан ({cap}/час). Сброс через {min} мин.', {cap:limitCap('craft'), min:limitResetMins('craft')}); render(); return; }
  const n = Math.min(byRes, left);
  let made = 0;
  while (made < n && canCraft(r)) { _craftOnce(r, true); made++; }
  useLimit('craft', made);
  const outName = r.out.item ? r.out.item.name : RESOURCES[r.out.res].name;
  pushLog('🔧 Создано ×{made}: {out}.{lim}', {made, out:L(outName), lim:made < byRes ? (' (' + L('лимит') + ' ' + limitCap('craft') + '/' + L('час') + '; ' + L('осталось 0') + ')') : ''});
  checkQuests();
  render();
}
// Один акт крафта (без render/checkQuests). quiet=true — без лога на каждое изделие.
function _craftOnce(r, quiet) {
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
    if (!quiet) pushLog('🔧 Создано: {qty}× {res}.', {qty, res:rName(r.out.res)});
  } else if (r.out.item) {
    const item = JSON.parse(JSON.stringify(r.out.item));
    if (item.armor) item.armor = Math.round(item.armor * quality);
    if (item.dmg) item.dmg = item.dmg.map((d) => Math.round(d * quality));
    if (item.conc) item.conc = Math.round(item.conc * quality); // концентрация зелья растёт от мастерства Алхимика
    item.durability = [1000, 1000];
    addItem(item);
    const tags = [quality >= 1.15 ? 'закал. углём' : '', mastery > 1.05 ? `мастерство ×${mastery.toFixed(2)}` : ''].filter(Boolean).join(', ');
    if (!quiet) pushLog('🔧 Создан предмет: {item}{tags}.', {item:L(item.name), tags:tags ? (' (' + tags + ')') : ''});
  }
  // опыт профессии: ресурсы +2, снаряжение +5, легендарное +20
  const legendary = (r.sparks || 0) >= 300;
  gainProfXp(r.ws, r.out.res ? 2 : legendary ? 20 : 5);
  player.counters.crafted += 1;
}

// --- Общие помощники стоимости (используются заточкой и др.) ---
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
// --- Усилители (камни) и гнёзда ---
function craftEnhancer(stat, tier) {
  const t = GEM_TIERS[tier]; const e = ENHANCERS[stat];
  if (!t || !e) return;
  if ((player.resources.gem || 0) < t.gem || (player.resources.sparks || 0) < t.sparks) {
    pushLog('❌ Нужно {gem} 💎 камней и {sparks} 🔥 искр.', {gem:t.gem, sparks:t.sparks}); render(); return;
  }
  spendRes('gem', t.gem); spendRes('sparks', t.sparks);
  addItem({ name: `${e.name} ${t.rom}`, type: 'усилитель', gemStat: stat, tier, bonus: t.bonus, icon: e.icon });
  pushLog('💎 Создан усилитель: {enh} {rom} (+{bonus} {stat}).', {enh:L(e.name), rom:t.rom, bonus:t.bonus, stat:sName(stat)});
  player.counters.crafted += 1;
  checkQuests(); saveGame(); render();
}
function openSocket(itemId) {
  const it = findOwnedItem(itemId);
  if (!it || !it.slot) return;
  if (it.rented) { pushLog('🔒 Арендованную вещь нельзя изменять — только носить.'); render(); return; }
  if (!it.sockets) it.sockets = [];
  const n = it.sockets.length;
  const max = maxSockets(it);
  if (n >= max) { pushLog('❌ Больше гнёзд не просверлить (макс {max} для рарности).', {max}); render(); return; }
  const cost = SOCKET_OPEN_COST[n] || SOCKET_OPEN_COST[SOCKET_OPEN_COST.length - 1];
  if ((player.resources.sparks || 0) < cost) { pushLog('❌ Нужно {cost} 🔥 искр на гнездо.', {cost}); render(); return; }
  spendRes('sparks', cost);
  it.sockets.push(null);
  pushLog('🛠 Просверлено гнездо {n}/{max} в «{item}» за {cost} 🔥.', {n:it.sockets.length, max, item:L(it.name), cost});
  recalc(); saveGame(); render();
}
function socketGem(itemId, idx, gemId) {
  const it = findOwnedItem(itemId);
  if (!it || !it.sockets || it.sockets[idx] === undefined) return;
  if (it.rented) { pushLog('🔒 Арендованную вещь нельзя изменять — только носить.'); render(); return; }
  if (it.sockets[idx]) { pushLog('❌ Гнездо занято.'); render(); return; }
  const gi = player.inventory.findIndex((x) => x.id === gemId && x.type === 'усилитель');
  if (gi < 0) { render(); return; }
  const gem = player.inventory.splice(gi, 1)[0];
  it.sockets[idx] = { gemStat: gem.gemStat, tier: gem.tier, bonus: gem.bonus, name: gem.name, icon: gem.icon };
  recalc();
  pushLog('💎 «{gem}» вставлен в «{item}».', {gem:L(gem.name), item:L(it.name)});
  saveGame(); render();
}
function unsocketGem(itemId, idx) {
  const it = findOwnedItem(itemId);
  if (!it || !it.sockets || !it.sockets[idx]) return;
  if (it.rented) { pushLog('🔒 Арендованную вещь нельзя изменять — только носить.'); render(); return; }
  const g = it.sockets[idx];
  it.sockets[idx] = null;
  addItem({ name: g.name, type: 'усилитель', gemStat: g.gemStat, tier: g.tier, bonus: g.bonus, icon: g.icon });
  recalc();
  pushLog('💎 «{gem}» извлечён из «{item}».', {gem:L(g.name), item:L(it.name)});
  saveGame(); render();
}

// --- Заточка снаряжения (+1..+10): усиливает статы предмета ---
const ENHANCE_MAX = 10;
function enhanceCost(plus) {
  const n = plus + 1; // целевой уровень
  const cost = { sparks: 40 * n, res: {} };
  if (n <= 3) cost.res = { metal: n, stone: n * 2 };
  else if (n <= 6) cost.res = { metal: n, gem: n - 2 };
  else cost.res = { metal: n, dragonScale: n - 5 };
  if (n >= 9) cost.souls = 1;
  return cost;
}
// пересчитать статы предмета из базового снимка по уровню заточки (+6%/ур.)
function recomputeEnhanced(it) {
  if (!it.baseStats) return;
  const f = 1 + 0.06 * (it.plus || 0);
  if (it.baseStats.dmg) it.dmg = it.baseStats.dmg.map((d) => Math.max(1, Math.round(d * f)));
  if (it.baseStats.armor != null) it.armor = Math.max(1, Math.round(it.baseStats.armor * f));
  if (it.baseStats.bonus) { it.bonus = {}; Object.entries(it.baseStats.bonus).forEach(([k, v]) => { it.bonus[k] = Math.max(1, Math.round(v * f)); }); }
}
function findOwnedItem(itemId) {
  return player.inventory.find((x) => x.id === itemId) || Object.values(player.equip).find((x) => x && x.id === itemId) || null;
}
function enhanceItem(itemId) {
  const it = findOwnedItem(itemId);
  if (!it || !it.slot) return;
  if (it.rented) { pushLog('🔒 Арендованную вещь нельзя точить — только носить.'); render(); return; }
  const plus = it.plus || 0;
  if (plus >= ENHANCE_MAX) { pushLog('❌ Максимальная заточка (+{max}).', {max:ENHANCE_MAX}); render(); return; }
  const cost = enhanceCost(plus);
  if (!canAfford(cost)) { pushLog('❌ Недостаточно ресурсов для заточки.'); render(); return; }
  payCost(cost);
  if (!it.baseStats) {
    it.baseStats = {
      dmg: it.dmg ? [...it.dmg] : null,
      armor: it.armor != null ? it.armor : null,
      bonus: it.bonus ? { ...it.bonus } : null,
    };
  }
  it.plus = plus + 1;
  recomputeEnhanced(it);
  recalc();
  pushLog('⚒️ Заточка: {item} +{plus}!', {item:L(it.name), plus:it.plus});
  checkAchievements();
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
      if (statTotal(k) < v) { pushLog('❌ Требуется {stat} {v} для «{item}» (у вас {have}).', {stat:sName(k), v, item:L(it.name), have:statTotal(k)}); render(); return; }
    }
  }
  const prev = player.equip[it.slot];
  player.equip[it.slot] = it;
  player.inventory = player.inventory.filter((x) => x.id !== it.id);
  if (prev) player.inventory.push(prev);
  recalc();
  pushLog('🎽 Надето: {item}.', {item:L(it.name)});
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
  if (player.loadouts.length >= loadoutMax()) { pushLog('❌ Лимит сборок ({max}). Удалите лишнюю.', {max:loadoutMax()}); render(); return; }
  player.loadouts.push({ name, items });
  pushLog('💾 Сборка «{name}» сохранена.', {name});
  checkAchievements();
  saveGame();
  render();
}
// «ценность» предмета для авто-подбора лучшего в слот (статы уже учитывают рарность и заточку).
function itemScore(it) {
  let s = 0;
  if (it.dmg) s += (it.dmg[0] + it.dmg[1]) / 2;
  if (it.armor) s += it.armor;
  if (it.bonus) s += Object.values(it.bonus).reduce((a, b) => a + b, 0);
  return s;
}
// Надеть комплект сета лучшими имеющимися частями (по характеристикам).
function equipBestSet(setId) {
  const set = GEAR_SETS[setId];
  if (!set) return;
  const pool = [...player.inventory];
  Object.values(player.equip).forEach((it) => { if (it) pool.push(it); });
  const slots = Object.keys(set.pieces);
  const newEquip = { ...player.equip };
  let picked = 0;
  slots.forEach((slot) => {
    const cands = pool.filter((it) => it.set === setId && it.slot === slot);
    if (!cands.length) return;
    cands.sort((a, b) => itemScore(b) - itemScore(a));
    newEquip[slot] = cands[0];
    picked++;
  });
  if (!picked) { pushLog('❌ Нет частей сета «{set}» в наличии.', {set:L(set.name)}); render(); return; }
  const equippedIds = new Set(Object.values(newEquip).filter(Boolean).map((x) => x.id));
  player.equip = newEquip;
  player.inventory = pool.filter((x) => !equippedIds.has(x.id));
  recalc();
  pushLog('🎽 Надет комплект «{set}» — лучшие части ({picked}/{total}).', {set:L(set.name), picked, total:slots.length});
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
  pushLog('🎽 Надета сборка «{name}»{missing}.', {name:lo.name, missing:missing ? (' (' + missing + ' ' + L('предметов уже нет') + ')') : ''});
  saveGame();
  render();
}
function deleteLoadout(idx) {
  if (!player.loadouts || !player.loadouts[idx]) return;
  const [removed] = player.loadouts.splice(idx, 1);
  pushLog('🗑 Сборка «{name}» удалена.', {name:removed.name});
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
  const it = player.inventory.find((x) => x.id === itemId);
  if (it && it.rented) { pushLog('🔒 Арендованную вещь нельзя выбросить — верните её в арсенал.'); render(); return; }
  player.inventory = player.inventory.filter((x) => x.id !== itemId);
  render();
}

// ---------------- Питомцы (Приручение) ----------------
function togglePetActive(id) {
  const p = (player.pets || []).find((x) => x.id === id);
  if (!p) return;
  if (!p.active) {
    const n = player.pets.filter((x) => x.active).length;
    if (n >= activePetCap()) { pushLog('🐾 Лимит активных питомцев ({cap}). Поднимайте навык Приручение.', {cap:activePetCap()}); render(); return; }
  }
  p.active = !p.active;
  saveGame(); render();
}
function releasePet(id) {
  if (typeof confirm === 'function' && !confirm('Отпустить питомца на волю?')) return;
  player.pets = (player.pets || []).filter((x) => x.id !== id);
  pushLog('🐾 Питомец отпущен на волю.');
  saveGame(); render();
}

// ---------------- Гильдия магов ----------------
function elementSum() { return ELEMENTS.reduce((a, e) => a + (player.elements[e] || 0), 0); }
function mageRank() { return mageRankIdx(elementSum()); }

function joinMageGuild() {
  if (player.mageGuild) return;
  if (!hasRes('gold', MAGE_GUILD_FEE)) { pushLog('❌ Нужно {n} 🪙 на членский взнос.', {n:MAGE_GUILD_FEE}); render(); return; }
  spendRes('gold', MAGE_GUILD_FEE);
  player.mageGuild = true;
  pushLog('🔮 Вы вступили в Гильдию магов!');
  checkAchievements(); saveGame(); render();
}

function upgradeSpell(id) {
  if (!player.mageGuild) { pushLog('🔮 Сначала вступите в Гильдию магов.'); render(); return; }
  if (!player.spells.includes(id)) return;
  const plus = player.spellPlus[id] || 0;
  const cap = spellUpgradeCap(mageRank());
  if (plus >= cap) { pushLog('❌ Для вашего ранга максимум улучшения +{cap}. Поднимайте уровни стихий.', {cap}); render(); return; }
  const cost = spellUpgradeCost(plus);
  if (!hasRes('gold', cost.gold) || !hasRes('sparks', cost.sparks) || !hasRes('gem', cost.gem)) {
    pushLog('❌ Нужно {gold}🪙 + {sparks}🔥 + {gem}💎.', {gold:cost.gold, sparks:cost.sparks, gem:cost.gem}); render(); return;
  }
  spendRes('gold', cost.gold); spendRes('sparks', cost.sparks); spendRes('gem', cost.gem);
  player.spellPlus[id] = plus + 1;
  const s = SPELLS.find((x) => x.id === id);
  pushLog('🔮 «{spell}» улучшено до +{plus}.', {spell:L(s ? s.name : id), plus:plus + 1});
  saveGame(); render();
}

function learnSpell(id) {
  if (!player.mageGuild) { pushLog('🔮 Сначала вступите в Гильдию магов.'); render(); return; }
  if (player.spells.includes(id)) return;
  const def = SPELL_LEARN[id]; if (!def) return;
  if (mageRank() < def.rank) { pushLog('❌ Нужен ранг «{rank}» — поднимайте уровни стихий.', {rank:L(MAGE_RANKS[def.rank])}); render(); return; }
  if (!hasRes('gold', def.gold) || !hasRes('sparks', def.sparks)) { pushLog('❌ Нужно {gold}🪙 + {sparks}🔥.', {gold:def.gold, sparks:def.sparks}); render(); return; }
  spendRes('gold', def.gold); spendRes('sparks', def.sparks);
  player.spells.push(id);
  const s = SPELLS.find((x) => x.id === id);
  pushLog('📜 Изучено заклинание «{spell}»!', {spell:L(s ? s.name : id)});
  checkAchievements(); saveGame(); render();
}

// --- Прочность и ремонт ---
function repairCost(it) {
  if (!it || !it.durability) return null;
  const miss = it.durability[1] - it.durability[0];
  if (miss <= 0) return null;
  const rr = it.rarity ? (RARITY_ORDER.indexOf(it.rarity) + 1) : 1;
  return { gold: Math.max(1, Math.ceil(miss / 8) * rr), sparks: Math.max(0, Math.ceil(miss / 40) * rr) };
}
function repairItem(itemId) {
  const it = findOwnedItem(itemId);
  if (!it || !it.durability) return;
  const cost = repairCost(it);
  if (!cost) { render(); return; }
  if (!hasRes('gold', cost.gold) || (cost.sparks && !hasRes('sparks', cost.sparks))) { pushLog('❌ Недостаточно ресурсов для починки.'); render(); return; }
  spendRes('gold', cost.gold); if (cost.sparks) spendRes('sparks', cost.sparks);
  it.durability[0] = it.durability[1];
  pushLog('🔧 «{item}» починено (−{gold} 🪙{sparks}).', {item:L(it.name), gold:cost.gold, sparks:cost.sparks ? (' −' + cost.sparks + ' 🔥') : ''});
  recalc(); saveGame(); render();
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
  pushLog('🛒 Куплено {qty}× {res} за {cost} золота.', {qty, res:rName(res), cost});
  render();
}
function sellRes(res, qty) {
  if (!hasRes(res, qty)) return;
  const g = SHOP_GOODS.find((x) => x.res === res);
  const price = g ? Math.ceil(g.price / 2) : 1;
  spendRes(res, qty); addRes('gold', price * qty);
  pushLog('💰 Продано {qty}× {res} за {sum} золота.', {qty, res:rName(res), sum:price * qty});
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
  pushLog('🛒 Куплено снаряжение: {item} за {price} 🪙.', {item:L(item.name), price});
  render();
}

// --- Премиум-аккаунт (Фаза 3) ---
function isPremium() { return (player.premiumUntil || 0) > Date.now(); }
function extendPremium(days) {
  const base = Math.max(Date.now(), player.premiumUntil || 0);
  player.premiumUntil = base + days * 86400000;
}
function arenaDailyLimit() { return isPremium() ? 100 : ARENA_DAILY_LIMIT; }
function loadoutMax() { return isPremium() ? LOADOUT_MAX + 3 : LOADOUT_MAX; }
function buyPremiumAccountSouls() {
  if (!hasRes('souls', PREMIUM_SOULS)) { if (typeof showToast === 'function') showToast(t('👻 Недостаточно Душ для покупки.')); return; }
  spendRes('souls', PREMIUM_SOULS);
  extendPremium(PREMIUM_DAYS);
  if (typeof showToast === 'function') showToast(t('👑 Премиум-аккаунт активирован!'));
  saveGame();
  render();
}

// --- Премиум-лавка (Фаза 2): сетовые предметы за Души ---
function buyPremiumPiece(setId, slot) {
  const set = GEAR_SETS[setId];
  const rarity = premiumRarity;
  if (!set || !set.pieces[slot] || !PREMIUM_RARITIES.includes(rarity)) return;
  const price = PREMIUM_PIECE_PRICE[rarity];
  if (!hasRes('souls', price)) { if (typeof showToast === 'function') showToast(t('👻 Недостаточно Душ для покупки.')); return; }
  spendRes('souls', price);
  const item = makeSetItem(setId, slot, rarity);
  item.durability = [1000, 1000];
  addItem(item);
  pushLog('🛒 Куплено: {item} за {souls} 👻.', { item: L(item.name), souls: price });
  saveGame();
  render();
}

function buyPremiumSet(setId) {
  const set = GEAR_SETS[setId];
  const rarity = premiumRarity;
  if (!set || !PREMIUM_RARITIES.includes(rarity)) return;
  const price = premiumSetPrice(setId, rarity);
  if (!hasRes('souls', price)) { if (typeof showToast === 'function') showToast(t('👻 Недостаточно Душ для покупки.')); return; }
  spendRes('souls', price);
  Object.keys(set.pieces).forEach((slot) => {
    const item = makeSetItem(setId, slot, rarity);
    item.durability = [1000, 1000];
    addItem(item);
  });
  pushLog('🛒 Куплен сет «{set}» за {souls} 👻.', { set: L(set.name), souls: price });
  saveGame();
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
  if (!hasRes('gold', bet)) { tavernResult = L('🪙 Недостаточно золота для ставки.'); render(); return; }
  spendRes('gold', bet);
  const me = rnd(1, 6) + rnd(1, 6);
  const house = rnd(1, 6) + rnd(1, 6);
  let net;
  if (me > house) { addRes('gold', bet * 2); net = bet; tavernResult = tp('🎲 Ты {me} против {house} — победа! +{bet} 🪙', {me, house, bet}); }
  else if (me === house) { addRes('gold', bet); net = 0; tavernResult = tp('🎲 Ничья {me}:{house} — ставка возвращена.', {me, house}); }
  else { net = -bet; tavernResult = tp('🎲 Ты {me} против {house} — проигрыш. −{bet} 🪙', {me, house, bet}); }
  _tavernBank(net);
  pushLog(tavernResult);
  checkQuests();
  render();
}

// Напёрстки: выбери 1 из 3, шарик под случайным. Угадал — выигрыш ×3.
function playThimbles(pick, bet) {
  if (!hasRes('gold', bet)) { tavernResult = L('🪙 Недостаточно золота для ставки.'); render(); return; }
  spendRes('gold', bet);
  const ball = rnd(0, 2);
  let net;
  if (pick === ball) { addRes('gold', bet * 3); net = bet * 2; tavernResult = tp('🥤 Шарик под №{n} — угадал! +{win} 🪙', {n:ball + 1, win:bet * 2}); }
  else { net = -bet; tavernResult = tp('🥤 Шарик был под №{ball}, ты выбрал №{pick}. −{bet} 🪙', {ball:ball + 1, pick:pick + 1, bet}); }
  _tavernBank(net);
  pushLog(tavernResult);
  checkQuests();
  render();
}

// Лотерея: билет за фикс. цену, взвешенная таблица призов (вкл. редкую Душу).
const LOTTERY_PRICE = 50;
function playLottery() {
  if (!hasRes('gold', LOTTERY_PRICE)) { tavernResult = tp('🪙 Билет стоит {price} золота.', {price:LOTTERY_PRICE}); render(); return; }
  spendRes('gold', LOTTERY_PRICE);
  const roll = Math.random() * 100;
  let net = -LOTTERY_PRICE;
  if (roll < 55) { tavernResult = L('🎟️ Пусто. Удача отвернулась.'); }
  else if (roll < 80) { addRes('gold', 50); net += 50; tavernResult = L('🎟️ Мелкий выигрыш: +50 🪙'); }
  else if (roll < 94) { addRes('gold', 150); net += 150; tavernResult = L('🎟️ Неплохо: +150 🪙'); }
  else if (roll < 98.5) { addRes('sparks', 200); tavernResult = L('🎟️ Джекпот искр: +200 🔥'); }
  else { addRes('souls', 1); tavernResult = L('🎟️ 💎 СУПЕРПРИЗ: +1 Душа!'); }
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
// Лимит офлайн-накопления растёт с уровнем Города (+2 ч за уровень).
function lowerCapHours() {
  return LOWER_CAP_BASE + (player.lowerWorld.buildings.city || 0) * 2;
}
// Сколько часов накоплено с последнего сбора (с динамическим потолком).
function lowerElapsedHours() {
  const last = player.lowerWorld.lastCollect || Date.now();
  return Math.min(lowerCapHours(), Math.max(0, (Date.now() - last) / 3600000));
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
  pushLog('🏘️ Собран урожай нижнего мира: {str}.', {str});
  if (typeof showToast === 'function') showToast(tp('🏘️ Собрано: {str}', {str}));
  checkQuests();
  render();
}
// Стоимость постройки/улучшения (золото, квадратичный рост по целевому уровню).
function upgradeLowerCost(key) {
  const lvl = player.lowerWorld.buildings[key] || 0;
  return 150 * (lvl + 1) * (lvl + 1);
}
// Длительность стройки целевого уровня. Якорь: ур.10 ≈ 2 дня, мягкий старт.
// ур.1 ~1 мин · ур.3 ~6 мин · ур.5 ~34 мин · ур.7 ~3.4 ч · ур.10 ~2 дня.
function lowerBuildSeconds(targetLvl) {
  return Math.round(60 * Math.pow(2.423, targetLvl - 1));
}
// Завершить готовую стройку (вызывается из recalc и тикера).
function lowerTick() {
  const c = player.lowerWorld && player.lowerWorld.construction;
  if (!c) return false;
  // пересчёт под актуальную формулу: если вшитый таймер длиннее нового — укорачиваем
  // (только вниз, чтобы не отменять ускорение за Души)
  const expected = (c.startAt || Date.now()) + lowerBuildSeconds(c.targetLvl) * 1000;
  if (c.finishAt > expected) c.finishAt = expected;
  if (Date.now() >= c.finishAt) {
    player.lowerWorld.buildings[c.key] = c.targetLvl;
    player.lowerWorld.construction = null;
    pushLog('🏗️ {b} достроен до уровня {lvl}!', {b:L(LOWER_BUILDINGS[c.key].name), lvl:c.targetLvl});
    if (typeof showToast === 'function') showToast(tp('🏗️ {b} ур.{lvl} готов!', {b:L(LOWER_BUILDINGS[c.key].name), lvl:c.targetLvl}));
    return true;
  }
  return false;
}
// Можно ли начать стройку постройки key: вернёт {ok} или {ok:false, why}.
function canBuildLower(key) {
  if (!LOWER_BUILDINGS[key]) return { ok: false, why: 'нет такой постройки' };
  if ((player.xpLevel || 1) < LOWER_BUILD_LEVEL) return { ok: false, why: `стройка с ${LOWER_BUILD_LEVEL} ур. героя` };
  if (player.lowerWorld.construction) return { ok: false, why: 'стройка уже идёт' };
  const target = (player.lowerWorld.buildings[key] || 0) + 1;
  const cityLvl = player.lowerWorld.buildings.city || 0;
  if (key !== 'city' && target > cityLvl) return { ok: false, why: `нужен Город ур. ${target}` };
  if (!hasRes('gold', upgradeLowerCost(key))) return { ok: false, why: 'мало золота' };
  return { ok: true };
}
function startLowerBuild(key) {
  const chk = canBuildLower(key);
  if (!chk.ok) { pushLog('🏗️ Нельзя строить: {why}.', {why:chk.why}); render(); return; }
  const cost = upgradeLowerCost(key);
  const target = (player.lowerWorld.buildings[key] || 0) + 1;
  // фиксируем накопленный урожай, чтобы не потерять при смене состояния
  const pending = lowerPending();
  Object.entries(pending).forEach(([res, qty]) => addRes(res, qty));
  if (Object.keys(pending).length) player.lowerWorld.lastCollect = Date.now();
  spendRes('gold', cost);
  const dur = lowerBuildSeconds(target) * 1000;
  player.lowerWorld.construction = { key, targetLvl: target, startAt: Date.now(), finishAt: Date.now() + dur };
  pushLog('🏗️ Начата стройка: {b} → ур. {lvl} ({dur}). Списано {cost} 🪙.', {b:L(LOWER_BUILDINGS[key].name), lvl:target, dur:fmtDuration(dur / 1000), cost});
  saveGame();
  render();
}
// Ускорить текущую стройку за Души (премиум).
function lowerRushCost() {
  const c = player.lowerWorld.construction;
  if (!c) return 0;
  const remain = Math.max(0, c.finishAt - Date.now()) / 3600000; // часов
  return Math.max(1, Math.ceil(remain / 4)); // 1 Душа за каждые 4 ч остатка
}
function rushLowerBuild() {
  const c = player.lowerWorld.construction;
  if (!c) return;
  const cost = lowerRushCost();
  if (!hasRes('souls', cost)) { pushLog('👻 Нужно {cost} Душ для ускорения.', {cost}); render(); return; }
  spendRes('souls', cost);
  c.finishAt = Date.now();
  lowerTick();
  saveGame();
  render();
}
// Человекочитаемая длительность в секундах.
function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}${t('д')} ${h}${t('ч')}`;
  if (h) return `${h}${t('ч')} ${m}${t('м')}`;
  if (m) return `${m}${t('м')} ${s}${t('с')}`;
  return `${s}${t('с')}`;
}

// --- Походы: выбор мира → локации → бой ---
function startExpedition(worldIdx, locIdx, difficulty) {
  if (!worldUnlocked(player, worldIdx)) { pushLog('🔒 Этот мир ещё закрыт — нужен уровень и зачистка предыдущего мира.'); render(); return; }
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
