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
  addRes(res, qty);
  player.counters.gathered += qty;
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
  if (r.out.res) {
    addRes(r.out.res, r.out.qty || 1);
    pushLog(`🔧 Создано: ${r.out.qty || 1}× ${RESOURCES[r.out.res].name}.`);
  } else if (r.out.item) {
    const item = JSON.parse(JSON.stringify(r.out.item));
    if (item.armor) item.armor = Math.round(item.armor * quality);
    if (item.dmg) item.dmg = item.dmg.map((d) => Math.round(d * quality));
    item.durability = [1000, 1000];
    addItem(item);
    pushLog(`🔧 Создан предмет: ${item.name}${quality > 1 ? ' (закал. углём)' : ''}.`);
  }
  player.counters.crafted += 1;
  checkQuests();
  render();
}

// --- Экипировка ---
function equipItem(itemId) {
  const it = player.inventory.find((x) => x.id === itemId);
  if (!it || !it.slot) return;
  // проверка требований по статам
  if (it.req) {
    for (const [k, v] of Object.entries(it.req)) {
      if (player.stats[k].val < v) { pushLog(`❌ Требуется ${STATS[k].name} ${v} для «${it.name}».`); render(); return; }
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

// --- Банк (монетизация GDD: Души → Золото / Искры) ---
function exchangeSouls(kind) {
  if (!hasRes('souls', 1)) { pushLog('👻 Нет Душ для обмена.'); render(); return; }
  spendRes('souls', 1);
  if (kind === 'gold') { addRes('gold', 1000); pushLog('🏛️ 1 Душа → 1000 Золота.'); }
  else { addRes('sparks', 1000); pushLog('🏛️ 1 Душа → 1000 Искр.'); }
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
