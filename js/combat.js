/*
 * Боевой движок «Вавилон». Бой пораундовый (раздел «Арена» GDD):
 * у героя две руки — он может атаковать в зону и ставить блок в зону.
 * Доступны заклинания и эликсиры. Статы растут от действий в бою.
 */

const ZONES = ['голова', 'торс', 'левая рука', 'правая рука', 'ноги'];
// Какой слот брони прикрывает зону попадания (упрощённо под 7-слотовую систему).
function zoneSlot(zone) {
  if (zone === 'голова') return 'head';
  if (zone === 'торс' || zone === 'ноги') return 'body';
  return 'shield'; // руки
}

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
  clog('⚔️ Бой начался: {mobs}', {mobs: combat.mobs.map((m) => t(m.name)).join(', ')});
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
      timerEl.textContent = `⏱ ${combat.turnTimeLeft} ${t('сек')}`;
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

function clog(template, vars) {
  if (!combat) return;
  let s = (typeof t === 'function') ? t(template) : template;
  if (vars) s = s.replace(/\{(\w+)\}/g, (mm, k) => (vars[k] != null ? vars[k] : ''));
  combat.logLines.unshift(s);
}
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
    clog('🌀 {name} уклонился от удара (в {zone}).', {name:t(mob.name), zone:t(targetZone)});
    finishRound();
    return;
  }

  let isMax = chance(d.maxDmgChance);
  let dmg = isMax ? d.dmgMax : rnd(d.dmgMin, d.dmgMax);
  let crit = chance(d.physCrit);
  if (crit) dmg *= 2;
  dmg = Math.max(1, dmg - mob.armor);

  mob.hp -= dmg;
  clog('🗡️ Удар по «{name}» в {zone}: −{dmg} HP{crit}{max}.', {name:t(mob.name), zone:t(targetZone), dmg, crit:crit?' ⚡CRIT':'', max:isMax?' 🎯max':''});

  // рост статов: сила — от нанесённого урона
  trainStat('str', dmg);
  trainSkill(weaponSkillFor(player.equip.weapon), 1); // навык владения оружием — от ударов
  damageItem(player.equip.weapon, 1);                 // износ оружия
  if (crit) trainStat('fur', 1);
  if (isMax) trainStat('luk', 1);

  if (mob.hp <= 0) { clog('💀 «{name}» повержен!', {name:t(mob.name)}); }
  finishRound();
}

