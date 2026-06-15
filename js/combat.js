/*
 * Боевой движок «Вавилон». Бой пораундовый (раздел «Арена» GDD):
 * у героя две руки — он может атаковать в зону и ставить блок в зону.
 * Доступны заклинания и эликсиры. Статы растут от действий в бою.
 */

const ZONES = ['голова', 'торс', 'левая рука', 'правая рука', 'ноги'];

let combat = null; // активный бой или null
let _turnInterval = null;

function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function chance(p) { return Math.random() * 100 < p; }

// --- Генерация моба из мира/имени ---
function genMob(worldTier, name, difficulty) {
  // сравнение регистронезависимое: в названиях «дракон» со строчной буквы
  const lname = name.toLowerCase();
  const isBoss = BOSS_WORDS.some((w) => lname.includes(w.toLowerCase()));
  const isCaster = CASTER_WORDS.some((w) => lname.includes(w.toLowerCase()));
  const isRanged = RANGED_WORDS.some((w) => lname.includes(w.toLowerCase()));
  const diffMult = difficulty / 100; // 0.75 .. 2.0
  const base = 6 + worldTier * 4;
  const bossMult = isBoss ? 2.2 : 1;
  const hp = Math.round((28 + worldTier * 16) * diffMult * bossMult);
  return {
    name: name + (isBoss ? ' ⭐' : ''),
    isBoss, isCaster, isRanged,
    worldTier,
    maxHp: hp, hp,
    attack: Math.round((10 + base) * diffMult),
    defense: Math.round((4 + worldTier * 2) * diffMult),
    armor: Math.round(worldTier * diffMult),
    dmg: [Math.round((3 + worldTier * 1.4) * diffMult * bossMult), Math.round((7 + worldTier * 2.8) * diffMult * bossMult)],
    crit: Math.min(60, 5 + worldTier * 2),
    effects: [],     // активные эффекты на мобе
    blockZone: null,
  };
}

// --- Старт боя ---
function startCombat(mobs, ctx) {
  clearTurnTimer();
  applyRegen();
  const mobArr = Array.isArray(mobs) ? mobs : [mobs];
  combat = {
    mobs: mobArr,
    target: 0,
    round: 1,
    ctx: ctx || {},
    pBuffs: [],
    pBlockZone: null,
    over: false,
    won: false,
    castUsed: false,
    turnSecs: mobArr.length > 1 ? 60 : 30,
    turnTimeLeft: 0,
    logLines: [],
    loot: { gold: 0, sparks: 0, res: {}, items: [] },
  };
  clog(`⚔️ Бой начался: ${combat.mobs.map((m) => m.name).join(', ')}`);
  startTurnTimer();
  return combat;
}

function startTurnTimer() {
  clearTurnTimer();
  if (!combat || combat.over) return;
  combat.turnTimeLeft = combat.turnSecs;
  _turnInterval = setInterval(() => {
    if (!combat || combat.over) { clearTurnTimer(); return; }
    combat.turnTimeLeft = Math.max(0, combat.turnTimeLeft - 1);
    // Обновляем только элемент таймера, не перестраивая весь DOM
    const timerEl = document.querySelector('.turn-timer');
    if (timerEl) {
      timerEl.textContent = `⏱ ${combat.turnTimeLeft} сек`;
      timerEl.className = 'turn-timer' + (combat.turnTimeLeft <= 10 ? ' urgent' : '');
    }
    if (combat.turnTimeLeft <= 0) {
      clearTurnTimer();
      clog('⏰ Время хода истекло! Враги атакуют.');
      finishRound();
      if (combat && !combat.over) startTurnTimer();
      if (typeof renderCombat === 'function') renderCombat();
    }
  }, 1000);
}

function clearTurnTimer() {
  clearInterval(_turnInterval);
  _turnInterval = null;
}

function clog(msg) { if (combat) combat.logLines.unshift(msg); }
function aliveMobs() { return combat.mobs.filter((m) => m.hp > 0); }
function curMob() {
  if (combat.mobs[combat.target] && combat.mobs[combat.target].hp > 0) return combat.mobs[combat.target];
  return aliveMobs()[0];
}