function playerCast(spellId, targetZone) {
  if (combat.over) return;
  if (combat.castUsed) { clog('🧙 Уже применили заклинание в этот ход.'); if (typeof renderCombat === 'function') renderCombat(); return; }
  clearTurnTimer();
  combat.castUsed = true;
  const spell = SPELLS.find((s) => s.id === spellId);
  if (!spell) return;
  // улучшение заклинания (Гильдия магов): +20% эффекта и −5% маны за уровень
  const splus = (player.spellPlus && player.spellPlus[spellId]) || 0;
  const cost = Math.max(1, Math.round(spell.cost * (1 - 0.05 * splus)));
  if (player.mp < cost) { clog('💧 Недостаточно маны.'); return; }
  player.mp -= cost;
  trainStat('int', cost);                // интеллект растёт от потраченной маны
  trainElement(spell.element, spell.dir, 1);

  applyDots();
  if (combat.over) return;

  const mob = curMob();
  // бонус стихии с потолком и убыванием — чтобы магия не разгонялась бесконечно
  const elLvl = player.elements[spell.element] || 0;
  const elBonus = 1 + Math.min(elLvl, 40) * 0.03; // максимум +120%
  const pf = 1 + splus * 0.2; // бонус улучшения заклинания
  const mult = player.derived.spellMult * elBonus * pf;
  const e = spell.eff;
  let magCrit = chance(player.derived.magCrit);

  if (e.heal) {
    const h = Math.round(e.heal * mult * (magCrit ? 2 : 1));
    player.hp = Math.min(player.maxHp, player.hp + h);
    clog('💚 {spell}: +{h} HP{crit}.', {spell:t(spell.name), h, crit:magCrit?' ⚡':''});
    if (magCrit) trainStat('fai', 1);
  }
  if (e.dmg && mob) {
    let dmg = Math.round(e.dmg * mult * (magCrit ? 2 : 1));
    mob.hp -= dmg;
    clog('✨ {spell} по «{name}»: −{dmg} HP{crit}.', {spell:t(spell.name), name:t(mob.name), dmg, crit:magCrit?' ⚡':''});
    if (magCrit) trainStat('fai', 1);
    if (mob.hp <= 0) clog('💀 «{name}» повержен магией!', {name:t(mob.name)});
  }
  if (e.aoe && e.dmg) {
    aliveMobs().forEach((m) => { if (m !== mob) { const dd = Math.round(e.dmg * mult); m.hp -= dd; clog('💥 {name}: −{dmg} HP.', {name:t(m.name), dmg:dd}); } });
  }
  if (e.dot && mob) { const dv = Math.round(e.dot * pf) || e.dot; mob.effects.push({ type:'dot', val:dv, rounds:e.rounds, name:'яд' }); clog('☠️ «{name}» отравлен.', {name:t(mob.name)}); }
  if (e.defBuff) { const v = Math.round(e.defBuff * pf); combat.pBuffs.push({ type:'def', val:v, rounds:e.rounds }); clog('🛡️ {spell}: +{v} защиты на {r} р.', {spell:t(spell.name), v, r:e.rounds}); }
  if (e.defDebuff && mob) { const v = Math.round(e.defDebuff * pf); mob.effects.push({ type:'defDown', val:v, rounds:e.rounds }); clog('📉 У «{name}» −{v} защиты.', {name:t(mob.name), v}); }
  if (e.stun && mob) { if (chance(e.stun * 100)) { mob.effects.push({ type:'stun', rounds:e.rounds }); clog('🕳️ «{name}» в яме — пропустит ход.', {name:t(mob.name)}); } else clog('«Яма» не сработала.'); }
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
  const conc = it.conc || 10;
  const cfac = 1 + (conc - 10) * 0.03; // концентрация усиливает эффект: +3% за пункт сверх 10
  if (u.heal) { const h = Math.round(u.heal * cfac); player.hp = Math.min(player.maxHp, player.hp + h); clog('🧴 {item}: +{h} HP.', {item:t(it.name), h}); }
  if (u.mana) { const m = Math.round(u.mana * cfac); player.mp = Math.min(player.maxMp, player.mp + m); clog('🧴 {item}: +{m} MP.', {item:t(it.name), m}); }
  if (u.throwDmg) { const mob = curMob(); if (mob) { const dd = Math.round(u.throwDmg * cfac); mob.hp -= dd; clog('🍶 {item} в «{name}»: −{dmg} HP.', {item:t(it.name), name:t(mob.name), dmg:dd}); if (mob.hp <= 0) clog('💀 «{name}» повержен!', {name:t(mob.name)}); } }
  if (u.cure === 'poison') {
    const had = combat.pBuffs.some((b) => b.type === 'dot');
    combat.pBuffs = combat.pBuffs.filter((b) => b.type !== 'dot');
    clog(had ? '🧪 {item}: яд нейтрализован.' : '🧪 {item}: яда не было.', {item:t(it.name)});
  }
  if (u.silence) { const mob = curMob(); if (mob) { mob.effects.push({ type:'silence', rounds:u.silence }); clog('🤐 «{name}» онемел — не колдует {r} р.', {name:t(mob.name), r:u.silence}); } }
  if (u.stoneskin) {
    combat.pBuffs.push({ type:'def', val:conc, rounds:u.stoneskin });
    combat.pBuffs.push({ type:'magres', val:Math.round(conc / 2), rounds:u.stoneskin });
    clog('🪨 {item}: +{conc} защиты и маг. сопротивление на {r} р.', {item:t(it.name), conc, r:u.stoneskin});
  }
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
    m.effects.filter((e) => e.type === 'dot').forEach((e) => { m.hp -= e.val; clog('☠️ Яд: «{name}» −{v} HP.', {name:t(m.name), v:e.val}); });
  });
  // яд на игроке
  combat.pBuffs.filter((b) => b.type === 'dot').forEach((b) => { player.hp -= b.val; clog('☠️ Вы теряете {v} HP от яда.', {v:b.val}); });
  checkEnd();
}

// Приручённые питомцы бьют раз в раунд по текущей цели.
function petsAttack() {
  if (!player.pets || !player.pets.length) return;
  const active = player.pets.filter((p) => p.active).slice(0, activePetCap());
  active.forEach((p) => {
    if (combat.over) return;
    const mob = curMob() || aliveMobs()[0];
    if (!mob) return;
    const dmg = Math.max(1, rnd(p.dmgMin, p.dmgMax) - (mob.armor || 0));
    mob.hp -= dmg;
    clog('🐾 {pet} атакует «{name}»: −{dmg} HP.', {pet:p.name, name:t(mob.name), dmg});
    if (mob.hp <= 0) clog('💀 «{name}» повержен питомцем!', {name:t(mob.name)});
  });
  checkEnd();
}

// Приручить ослабленного не-босса.
function tameMob(idx) {
  if (combat.over) return;
  const mob = combat.mobs[idx];
  if (!mob || mob.hp <= 0) return;
  if (mob.isBoss) { clog('🐾 Босса не приручить.'); if (typeof renderCombat === 'function') renderCombat(); return; }
  if ((player.pets || []).length >= PETS_MAX) { clog('🐾 Предел питомцев ({max}).', {max:PETS_MAX}); if (typeof renderCombat === 'function') renderCombat(); return; }
  clearTurnTimer();
  const lvl = skillLevel('taming');
  const hpFrac = mob.hp / mob.maxHp;
  const ch = clamp(15 + lvl * 4 + (1 - hpFrac) * 40, 5, 90);
  trainSkill('taming', 1);
  if (chance(ch)) {
    if (!player.pets) player.pets = [];
    const name = String(mob.name).replace(' ⭐', '');
    const active = player.pets.filter((p) => p.active).length < activePetCap();
    player.pets.push({ id: ++_itemId, name, dmgMin: mob.dmg[0], dmgMax: mob.dmg[1], atk: mob.attack, active });
    trainSkill('taming', 2); // бонус навыка за успешную поимку
    clog('🐾 Вы приручили «{name}»!', {name:t(mob.name)});
    pushLog('🐾 Приручён питомец: {pet}{active}.', {pet:L(name), active:active ? (' ' + L('(в строю)')) : ''});
    mob.hp = 0; mob.tamed = true;
  } else {
    clog('🐾 «{name}» вырвался — приручение не удалось.', {name:t(mob.name)});
  }
  finishRound();
}

function finishRound() {
  if (combat.over) return;
  petsAttack();
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
    if (mob.effects.some((e) => e.type === 'stun')) { clog('💤 «{name}» пропускает ход.', {name:t(mob.name)}); return; }
    if (mob.isCaster && !mob.effects.some((e) => e.type === 'silence') && chance(40)) {
      const dmg = rnd(mob.dmg[0], mob.dmg[1]);
      player.hp -= Math.max(1, dmg - Math.round(d.ref * 0.3) - buffVal('magres'));
      clog('🔮 «{name}» бьёт заклинанием: −{dmg} HP.', {name:t(mob.name), dmg});
      if (chance(d.magCounter)) { const c = rnd(d.dmgMin, d.dmgMax); mob.hp -= c; clog('🔁 Маг. контрудар: −{c} HP по «{name}».', {c, name:t(mob.name)}); trainStat('ref', 1); }
      checkEnd(); return;
    }
    // физическая атака моба по случайной зоне
    const zone = ZONES[rnd(0, ZONES.length - 1)];
    const blocked = combat.pBlockZone === zone;
    const pDef = d.defense + buffVal('def');
    const hitChance = clamp(55 + (mob.attack - pDef) / 2 - (blocked ? 50 : 0), 5, 95);
    if (!chance(hitChance)) {
      clog('🛡️ Вы отбили удар «{name}» ({zone}).', {name:t(mob.name), zone:t(zone)});
      trainStat('agi', 1);                     // ловкость растёт от уклонений
      // контрудар
      if (chance(d.physCounter)) { const c = rnd(d.dmgMin, d.dmgMax); mob.hp -= c; clog('🔁 Контрудар: −{c} HP по «{name}».', {c, name:t(mob.name)}); trainStat('rea', 1); checkEnd(); }
      return;
    }
    // парирование: полностью гасит удар и возвращает половину своего урона
    if (chance(d.parry)) {
      const refl = Math.max(1, Math.round(rnd(d.dmgMin, d.dmgMax) / 2));
      mob.hp -= refl;
      clog('⚔️ Парирование удара «{name}»! Возврат −{refl} HP.', {name:t(mob.name), refl});
      trainSkill('parry', 1);
      damageItem(player.equip.weapon, 1); // парируем оружием — оно изнашивается
      checkEnd();
      return;
    }
    let dmg = rnd(mob.dmg[0], mob.dmg[1]);
    if (chance(mob.crit)) { dmg *= 2; clog('⚡ Враг наносит критический удар!'); }
    if (blocked) dmg = Math.round(dmg * 0.3);
    dmg = Math.max(1, dmg - d.armor);
    player.hp -= dmg;
    clog('🩸 «{name}» бьёт в {zone}: −{dmg} HP{blocked}.', {name:t(mob.name), zone:t(zone), dmg, blocked:blocked?' (block)':''});
    trainStat('end', dmg);                      // выносливость от полученного урона
    const aClass = dominantArmorClass();        // навык владения бронёй — от полученных ударов
    if (aClass) trainSkill(ARMOR_SKILL[aClass], 1);
    damageItem(player.equip[zoneSlot(zone)], 1); // износ брони по зоне попадания
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
  // Клановый рейд: урон по боссу из боя уходит в общий HP-пул на сервере.
  // Засчитывается даже при отступлении/поражении (что успел нанести).
  if (combat.ctx && combat.ctx.raid) {
    const boss = combat.mobs[0];
    const start = combat.ctx.bossStartHp || boss.maxHp;
    const dealt = Math.max(0, Math.round(start - Math.max(0, boss.hp)));
    combat.raidDamage = dealt;
    combat.raidKilled = boss.hp <= 0;
    if (!won && !fled) player.hp = Math.round(player.maxHp * 0.3); // мягкое поражение, без штрафа золота
    if (typeof onRaidCombatEnd === 'function') onRaidCombatEnd(dealt, combat.raidKilled);
    recalc(); saveGame();
    return;
  }
  if (fled) return;
  if (won) {
    rollLoot();
    player.counters.kills += combat.mobs.length;
    const bossCount = combat.mobs.filter((m) => m.isBoss).length;
    if (bossCount > 0) {
      if (!player.counters.bossKills) player.counters.bossKills = 0;
      player.counters.bossKills += bossCount;
    }
    // прогресс открытия миров: отмечаем побеждённых мобов (только в походах)
    if (combat.ctx && combat.ctx.worldIndex != null) {
      if (!Array.isArray(player.defeatedMobs)) player.defeatedMobs = [];
      combat.mobs.forEach((m) => {
        const nm = String(m.name).replace(' ⭐', '');
        if (!player.defeatedMobs.includes(nm)) player.defeatedMobs.push(nm);
      });
    }
    pushLog('🏆 Победа над: {mobs}.', {mobs:combat.mobs.map((m) => L(m.name)).join(', ')});
  } else {
    player.hp = Math.round(player.maxHp * 0.3); // не умираем насовсем — теряем часть добра
    const lost = Math.floor((player.resources.gold || 0) * 0.1); // штраф: 10% золота
    if (lost > 0) { spendRes('gold', lost); clog('💸 Поражение! Вы обронили {lost} золота и вернулись ослабленным.', {lost}); }
    else clog('☠️ Поражение! Вы возвращаетесь в башню ослабленным.');
    pushLog('☠️ Поражение в бою{lost}.', {lost:lost > 0 ? (' (−' + lost + ' ' + L('золота') + ')') : ''});
  }
  recalc();
  saveGame();
}