// === Действия игрока. Каждое завершает раунд и вызывает ход мобов. ===
function playerAttack(targetZone, blockZone) {
  if (combat.over) return;
  clearTurnTimer();
  const mob = curMob();
  if (!mob) return;
  combat.pBlockZone = blockZone;
  const d = player.derived;

  applyDots();
  if (combat.over) return;

  // расчёт попадания: уклонение моба зависит от его защиты
  const hitChance = clamp(60 + (d.attack - mob.defense) / 2, 10, 95);
  if (!chance(hitChance)) {
    clog(`🌀 ${mob.name} уклонился от удара (в ${targetZone}).`);
    finishRound();
    return;
  }

  let isMax = chance(d.maxDmgChance);
  let dmg = isMax ? d.dmgMax : rnd(d.dmgMin, d.dmgMax);
  let crit = chance(d.physCrit);
  if (crit) dmg *= 2;
  dmg = Math.max(1, dmg - mob.armor);

  mob.hp -= dmg;
  clog(`🗡️ Удар по «${mob.name}» в ${targetZone}: −${dmg} HP${crit ? ' ⚡КРИТ' : ''}${isMax ? ' 🎯макс' : ''}.`);

  // рост статов: сила — от нанесённого урона
  trainStat('str', dmg);
  if (crit) trainStat('fur', 1);
  if (isMax) trainStat('luk', 1);

  if (mob.hp <= 0) { clog(`💀 «${mob.name}» повержен!`); }
  finishRound();
}

function playerCast(spellId, targetZone) {
  if (combat.over) return;
  if (combat.castUsed) { clog('🧙 Уже применили заклинание в этот ход.'); if (typeof renderCombat === 'function') renderCombat(); return; }
  clearTurnTimer();
  combat.castUsed = true;
  const spell = SPELLS.find((s) => s.id === spellId);
  if (!spell) return;
  if (player.mp < spell.cost) { clog('💧 Недостаточно маны.'); return; }
  player.mp -= spell.cost;
  trainStat('int', spell.cost);          // интеллект растёт от потраченной маны
  trainElement(spell.element, spell.dir, 1);

  applyDots();
  if (combat.over) return;

  const mob = curMob();
  // бонус стихии с потолком и убыванием — чтобы магия не разгонялась бесконечно
  const elLvl = player.elements[spell.element] || 0;
  const elBonus = 1 + Math.min(elLvl, 40) * 0.03; // максимум +120%
  const mult = player.derived.spellMult * elBonus;
  const e = spell.eff;
  let magCrit = chance(player.derived.magCrit);

  if (e.heal) {
    const h = Math.round(e.heal * mult * (magCrit ? 2 : 1));
    player.hp = Math.min(player.maxHp, player.hp + h);
    clog(`💚 ${spell.name}: +${h} HP${magCrit ? ' ⚡' : ''}.`);
    if (magCrit) trainStat('fai', 1);
  }
  if (e.dmg && mob) {
    let dmg = Math.round(e.dmg * mult * (magCrit ? 2 : 1));
    mob.hp -= dmg;
    clog(`✨ ${spell.name} по «${mob.name}»: −${dmg} HP${magCrit ? ' ⚡' : ''}.`);
    if (magCrit) trainStat('fai', 1);
    if (mob.hp <= 0) clog(`💀 «${mob.name}» повержен магией!`);
  }
  if (e.aoe && e.dmg) {
    aliveMobs().forEach((m) => { if (m !== mob) { const dd = Math.round(e.dmg * mult); m.hp -= dd; clog(`💥 ${m.name}: −${dd} HP.`); } });
  }
  if (e.dot && mob) { mob.effects.push({ type:'dot', val:e.dot, rounds:e.rounds, name:'яд' }); clog(`☠️ «${mob.name}» отравлен.`); }
  if (e.defBuff) { combat.pBuffs.push({ type:'def', val:e.defBuff, rounds:e.rounds }); clog(`🛡️ ${spell.name}: +${e.defBuff} защиты на ${e.rounds} р.`); }
  if (e.defDebuff && mob) { mob.effects.push({ type:'defDown', val:e.defDebuff, rounds:e.rounds }); clog(`📉 У «${mob.name}» −${e.defDebuff} защиты.`); }
  if (e.stun && mob) { if (chance(e.stun * 100)) { mob.effects.push({ type:'stun', rounds:e.rounds }); clog(`🕳️ «${mob.name}» в яме — пропустит ход.`); } else clog('«Яма» не сработала.'); }
  if (e.cure) { combat.pBuffs = combat.pBuffs.filter((b) => b.type !== 'dot'); clog('🧪 Эффекты яда сняты.'); }
  if (e.dispel) { combat.pBuffs = []; combat.mobs.forEach((m) => m.effects = m.effects.filter((x) => x.type === 'dot')); clog('🌬️ Щиты и бури сдуты.'); }

  finishRound();
}

function playerUseItem(itemId) {
  if (combat.over) return;
  clearTurnTimer();
  const it = player.inventory.find((x) => x.id === itemId);
  if (!it || !it.use) return;
  const u = it.use;
  if (u.heal) { player.hp = Math.min(player.maxHp, player.hp + u.heal); clog(`🧴 ${it.name}: +${u.heal} HP.`); }
  if (u.mana) { player.mp = Math.min(player.maxMp, player.mp + u.mana); clog(`🧴 ${it.name}: +${u.mana} MP.`); }
  if (u.throwDmg) { const mob = curMob(); if (mob) { mob.hp -= u.throwDmg; clog(`🍶 ${it.name} в «${mob.name}»: −${u.throwDmg} HP.`); if (mob.hp <= 0) clog(`💀 «${mob.name}» повержен!`); } }
  consumeItem(it);
  finishRound();
}

function consumeItem(it) {
  if (it.qty && it.qty > 1) it.qty -= 1;
  else player.inventory = player.inventory.filter((x) => x.id !== it.id);
}

function playerFlee() {
  if (combat.over) return;
  clearTurnTimer();
  if (chance(40 + player.derived.agi)) { clog('🏃 Вы сбежали из боя.'); endCombat(false, true); }
  else { clog('Сбежать не удалось!'); finishRound(); }
}

// === Внутренняя логика раунда ===
function applyDots() {
  // яд на мобах
  combat.mobs.forEach((m) => {
    m.effects.filter((e) => e.type === 'dot').forEach((e) => { m.hp -= e.val; clog(`☠️ Яд: «${m.name}» −${e.val} HP.`); });
  });
  // яд на игроке
  combat.pBuffs.filter((b) => b.type === 'dot').forEach((b) => { player.hp -= b.val; clog(`☠️ Вы теряете ${b.val} HP от яда.`); });
  checkEnd();
}

function finishRound() {
  if (combat.over) return;
  if (!aliveMobs().length) { endCombat(true); return; }
  mobsTurn();
  if (combat.over) return;
  tickEffects();
  combat.round += 1;
  combat.castUsed = false;
  player.hp = Math.round(player.hp); player.mp = Math.round(player.mp);
  checkEnd();
  if (combat && !combat.over) startTurnTimer();
  saveGame();
}

function mobsTurn() {
  const d = player.derived;
  aliveMobs().forEach((mob) => {
    if (mob.effects.some((e) => e.type === 'stun')) { clog(`💤 «${mob.name}» пропускает ход.`); return; }
    if (mob.isCaster && chance(40)) {
      const dmg = rnd(mob.dmg[0], mob.dmg[1]);
      player.hp -= Math.max(1, dmg - Math.round(d.ref * 0.3));
      clog(`🔮 «${mob.name}» бьёт заклинанием: −${dmg} HP.`);
      if (chance(d.magCounter)) { const c = rnd(d.dmgMin, d.dmgMax); mob.hp -= c; clog(`🔁 Маг. контрудар: −${c} HP по «${mob.name}».`); trainStat('ref', 1); }
      checkEnd(); return;
    }
    // физическая атака моба по случайной зоне
    const zone = ZONES[rnd(0, ZONES.length - 1)];
    const blocked = combat.pBlockZone === zone;
    const pDef = d.defense + buffVal('def');
    const hitChance = clamp(55 + (mob.attack - pDef) / 2 - (blocked ? 50 : 0), 5, 95);
    if (!chance(hitChance)) {
      clog(`🛡️ Вы отбили удар «${mob.name}» (${zone}).`);
      trainStat('agi', 1);                     // ловкость растёт от уклонений
      // контрудар
      if (chance(d.physCounter)) { const c = rnd(d.dmgMin, d.dmgMax); mob.hp -= c; clog(`🔁 Контрудар: −${c} HP по «${mob.name}».`); trainStat('rea', 1); checkEnd(); }
      return;
    }
    let dmg = rnd(mob.dmg[0], mob.dmg[1]);
    if (chance(mob.crit)) { dmg *= 2; clog('⚡ Враг наносит критический удар!'); }
    if (blocked) dmg = Math.round(dmg * 0.3);
    dmg = Math.max(1, dmg - d.armor);
    player.hp -= dmg;
    clog(`🩸 «${mob.name}» бьёт в ${zone}: −${dmg} HP${blocked ? ' (блок)' : ''}.`);
    trainStat('end', dmg);                      // выносливость от полученного урона
    checkEnd();
  });
}

function buffVal(type) { return combat.pBuffs.filter((b) => b.type === type).reduce((a, b) => a + b.val, 0); }