function rollLoot() {
  const tier = Math.max(...combat.mobs.map((m) => m.worldTier || 1));
  const bosses = combat.mobs.filter((m) => m.isBoss).length;
  // клановые бонусы (если в клане): Сокровищница +%золота, Алтарь +%опыта, Кузня +трофеи
  const vault = typeof clanPerk === 'function' ? clanPerk('vault') : 0;
  const altar = typeof clanPerk === 'function' ? clanPerk('altar') : 0;
  const forge = typeof clanPerk === 'function' ? clanPerk('forge') : 0;
  let gold = combat.mobs.reduce((a, m) => a + rnd(5, 10) * (m.worldTier || 1) * (m.isBoss ? 3 : 1), 0);
  gold = Math.round(gold * (1 + vault * 0.05));
  // Искры — главный «энергетический» дроп верхнего мира; чем глубже тир локации,
  // тем активнее они сыплются (нижний мир и прочее искр не дают).
  const sparks = combat.mobs.reduce((a, m) => a + (rnd(3, 8) + (m.worldTier || 1) * 2) * (m.isBoss ? 3 : 1), 0);
  addRes('gold', gold); addRes('sparks', sparks);
  combat.loot.gold = gold; combat.loot.sparks = sparks;
  // опыт за бой (классический уровень)
  let xp = combat.mobs.reduce((a, m) => a + (10 + (m.worldTier || 1) * 5) * (m.isBoss ? 3 : 1), 0);
  xp = Math.round(xp * (1 + altar * 0.05));
  combat.loot.xp = xp;
  gainXp(xp);
  // Камни (gem) добываются в верхнем мире и растут с глубиной тира + Кузня клана.
  const gemDrops = rnd(0, 1) + Math.floor(tier / 2) + bosses + forge;
  if (gemDrops > 0) { addRes('gem', gemDrops); combat.loot.res.gem = (combat.loot.res.gem || 0) + gemDrops; }
  // ресурсы-трофеи (с учётом удачи); миры 7+ дают ресурсы 3 уровня
  const tier3Pool = ['dragonScale','soulGem','starCrystal','hellSteel','arcaneEssence'];
  const basePool = ['thinHide','thickHide','bone','herb','mushroom','ore','stone','gem','mica','sand'];
  const pool = tier >= 7 ? [...tier3Pool, ...basePool] : basePool;
  const drops = 1 + Math.floor(player.derived.lootBonus / 50) + bosses + forge;
  for (let i = 0; i < drops + tier; i++) {
    const r = pool[rnd(0, pool.length - 1)];
    const q = rnd(1, 3);
    addRes(r, q);
    combat.loot.res[r] = (combat.loot.res[r] || 0) + q;
  }
  // изредка — формула нового заклинания
  if (chance(8 + player.derived.lootBonus / 10)) {
    const unknown = SPELLS.filter((s) => !player.spells.includes(s.id));
    if (unknown.length) { const s = unknown[rnd(0, unknown.length - 1)]; player.spells.push(s.id); combat.loot.spell = s.name; clog('📜 Получена формула заклинания «{spell}»!', {spell:t(s.name)}); }
  }
  // обычные схемы снаряжения (оружие/броня/бижутерия) — падают в любых мирах,
  // чтобы прогрессия одевания не упиралась только в прокачку профессий
  const stdRecipes = RECIPES.filter((x) => x.out.item && (x.sparks || 0) < 300).map((x) => x.id);
  if (chance(18 + player.derived.lootBonus / 10)) {
    const unknownStd = stdRecipes.filter((id) => !player.knownRecipes.includes(id));
    if (unknownStd.length) {
      const id = unknownStd[rnd(0, unknownStd.length - 1)];
      player.knownRecipes.push(id);
      const rec = RECIPES.find((x) => x.id === id);
      combat.loot.recipe = rec ? rec.name : id;
      clog('📜 Найдена схема «{rec}»!', {rec:t(rec ? rec.name : id)});
    }
  }
  // изредка — готовая вещь-трофей (снаряжение со слотом)
  if (chance(10 + player.derived.lootBonus / 10)) {
    const wearable = RECIPES.filter((x) => x.out.item && x.out.item.slot && (x.sparks || 0) < 300);
    const rec = wearable[rnd(0, wearable.length - 1)];
    if (rec) {
      const item = JSON.parse(JSON.stringify(rec.out.item));
      item.durability = [1000, 1000];
      addItem(item);
      combat.loot.item = item.name;
      clog('🎁 Трофей: {item}!', {item:t(item.name)});
    }
  }
  // части классовых сетов: падают по достижении minTier мира,
  // рарность тем выше, чем выше уровень героя и сложность похода (200% — самые редкие)
  if (chance(15 + player.derived.lootBonus / 10)) {
    const eligible = Object.keys(GEAR_SETS).filter((id) => tier >= (GEAR_SETS[id].minTier || 1));
    if (eligible.length) {
      const setId = eligible[rnd(0, eligible.length - 1)];
      const slots = Object.keys(GEAR_SETS[setId].pieces);
      const slot = slots[rnd(0, slots.length - 1)];
      const difficulty = (combat.ctx && combat.ctx.difficulty) || 100;
      const rk = rollRarity(player.xpLevel || 1, difficulty);
      const item = makeSetItem(setId, slot, rk);
      addItem(item);
      combat.loot.item = item.name;
      clog('🎁 Трофей сета «{set}»: {item} [{rar}]!', {set:t(GEAR_SETS[setId].name), item:t(item.name), rar:t(RARITIES[rk].name)});
    }
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
      clog('📜 Схема легендарного предмета «{rec}» получена!', {rec:t(rec ? rec.name : id)});
    }
  }
}

// Ролл рарности предмета: чем выше уровень и сложность, тем больше шанс топ-рарности.
function rollRarity(level, difficulty) {
  const diffFactor = clamp((difficulty - 75) / 125, 0, 1); // 75%→0, 200%→1
  const lvlFactor = clamp((level || 1) / 60, 0, 1);
  const t = 0.6 * diffFactor + 0.4 * lvlFactor; // 0..1 — общий «буст редкости»
  const weights = RARITY_ORDER.map((k, i) => RARITIES[k].weight * Math.pow(1 + t * 4, i));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < RARITY_ORDER.length; i++) { r -= weights[i]; if (r <= 0) return RARITY_ORDER[i]; }
  return 'common';
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