function tickEffects() {
  combat.pBuffs = combat.pBuffs.map((b) => ({ ...b, rounds: b.rounds - 1 })).filter((b) => b.rounds > 0);
  combat.mobs.forEach((m) => { m.effects = m.effects.map((e) => ({ ...e, rounds: e.rounds - 1 })).filter((e) => e.rounds > 0); });
  combat.pBlockZone = null;
}

function checkEnd() {
  if (combat.over) return;
  if (player.hp <= 0) { player.hp = 0; endCombat(false); }
  else if (!aliveMobs().length) { endCombat(true); }
}

function endCombat(won, fled) {
  clearTurnTimer();
  combat.over = true;
  combat.won = won;
  if (fled) return;
  if (won) {
    rollLoot();
    player.counters.kills += combat.mobs.length;
    const bossCount = combat.mobs.filter((m) => m.isBoss).length;
    if (bossCount > 0) {
      if (!player.counters.bossKills) player.counters.bossKills = 0;
      player.counters.bossKills += bossCount;
    }
    pushLog(`🏆 Победа над: ${combat.mobs.map((m) => m.name).join(', ')}.`);
  } else {
    player.hp = Math.round(player.maxHp * 0.3); // не умираем насовсем — теряем часть добра
    const lost = Math.floor((player.resources.gold || 0) * 0.1); // штраф: 10% золота
    if (lost > 0) { spendRes('gold', lost); clog(`💸 Поражение! Вы обронили ${lost} золота и вернулись ослабленным.`); }
    else clog('☠️ Поражение! Вы возвращаетесь в башню ослабленным.');
    pushLog(`☠️ Поражение в бою${lost > 0 ? ` (−${lost} золота)` : ''}.`);
  }
  recalc();
  saveGame();
}

function rollLoot() {
  const tier = Math.max(...combat.mobs.map((m) => m.worldTier || 1));
  const bosses = combat.mobs.filter((m) => m.isBoss).length;
  const gold = combat.mobs.reduce((a, m) => a + rnd(5, 10) * (m.worldTier || 1) * (m.isBoss ? 3 : 1), 0);
  const sparks = combat.mobs.reduce((a, m) => a + rnd(3, 8) * (m.isBoss ? 3 : 1), 0);
  addRes('gold', gold); addRes('sparks', sparks);
  combat.loot.gold = gold; combat.loot.sparks = sparks;
  // опыт за бой (классический уровень)
  const xp = combat.mobs.reduce((a, m) => a + (10 + (m.worldTier || 1) * 5) * (m.isBoss ? 3 : 1), 0);
  combat.loot.xp = xp;
  gainXp(xp);
  // ресурсы-трофеи (с учётом удачи); миры 7+ дают ресурсы 3 уровня
  const tier3Pool = ['dragonScale','soulGem','starCrystal','hellSteel','arcaneEssence'];
  const basePool = ['thinHide','thickHide','bone','herb','mushroom','ore','stone','gem','mica','sand'];
  const pool = tier >= 7 ? [...tier3Pool, ...basePool] : basePool;
  const drops = 1 + Math.floor(player.derived.lootBonus / 50) + bosses;
  for (let i = 0; i < drops + tier; i++) {
    const r = pool[rnd(0, pool.length - 1)];
    const q = rnd(1, 3);
    addRes(r, q);
    combat.loot.res[r] = (combat.loot.res[r] || 0) + q;
  }
  // изредка — формула нового заклинания
  if (chance(8 + player.derived.lootBonus / 10)) {
    const unknown = SPELLS.filter((s) => !player.spells.includes(s.id));
    if (unknown.length) { const s = unknown[rnd(0, unknown.length - 1)]; player.spells.push(s.id); combat.loot.spell = s.name; clog(`📜 Получена формула заклинания «${s.name}»!`); }
  }
  // с боссов в мирах 7+ — схемы легендарного снаряжения
  const legendIds = ['rune_blade','necro_staff','star_bow','hell_maul','dragon_armor','arcane_robe','shadow_helm','star_amulet','dragon_ring','hell_earring'];
  if (tier >= 7 && bosses > 0 && chance(20 + player.derived.lootBonus / 10)) {
    const unknownLeg = legendIds.filter((id) => !player.knownRecipes.includes(id));
    if (unknownLeg.length) {
      const id = unknownLeg[rnd(0, unknownLeg.length - 1)];
      player.knownRecipes.push(id);
      const rec = RECIPES.find((x) => x.id === id);
      combat.loot.recipe = rec ? rec.name : id;
      clog(`📜 Схема легендарного предмета «${rec ? rec.name : id}» получена!`);
    }
  }
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
