/*
 * Проект «Вавилон» — игровые данные.
 * Контент перенесён из Game Design Document:
 * статы, магия (4 стихии × 3 направления), 12 миров с локациями и мобами,
 * ресурсы (3 уровня + Золото/Души/Искры), рецепты крафта и квесты.
 */

// ----------------------------------------------------------------------------
// СТАТЫ (раздел «статы» GDD). Каждый стат растёт от использования по
// геометрической прогрессии 0/100 -> 0/200 -> 0/400 ...
// ----------------------------------------------------------------------------
const STATS = {
  str: { name: 'Сила',        grows: 'нанесённый урон',        desc: '+2% к урону оружия, +5 к переносимому весу. Нужна для оружия и брони.' },
  agi: { name: 'Ловкость',    grows: 'уклонения',              desc: '+1% к урону дальнего боя, +1 защита, +2 атака.' },
  end: { name: 'Выносливость',grows: 'полученный урон',        desc: '+5 здоровья, +1% урон ближнего/среднего боя, +1 реген HP/мин.' },
  int: { name: 'Интеллект',   grows: 'потраченная мана',       desc: '+5 маны, +1 реген MP/мин, +2% к силе заклинаний.' },
  fai: { name: 'Вера',        grows: 'магические криты',       desc: '+2% шанс магического крита, +1 реген MP/мин.' },
  fur: { name: 'Ярость',      grows: 'физические криты',       desc: '+2% шанс физического крита, +1 реген HP/мин.' },
  luk: { name: 'Удача',       grows: 'удачные удары',          desc: '+1% шанс макс. урона, +5% шанс ценного трофея.' },
  rea: { name: 'Реакция',     grows: 'физические контрудары',  desc: '+2% физический контрудар, +2% защита.' },
  ref: { name: 'Отражение',   grows: 'магические контрудары',  desc: '+2% магический контрудар, +2% сопротивление.' },
};
const STAT_ORDER = ['str','agi','end','int','fai','fur','luk','rea','ref'];

// ----------------------------------------------------------------------------
// МАГИЯ — 4 стихии × 3 направления = 12 базовых заклинаний (раздел «магия»).
// element: ветер|вода|огонь|земля ; dir: свет|тьма|сумрак
// ----------------------------------------------------------------------------
const ELEMENTS = ['ветер','вода','огонь','земля'];
const DIRS = ['свет','тьма','сумрак'];

const SPELLS = [
  { id:'air_shield', name:'Воздушный щит', element:'ветер', dir:'свет',   cost:2,  kind:'buff',
    desc:'Смерч вокруг цели: +20 защиты на 1 раунд.', eff:{ defBuff:20, rounds:1 } },
  { id:'sandstorm',  name:'Песчаная буря', element:'ветер', dir:'тьма',   cost:2,  kind:'debuff',
    desc:'Засыпает врагу глаза: -20 защиты на 1 раунд.', eff:{ defDebuff:20, rounds:1 } },
  { id:'rage_wind',  name:'Яростный ветер',element:'ветер', dir:'сумрак', cost:20, kind:'dispel',
    desc:'Сдувает все щиты и бури с поля боя.', eff:{ dispel:true } },
  { id:'small_heal', name:'Малое лечение', element:'вода',  dir:'свет',   cost:2,  kind:'heal',
    desc:'Лечит 10 HP цели.', eff:{ heal:10 } },
  { id:'poison',     name:'Яд',            element:'вода',  dir:'тьма',   cost:2,  kind:'dot',
    desc:'Травит цель: -1 HP/раунд, 3 раунда.', eff:{ dot:1, rounds:3 } },
  { id:'antidote',   name:'Противоядие',  element:'вода',  dir:'сумрак', cost:2,  kind:'cure',
    desc:'Снимает яд и даёт регенерацию.', eff:{ cure:true, regen:1, rounds:5 } },
  { id:'light_ray',  name:'Луч света',     element:'огонь', dir:'свет',   cost:2,  kind:'damage',
    desc:'Обжигающий луч: -5 HP.', eff:{ dmg:5 } },
  { id:'ash',        name:'Пепел',         element:'огонь', dir:'тьма',   cost:2,  kind:'damage',
    desc:'Горсть пепла в лицо: -9 HP и -10 защиты на раунд.', eff:{ dmg:9, defDebuff:10, rounds:1 } },
  { id:'neg_ray',    name:'Луч негативной энергии', element:'огонь', dir:'сумрак', cost:10, kind:'damage',
    desc:'-5 урон, -10 защиты, -1 сила цели.', eff:{ dmg:5, defDebuff:10, strDebuff:1, rounds:2 } },
  { id:'barrier',    name:'Преграда',      element:'земля', dir:'свет',   cost:5,  kind:'buff',
    desc:'Преграда на поле боя: следующий удар врага слабее.', eff:{ defBuff:15, rounds:2 } },
  { id:'pit',        name:'Яма',           element:'земля', dir:'тьма',   cost:5,  kind:'control',
    desc:'Враг проваливается в яму и пропускает раунд (шанс).', eff:{ stun:0.5, rounds:1 } },
  { id:'quake',      name:'Землетрясение', element:'земля', dir:'сумрак', cost:10, kind:'damage',
    desc:'Сотрясает поле боя, нанося урон всем целям.', eff:{ dmg:12, aoe:true } },
  // --- Продвинутые заклинания (открываются с боссов в мирах 7+) ---
  { id:'heal_wave',        name:'Волна исцеления',   element:'вода',  dir:'свет',   cost:15, kind:'heal',
    desc:'Мощная волна восстанавливает 40 HP.', eff:{ heal:40 } },
  { id:'chain_lightning',  name:'Цепная молния',     element:'ветер', dir:'сумрак', cost:25, kind:'damage',
    desc:'Молния бьёт по всем врагам: −15 HP каждому.', eff:{ dmg:15, aoe:true } },
  { id:'inferno',          name:'Инферно',           element:'огонь', dir:'тьма',   cost:30, kind:'damage',
    desc:'Адское пламя испепеляет цель: −30 HP.', eff:{ dmg:30 } },
  { id:'stone_skin',       name:'Каменная кожа',     element:'земля', dir:'свет',   cost:10, kind:'buff',
    desc:'Кожа твердеет как камень: +40 защиты на 3 раунда.', eff:{ defBuff:40, rounds:3 } },
  { id:'soul_drain',       name:'Высасывание души',  element:'вода',  dir:'тьма',   cost:20, kind:'damage',
    desc:'Крадёт жизнь врага: −20 HP врагу, +10 HP вам.', eff:{ dmg:20, heal:10 } },
  { id:'meteor',           name:'Метеор',            element:'земля', dir:'тьма',   cost:40, kind:'damage',
    desc:'Падающий метеор сокрушает цель: −50 HP.', eff:{ dmg:50 } },
  // --- Заклинания Гильдии магов (изучаются за плату по рангу) ---
  { id:'ice_lance',  name:'Ледяное копьё', element:'вода',  dir:'тьма', cost:22, kind:'damage',
    desc:'Пронзает цель льдом: −28 HP.', eff:{ dmg:28 } },
  { id:'tempest',    name:'Буря',          element:'ветер', dir:'тьма', cost:35, kind:'damage',
    desc:'Шторм бьёт по всем врагам: −22 HP.', eff:{ dmg:22, aoe:true } },
  { id:'regen_aura', name:'Аура жизни',    element:'вода',  dir:'свет', cost:18, kind:'heal',
    desc:'Восстанавливает 25 HP.', eff:{ heal:25 } },
];

// ----------------------------------------------------------------------------
// ГИЛЬДИЯ МАГОВ: членство, ранги, улучшение и изучение заклинаний
// ----------------------------------------------------------------------------
const MAGE_GUILD_FEE = 2000;          // разовый членский взнос (золото)
const MAGE_RANKS = ['Послушник', 'Эксперт', 'Мастер', 'Грандмастер'];
function mageRankIdx(elemSum) { if (elemSum >= 120) return 3; if (elemSum >= 60) return 2; if (elemSum >= 20) return 1; return 0; }
const SPELL_UPGRADE_MAX = 5;
// макс. уровень улучшения зависит от ранга: Послушник 2, Эксперт 3, Мастер 4, Грандмастер 5
function spellUpgradeCap(rankIdx) { return Math.min(SPELL_UPGRADE_MAX, rankIdx + 2); }
function spellUpgradeCost(plus) { return { sparks: 200 * (plus + 1), gem: 2 * (plus + 1), gold: 500 * (plus + 1) }; }
// Изучаемые в гильдии заклинания: требуемый ранг + стоимость
const SPELL_LEARN = {
  heal_wave:       { rank:1, sparks:300,  gold:1500 },
  stone_skin:      { rank:1, sparks:300,  gold:1500 },
  regen_aura:      { rank:1, sparks:350,  gold:1800 },
  ice_lance:       { rank:1, sparks:400,  gold:2000 },
  soul_drain:      { rank:2, sparks:600,  gold:3000 },
  chain_lightning: { rank:2, sparks:600,  gold:3000 },
  tempest:         { rank:2, sparks:700,  gold:3500 },
  inferno:         { rank:2, sparks:800,  gold:4000 },
  meteor:          { rank:3, sparks:1200, gold:6000 },
};

// ----------------------------------------------------------------------------
// 12 МИРОВ с локациями и мобами (раздел «Локации и мобы»).
// tier — относительная сложность мира (1..12).
// ----------------------------------------------------------------------------
const WORLDS = [
  { name:'Равнинный', tier:1, intro:'Шелест трав и пение птиц… но мелкие твари ходят стаями.',
    locations:[
      ['Поле',['полевая фея']], ['Луг',['Тушканчик','бык']], ['Ручей',['Орк']],
      ['Озеро',['Светлый эльф']], ['Прерии',['Химера']], ['Овраг',['Заяц','Кикимора']],
      ['Водопой',['Кентавр','Олень']], ['Одинокий холм',['Хоббит']], ['Туман',['Ехидна','Ёж']],
      ['Тропа',['Оса','Разбойник']],
    ]},
  { name:'Лесной', tier:2, intro:'Любимое место охотников. Дичи всё меньше — виной непослушная молодёжь.',
    locations:[
      ['Опушка',['Гоблин']], ['Поляна',['Обезумевший лось']], ['Пуща',['Вепрь','Тигр']],
      ['Древний лес',['Бабай','Лесной эльф']], ['Бор',['Энт']], ['Плодовая роща',['Дриада','Чупакабра']],
      ['Малинник',['Медведь']], ['Заросли',['Дендроид','Леший']], ['Молодой лес',['Волк']],
      ['Сгоревший лес',['Чернокнижник','Медведь-оборотень']],
    ]},
  { name:'Подземный', tier:3, intro:'Тёмный сырой лабиринт с ископаемыми и негостеприимными сущностями.',
    locations:[
      ['Кристальная пещера',['Хранитель подземелья','Кристальный дракон']], ['Шахты',['Акромантул','Кобольд']],
      ['Галереи',['Летучая мышь']], ['Грот',['Песчаный червь']], ['Подземное озеро',['Гигантский слизень']],
      ['Древние ходы',['Драук','Дроу']], ['Лабиринт',['Крыса','Минотавр']], ['Разломы',['Дух земли']],
      ['Живая земля',['Крот','Червь']], ['Лес сталагмитов',['Земляной элементаль','Горгона']],
    ]},
  { name:'Горный', tier:4, intro:'Бивни скал, живописные пейзажи и вечно голодные звери.',
    locations:[
      ['Скала',['Орёл']], ['Парапет',['Горгулья']], ['Ущелье',['Гигантский паук','Тролль']],
      ['Водопад',['Гигант']], ['Ледник',['Ледяной демон']], ['Утёс',['Аспид','Циклоп']],
      ['Оползень',['Каменный голем']], ['Перевал',['Гнолл','Гном']], ['Пик',['Гарпия']],
      ['Горная тропа',['Серый гном','Гремлин']],
    ]},
  { name:'Пустынный', tier:5, intro:'Ни воды, ни растений — у самой природы стервозный характер.',
    locations:[
      ['Дюны',['Скарабей']], ['Оазис',['Мантикора']], ['Долина миражей',['Джинн']],
      ['Высохшая река',['Дервиш','Гигантский скорпион']], ['Развалины дворца',['Ночной убийца']],
      ['Пирамиды',['Крысолюд','Мумия']], ['Кактусовая роща',['Кобра']], ['Зыбучие пески',['Зловещее нечто']],
      ['Солёное озеро',['Сфинкс']], ['Мёртвый оазис',['Драйдер','Стервятник']],
    ]},
  { name:'Болотный', tier:6, intro:'Ядовитые растения, трясины, москиты и незабываемая вонь.',
    locations:[
      ['Трясина',['Болотник','Банши']], ['Илистые берега',['Ядовитая жаба']], ['Камышовые заросли',['Анаконда']],
      ['Омут',['Водяной']], ['Большие кочки',['Василиск']], ['Логово гадов',['Ящер']],
      ['Сгнивший лес',['Виверна']], ['Мутное озеро',['Крокодил']], ['Торфяник',['Гидра']],
      ['Источник газов',['Огр']],
    ]},
  { name:'Водный', tier:7, intro:'Запаситесь воздухом и смажьте доспехи, чтоб не заржавели.',
    locations:[
      ['Дно',['Тритон']], ['Остров',['Краб']], ['Коса',['Сирена','Черепаха']],
      ['Мелководье',['Русалка','Морской ёж']], ['Западина',['Дух воды']], ['Течение',['Водяной элементаль']],
      ['Водоворот',['Ледяной демон']], ['Лагуна',['Левиафан']], ['Кладбище кораблей',['Кракен']],
      ['Рифы',['Акула']],
    ]},
  { name:'Царство мёртвых', tier:8, intro:'Скелеты и зомби — мелочь, а вот вампир или некромант — достойный противник.',
    locations:[
      ['Кладбище',['Скелет']], ['Стикс',['Костяной дракон','Смерть']], ['Мёртвый лес',['Оборотень','Дрампир']],
      ['Разрытые могилы',['Зомби']], ['Осквернённые склепы',['Тёмный рыцарь','Чёрная вдова']],
      ['Катакомбы',['Акромантул']], ['Пристанище некромантов',['Некромант']], ['Усадьбы вампиров',['Вампир','Гуль']],
      ['Пристанище душ',['Призрак']], ['Мавзолей',['Лич']],
    ]},
  { name:'Лавяной', tier:9, intro:'За каждым камнем — толстокожие огнеупорные твари, мечтающие о свежем мясце.',
    locations:[
      ['Кратеры',['Живой огонёк']], ['Потоки лавы',['Феникс']], ['Застывшая лава',['Лавяной голем']],
      ['Серные гейзеры',['Ржавый дракон']], ['Лавяное озеро',['Огненный элементаль']], ['Лавяная река',['Ифрит']],
      ['Пепельная туча',['Чёрный дракон']], ['Действующий вулкан',['Дух огня']], ['Потухший вулкан',['Порождение бездны']],
      ['Раскалённая порода',['Саламандра']],
    ]},
  { name:'Горный пик / Небесный', tier:10, intro:'Мир необычайной красоты, но внешность бывает обманчива.',
    locations:[
      ['Облако',['Ворон']], ['Грозовая туча',['Золотой дракон','Громобой']], ['Ураган',['Воздушный дух']],
      ['Ночное небо',['Порождение ночи']], ['Вакуум',['Козерог']], ['Воздушные замки',['Маг']],
      ['Летающий остров',['Нага']], ['Сухой ветер',['Воздушный элементаль']],
      ['Галерея застывших молний',['Грифон','Эхо']], ['Эфир',['Титан']],
    ]},
  { name:'Ад', tier:11, intro:'Родной дом самых страшных и извращённых существ. Сюда не стоит попадать даже после смерти.',
    locations:[
      ['Смолистые ванны',['Осквернитель']], ['Серные тучи',['Магог','Демон']], ['Живодёрня',['Цербер','Червь-трупоед']],
      ['Пресс возмездия',['Кошмар']], ['Столовая «у Люцифера»',['Бес','Адский таракан']],
      ['Спальня грешников',['Чёрт','Госпожа боли']], ['Мясная лавка',['Мясник','Мародёр']],
      ['Покои дьявола',['Антихрист','Суккуба']], ['Арена Ада',['Инкуб','Проклятье']],
      ['Бездонный провал',['Дьявол','Люцифер']],
    ]},
  { name:'Рай', tier:12, intro:'То место, куда все стремятся. Но непрошеных гостей ждут муки, рядом с которыми сатана — дилетант.',
    locations:[
      ['Лестница в небо',['Страж света']], ['Запретный сад',['Змей-искуситель']], ['Тёплые озёра',['Нимфа']],
      ['Цветущие поляны',['Пегас']], ['Радужные поля',['Лепрекон']], ['Райские кусты',['Сатир']],
      ['Поднебесный замок',['Архангел']], ['Источники молодости',['Шива']], ['Земли обетованные',['Раздор']],
      ['Роща смирения',['Единорог']],
    ]},
];

// Требуемый уровень героя (xpLevel) для доступа к миру по индексу (тиры 1..12).
// Это «нижняя планка»; основной гейт — последовательная зачистка миров.
const WORLD_REQ_LEVEL = [1, 2, 4, 6, 9, 12, 15, 18, 21, 25, 30, 35];

// Уникальные имена мобов мира i.
function worldMobNames(i) {
  const w = WORLDS[i]; if (!w) return [];
  const s = new Set();
  w.locations.forEach((l) => l[1].forEach((n) => s.add(n)));
  return [...s];
}
// Зачищен ли мир i — побеждены ли все его мобы хотя бы по разу.
function worldCleared(p, i) {
  const set = new Set(p.defeatedMobs || []);
  return worldMobNames(i).every((n) => set.has(n));
}
// Доступен ли мир i: по уровню И при зачищенном предыдущем мире.
function worldUnlocked(p, i) {
  if (i <= 0) return true;
  const lvlOk = (p.xpLevel || 1) >= (WORLD_REQ_LEVEL[i] || 1);
  return lvlOk && worldCleared(p, i - 1);
}
function allWorldsCleared(p) { return WORLDS.every((w, i) => worldCleared(p, i)); }

// Боссы — по ключевым словам у мобов дают усиление и лучший лут.
const BOSS_WORDS = ['Дракон','Дьявол','Люцифер','Лич','Кракен','Левиафан','Титан','Архангел','Шива','Минотавр','Гидра','Смерть','Антихрист','Феникс','Единорог','Сфинкс'];
const CASTER_WORDS = ['Маг','Некромант','Чернокнижник','Элементаль','Дух','Лич','Шива','Джинн','Ведьма','Фея','Дриада','Призрак','Банши'];
const RANGED_WORDS = ['Орёл','Гарпия','Стервятник','Ворон','Лучник','Грифон','Оса'];

// ----------------------------------------------------------------------------
// РЕСУРСЫ (1/2/3 уровня) и особые: Золото, Души, Искры.
// ----------------------------------------------------------------------------
const RESOURCES = {
  // 1 уровень — добываются в мире смертных и из трофеев
  fiber:   { name:'Волокно',         tier:1, icon:'🧵' },
  thinHide:{ name:'Тонкая шкура',     tier:1, icon:'🦫' },
  thickHide:{ name:'Толстая шкура',   tier:1, icon:'🐗' },
  log:     { name:'Бревно',           tier:1, icon:'🪵' },
  stone:   { name:'Камень',           tier:1, icon:'🪨' },
  ore:     { name:'Руда',             tier:1, icon:'⛏️' },
  bone:    { name:'Кость',            tier:1, icon:'🦴' },
  herb:    { name:'Ромашка полевая',  tier:1, icon:'🌼' },
  mushroom:{ name:'Мухомор',          tier:1, icon:'🍄' },
  sand:    { name:'Пустынный песок',  tier:1, icon:'🏜️' },
  mica:    { name:'Слюда',            tier:1, icon:'✨' },
  salt:    { name:'Соль',             tier:1, icon:'🧂' },
  gem:     { name:'Драгоценный камень',tier:1, icon:'💎' },
  // 2 уровень — производятся в мастерских из ресурсов 1 уровня
  coal:    { name:'Древесный уголь',  tier:2, icon:'⚫' },
  plank:   { name:'Доска',            tier:2, icon:'🟫' },
  cloth:   { name:'Кусок ткани',      tier:2, icon:'🧶' },
  leather: { name:'Кусок кожи',       tier:2, icon:'🟤' },
  metal:   { name:'Металл',           tier:2, icon:'🔩' },
  // 3 уровень — выпадают с боссов в мирах 7+
  dragonScale:   { name:'Чешуя дракона',       tier:3, icon:'🐲' },
  soulGem:       { name:'Камень душ',           tier:3, icon:'🔮' },
  starCrystal:   { name:'Звёздный кристалл',    tier:3, icon:'🌟' },
  hellSteel:     { name:'Адская сталь',         tier:3, icon:'🔴' },
  arcaneEssence: { name:'Магическая эссенция',  tier:3, icon:'✴️' },
  // особые
  gold:    { name:'Золото',           tier:0, icon:'🪙', special:true },
  souls:   { name:'Души',             tier:0, icon:'👻', special:true },
  sparks:  { name:'Искры',            tier:0, icon:'🔥', special:true },
};

// ----------------------------------------------------------------------------
// РЕЦЕПТЫ КРАФТА. Каждый — мастерская (workshop), вход (in), искры (sparks),
// топливо (fuel: бревно/уголь повышают качество), результат (out).
// Снаряжение даёт {slot, dmg|armor, stat-bonuses}. Зелья дают {use}.
// ----------------------------------------------------------------------------
const WORKSHOPS = {
  smithy:   'Кузница',
  carpentry:'Столярная',
  tannery:  'Кожевня',
  loom:     'Ткацкая',
  smelter:  'Плавильня',
  jewelry:  'Ювелирная',
  lab:      'Лаборатория',
};

// ----------------------------------------------------------------------------
// ПРОФЕССИИ (раздел GDD «Профессии»: мастер, гранд-мастер).
// Каждая профессия привязана к мастерской (ws). Опыт растёт от крафта/добычи,
// мастерство повышает качество изделий и открывает «тайные знания» — рецепты.
// gathering — отдельная профессия собирателя (добыча «руками»).
// ----------------------------------------------------------------------------
const PROFESSIONS = {
  smithy:    { name:'Кузнец',      icon:'⚒️', grows:'ковка оружия, брони и щитов' },
  carpentry: { name:'Столяр',      icon:'🪚', grows:'обработка дерева, луки и посохи' },
  tannery:   { name:'Кожевник',    icon:'🧶', grows:'выделка кожи' },
  loom:      { name:'Ткач',        icon:'🧵', grows:'ткачество и лёгкая броня' },
  smelter:   { name:'Плавильщик',  icon:'🔥', grows:'выплавка металла' },
  jewelry:   { name:'Ювелир',      icon:'💍', grows:'огранка камней и бижутерия' },
  lab:       { name:'Алхимик',     icon:'⚗️', grows:'эликсиры, зелья и мази' },
  gathering: { name:'Собиратель',  icon:'⛏️', grows:'добыча ресурсов своими руками' },
};
const PROF_ORDER = ['smithy','carpentry','tannery','loom','smelter','jewelry','lab','gathering'];

// «Тайные знания»: рецепт открывается, когда профессия мастерской достигает
// указанного уровня. Стартовые рецепты (lvl 1) известны сразу.
// Легендарные схемы здесь не перечислены — их по-прежнему добывают с боссов.
const PROF_RECIPES = {
  smithy:    [['dagger',1],['disc',2],['sword',2],['lhelm',2],['lbody',3],['phelm',4],['axe',4],['mace',5],['bshield',5],['spear',6],['pbody',7]],
  carpentry: [['bow',2],['staff',3]],
  loom:      [['cap',1],['robe',2]],
  jewelry:   [['ring',1],['earring',2],['amulet',4]],
  lab:       [['hp_elixir',1],['mp_elixir',1],['poison_vial',2],['antidote_vial',2],['str_balm',3],['silence_vial',4],['stoneskin_potion',5]],
};

// Звание мастерства по уровню профессии.
function profTitle(lvl) {
  if (lvl >= 15) return 'Гранд-мастер';
  if (lvl >= 10) return 'Мастер';
  if (lvl >= 5)  return 'Подмастерье';
  return 'Новичок';
}

const RECIPES = [
  // --- переработка ресурсов 1->2 уровня ---
  { id:'coal',   ws:'carpentry', name:'Древесный уголь', in:{log:5}, out:{res:'coal', qty:1} },
  { id:'plank',  ws:'carpentry', name:'Доска',           in:{log:2}, out:{res:'plank', qty:2} },
  { id:'cloth',  ws:'loom',      name:'Кусок ткани',     in:{fiber:10}, out:{res:'cloth', qty:1} },
  { id:'leather',ws:'tannery',   name:'Кусок кожи',      in:{thinHide:1}, out:{res:'leather', qty:1} },
  { id:'metal',  ws:'smelter',   name:'Металл',          in:{ore:2}, fuel:1, out:{res:'metal', qty:1} },

  // --- ОРУЖИЕ (раздел «Оружие») ---
  { id:'dagger', ws:'smithy', name:'Кинжал', sparks:50, fuel:1, in:{metal:2, plank:1},
    out:{ item:{ name:'Кинжал', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[2,5], req:{agi:4}, weight:2 } } },
  { id:'sword',  ws:'smithy', name:'Меч', sparks:100, fuel:2, in:{metal:4, plank:1},
    out:{ item:{ name:'Меч', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[4,9], req:{str:6,agi:4}, weight:4 } } },
  { id:'axe',    ws:'smithy', name:'Топор', sparks:120, fuel:2, in:{metal:5, plank:2},
    out:{ item:{ name:'Топор', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[5,11], req:{str:9}, weight:6 } } },
  { id:'mace',   ws:'smithy', name:'Булава', sparks:120, fuel:2, in:{metal:6},
    out:{ item:{ name:'Булава', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[6,12], req:{str:11}, weight:8 } } },
  { id:'spear',  ws:'smithy', name:'Копьё', sparks:150, fuel:2, in:{metal:4, plank:3},
    out:{ item:{ name:'Копьё', slot:'weapon', type:'оружие', hands:2, dist:'средняя', dmg:[8,16], req:{str:12,agi:6}, weight:7 } } },
  { id:'bow',    ws:'carpentry', name:'Лук', sparks:120, fuel:1, in:{plank:4, fiber:6},
    out:{ item:{ name:'Лук', slot:'weapon', type:'оружие', hands:2, dist:'дальняя', dmg:[3,9], req:{agi:8}, weight:3 } } },
  { id:'staff',  ws:'carpentry', name:'Посох', sparks:150, fuel:1, in:{plank:5, gem:1},
    out:{ item:{ name:'Посох', slot:'weapon', type:'оружие', hands:2, dist:'средняя', dmg:[2,6], req:{int:8}, weight:4, bonus:{ int:5 } } } },
  { id:'disc',   ws:'smithy', name:'Метательный диск', sparks:100, fuel:1, in:{metal:2, stone:1},
    out:{ item:{ name:'Метательный диск', slot:'weapon', type:'оружие', hands:1, dist:'дальняя', dmg:[1,5], req:{agi:8}, weight:2 } } },

  // --- БРОНЯ (раздел «Броня») ---
  { id:'cap',    ws:'loom', name:'Тканевый шлем', sparks:50, fuel:1, in:{cloth:3},
    out:{ item:{ name:'Тканевый шлем', slot:'head', type:'броня', armorType:'лёгкая', armor:1, weight:2, req:{str:1} } } },
  { id:'robe',   ws:'loom', name:'Роба', sparks:50, fuel:1, in:{cloth:3},
    out:{ item:{ name:'Роба', slot:'body', type:'броня', armorType:'лёгкая', armor:2, weight:2, req:{str:1}, bonus:{ int:2 } } } },
  { id:'lhelm',  ws:'smithy', name:'Кожаный шлем', sparks:80, fuel:1, in:{leather:3},
    out:{ item:{ name:'Кожаный шлем', slot:'head', type:'броня', armorType:'средняя', armor:3, weight:3, req:{str:3} } } },
  { id:'lbody',  ws:'smithy', name:'Кожаный доспех', sparks:80, fuel:1, in:{leather:4},
    out:{ item:{ name:'Кожаный доспех', slot:'body', type:'броня', armorType:'средняя', armor:5, weight:5, req:{str:3} } } },
  { id:'phelm',  ws:'smithy', name:'Стальной шлем', sparks:120, fuel:2, in:{metal:3},
    out:{ item:{ name:'Стальной шлем', slot:'head', type:'броня', armorType:'тяжёлая', armor:6, weight:6, req:{str:6} } } },
  { id:'pbody',  ws:'smithy', name:'Латный нагрудник', sparks:160, fuel:3, in:{metal:6},
    out:{ item:{ name:'Латный нагрудник', slot:'body', type:'броня', armorType:'тяжёлая', armor:10, weight:12, req:{str:9} } } },
  { id:'bshield',ws:'smithy', name:'Большой щит', sparks:140, fuel:3, in:{metal:6, plank:3},
    out:{ item:{ name:'Большой щит', slot:'shield', type:'броня', armorType:'тяжёлая', armor:9, weight:12, req:{str:8} } } },

  // --- БИЖУТЕРИЯ (раздел «Бижутерия») — энергетический сосуд, бонусы к статам ---
  { id:'ring',   ws:'jewelry', name:'Кольцо силы', sparks:80, in:{metal:1, gem:1},
    out:{ item:{ name:'Кольцо силы', slot:'ring', type:'бижутерия', weight:0, bonus:{ str:3 } } } },
  { id:'amulet', ws:'jewelry', name:'Амулет веры', sparks:100, in:{metal:1, gem:2},
    out:{ item:{ name:'Амулет веры', slot:'amulet', type:'бижутерия', weight:0, bonus:{ fai:3, int:2 } } } },
  { id:'earring',ws:'jewelry', name:'Серьги удачи', sparks:90, in:{gem:2},
    out:{ item:{ name:'Серьги удачи', slot:'earring', type:'бижутерия', weight:0, bonus:{ luk:4 } } } },

  // --- ЛЕГЕНДАРНОЕ ОРУЖИЕ (требует ресурсы 3 уровня) ---
  { id:'rune_blade',  ws:'smithy',    name:'Рунный клинок',    sparks:500, fuel:3, in:{hellSteel:3, soulGem:2},
    out:{ item:{ name:'Рунный клинок',    slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[18,36], req:{str:20,int:15}, weight:4, bonus:{ str:5, int:3 } } } },
  { id:'necro_staff', ws:'carpentry', name:'Посох некроманта', sparks:600, fuel:2, in:{dragonScale:2, soulGem:3},
    out:{ item:{ name:'Посох некроманта', slot:'weapon', type:'оружие', hands:2, dist:'средняя',  dmg:[10,20], req:{int:20,fai:15}, weight:4, bonus:{ int:10, fai:5 } } } },
  { id:'star_bow',    ws:'carpentry', name:'Звёздный лук',     sparks:450, fuel:2, in:{starCrystal:3, fiber:10},
    out:{ item:{ name:'Звёздный лук',     slot:'weapon', type:'оружие', hands:2, dist:'дальняя',  dmg:[14,28], req:{agi:20,luk:10}, weight:3, bonus:{ agi:5, luk:5 } } } },
  { id:'hell_maul',   ws:'smithy',    name:'Адский молот',     sparks:700, fuel:4, in:{hellSteel:5, dragonScale:2},
    out:{ item:{ name:'Адский молот',     slot:'weapon', type:'оружие', hands:2, dist:'ближняя',  dmg:[25,50], req:{str:25,end:15}, weight:12, bonus:{ str:8 } } } },

  // --- ЛЕГЕНДАРНАЯ БРОНЯ ---
  { id:'dragon_armor', ws:'smithy', name:'Доспех дракона', sparks:800, fuel:5, in:{dragonScale:5, metal:3},
    out:{ item:{ name:'Доспех дракона', slot:'body', type:'броня', armorType:'тяжёлая', armor:30, weight:15, req:{str:20,end:15}, bonus:{ str:5, end:5 } } } },
  { id:'arcane_robe',  ws:'loom',   name:'Мантия мага',   sparks:600, fuel:2, in:{arcaneEssence:3, cloth:5},
    out:{ item:{ name:'Мантия мага',   slot:'body', type:'броня', armorType:'лёгкая',   armor:8,  weight:3,  req:{int:20,fai:10}, bonus:{ int:12, fai:6 } } } },
  { id:'shadow_helm',  ws:'smithy', name:'Шлем теней',    sparks:500, fuel:3, in:{hellSteel:3, soulGem:1},
    out:{ item:{ name:'Шлем теней',    slot:'head', type:'броня', armorType:'тяжёлая', armor:18, weight:8,  req:{str:18,agi:12}, bonus:{ agi:5, fur:5 } } } },

  // --- ЛЕГЕНДАРНАЯ БИЖУТЕРИЯ ---
  { id:'star_amulet',  ws:'jewelry', name:'Амулет звёзд',    sparks:400, in:{starCrystal:2, gem:3},
    out:{ item:{ name:'Амулет звёзд',    slot:'amulet',  type:'бижутерия', weight:0, bonus:{ fai:8, luk:5 } } } },
  { id:'dragon_ring',  ws:'jewelry', name:'Кольцо дракона',  sparks:350, in:{dragonScale:1, gem:2},
    out:{ item:{ name:'Кольцо дракона',  slot:'ring',    type:'бижутерия', weight:0, bonus:{ str:6, end:4 } } } },
  { id:'hell_earring', ws:'jewelry', name:'Серьги ада',      sparks:300, in:{hellSteel:1, soulGem:1},
    out:{ item:{ name:'Серьги ада',      slot:'earring', type:'бижутерия', weight:0, bonus:{ fur:6, rea:4 } } } },

  // --- БУТЫЛКИ: эликсиры/зелья/мази (раздел «Бутылки»). conc = концентрация,
  //     растёт от мастерства Алхимика и усиливает эффект зелья. ---
  { id:'hp_elixir',  ws:'lab', name:'Эликсир жизни', in:{herb:5},
    out:{ item:{ name:'Эликсир жизни', slot:null, type:'эликсир', use:{ heal:40 }, conc:10, stack:true } } },
  { id:'mp_elixir',  ws:'lab', name:'Эликсир маны', in:{mica:5},
    out:{ item:{ name:'Эликсир маны', slot:null, type:'эликсир', use:{ mana:40 }, conc:10, stack:true } } },
  { id:'poison_vial',ws:'lab', name:'Зелье яда', in:{mushroom:5},
    out:{ item:{ name:'Зелье яда', slot:null, type:'зелье', use:{ throwDmg:25 }, conc:10, stack:true } } },
  { id:'str_balm',   ws:'lab', name:'Мазь силы', in:{herb:3, mushroom:3},
    out:{ item:{ name:'Мазь силы', slot:null, type:'мазь', use:{ buff:{ str:5 }, mins:30 }, conc:10, stack:true } } },
  { id:'antidote_vial', ws:'lab', name:'Противоядие', in:{herb:4, mica:2},
    out:{ item:{ name:'Противоядие', slot:null, type:'эликсир', use:{ cure:'poison' }, conc:10, stack:true } } },
  { id:'silence_vial',  ws:'lab', name:'Зелье немоты', in:{mushroom:6, mica:3},
    out:{ item:{ name:'Зелье немоты', slot:null, type:'зелье', use:{ silence:2 }, conc:10, stack:true } } },
  { id:'stoneskin_potion', ws:'lab', name:'Зелье каменной кожи', in:{stone:6, herb:3},
    out:{ item:{ name:'Зелье каменной кожи', slot:null, type:'эликсир', use:{ stoneskin:3 }, conc:12, stack:true } } },
];

// ----------------------------------------------------------------------------
// РАРНОСТЬ ПРЕДМЕТОВ (множит статы выпавшей вещи)
// Чем выше уровень героя и сложность похода, тем выше шанс редких рарностей.
// ----------------------------------------------------------------------------
const RARITIES = {
  common:    { name:'Обычный',     color:'#9c8c74', mult:1.00, weight:50 },
  uncommon:  { name:'Необычный',   color:'#6fa84f', mult:1.20, weight:30 },
  rare:      { name:'Редкий',      color:'#4f8fd9', mult:1.45, weight:14 },
  epic:      { name:'Эпический',   color:'#a965d9', mult:1.75, weight:5 },
  legendary: { name:'Легендарный', color:'#f0a94a', mult:2.10, weight:1.5 },
  mythic:    { name:'Мифический',  color:'#e0503a', mult:2.60, weight:0.4 },
};
const RARITY_ORDER = ['common','uncommon','rare','epic','legendary','mythic'];

// ----------------------------------------------------------------------------
// УСИЛИТЕЛИ (камни-инкрустация в гнёзда снаряжения).
// 9 типов (по стату) × 3 тира. Крафт за 💎 камни + 🔥 искры. Бонус к стату.
// ----------------------------------------------------------------------------
const ENHANCERS = {
  str: { name:'Рубин',    icon:'🔴' },
  agi: { name:'Изумруд',  icon:'🟢' },
  end: { name:'Оникс',    icon:'🟤' },
  int: { name:'Сапфир',   icon:'🔵' },
  fai: { name:'Аметист',  icon:'🟣' },
  fur: { name:'Альмандин',icon:'❤️' },
  luk: { name:'Цитрин',   icon:'🟡' },
  rea: { name:'Топаз',    icon:'🟠' },
  ref: { name:'Алмаз',    icon:'💎' },
};
const GEM_TIERS = {
  1: { rom:'I',   bonus:2, gem:2, sparks:200 },
  2: { rom:'II',  bonus:4, gem:4, sparks:600 },
  3: { rom:'III', bonus:7, gem:6, sparks:1500 },
};
const SOCKET_OPEN_COST = [300, 900, 2700]; // искры за 1-е / 2-е / 3-е гнездо

// ----------------------------------------------------------------------------
// КЛАНОВЫЕ УЛУЧШЕНИЯ (покупаются лидером за казну, бафают всех участников)
// ----------------------------------------------------------------------------
const CLAN_UPGRADES = {
  artifact: { name:'Артефакт клана', icon:'⚜️', desc:'+1 ко всем статам каждому участнику за уровень' },
  vault:    { name:'Сокровищница',   icon:'💰', desc:'+5% золота с походов за уровень' },
  forge:    { name:'Клановая кузня',  icon:'⚒️', desc:'+1 ресурс-трофей с боя за уровень' },
  altar:    { name:'Алтарь предков',  icon:'✨', desc:'+5% опыта с походов за уровень' },
};
const CLAN_UPGRADE_ORDER = ['artifact', 'vault', 'forge', 'altar'];
const CLAN_UPGRADE_MAX = 5;
function clanUpgradeCost(lvl) { return 1000 * (lvl + 1) * (lvl + 1); } // 1000,4000,9000,16000,25000

// Дневной лимит боёв на арене с наградой (сверх — бой без золота/опыта)
const ARENA_DAILY_LIMIT = 25;

// ----------------------------------------------------------------------------
// БОЕВЫЕ НАВЫКИ (растут от использования, как статы; дают бонусы поверх статов)
// ----------------------------------------------------------------------------
const SKILLS = {
  slash:  { name:'Режущее оружие',  icon:'🗡️', kind:'weapon', desc:'+урон режущим оружием (мечи, кинжалы)' },
  pierce: { name:'Колющее оружие',  icon:'🔱', kind:'weapon', desc:'+урон колющим (копья, пики)' },
  chop:   { name:'Рубящее оружие',  icon:'🪓', kind:'weapon', desc:'+урон рубящим (топоры)' },
  blunt:  { name:'Дробящее оружие', icon:'🔨', kind:'weapon', desc:'+урон дробящим (булавы, посохи)' },
  ranged: { name:'Стрелковое оружие', icon:'🏹', kind:'weapon', desc:'+урон и атака дальним оружием' },
  armorLight:  { name:'Лёгкая броня',  icon:'🧥', kind:'armor', desc:'+броня и защита в лёгкой броне' },
  armorMedium: { name:'Средняя броня', icon:'🛡️', kind:'armor', desc:'+броня и защита в средней броне' },
  armorHeavy:  { name:'Тяжёлая броня', icon:'⛓️', kind:'armor', desc:'+броня и защита в тяжёлой броне' },
  parry:  { name:'Парирование', icon:'⚔️', kind:'def', desc:'шанс парировать удар и вернуть половину урона' },
  taming: { name:'Приручение', icon:'🐾', kind:'special', desc:'шанс приручить ослабленного зверя; больше активных питомцев' },
};
const SKILL_ORDER = ['slash', 'pierce', 'chop', 'blunt', 'ranged', 'armorLight', 'armorMedium', 'armorHeavy', 'parry', 'taming'];
const PETS_MAX = 10; // всего питомцев в коллекции
const ARMOR_SKILL = { light: 'armorLight', medium: 'armorMedium', heavy: 'armorHeavy' };

// Категория навыка для оружия (по дистанции и названию). Кулаки → null.
function weaponSkillFor(it) {
  if (!it) return null;
  if (it.dist === 'дальняя') return 'ranged';
  const n = (it.name || '').toLowerCase();
  if (/лук|арбалет|диск|дротик|стрел|праща/.test(n)) return 'ranged';
  if (/топор|секира/.test(n)) return 'chop';
  if (/булав|молот|посох|дубин|кистень|жезл/.test(n)) return 'blunt';
  if (/копь|пик|трезуб|вилы|острог/.test(n)) return 'pierce';
  return 'slash'; // меч, кинжал, сабля, клинок и прочее
}
// Класс брони предмета (light/medium/heavy) по слоту и материалу в названии.
function armorClassOf(it) {
  if (!it || !['head', 'body', 'shield'].includes(it.slot)) return null;
  const n = (it.name || '').toLowerCase();
  if (/латн|стальн|сталь|плит|чешуй|дракон|мифрил|адск|железн/.test(n)) return 'heavy';
  if (/кож/.test(n)) return 'medium';
  if (/ткан|роба|мантия|холст|матерч|капюшон|тряп/.test(n)) return 'light';
  return 'medium';
}
// Максимум гнёзд для предмета (по рарности; без рарности — 1).
function maxSockets(it) {
  const i = it && it.rarity ? RARITY_ORDER.indexOf(it.rarity) : 0;
  if (i >= RARITY_ORDER.indexOf('legendary')) return 3;
  if (i >= RARITY_ORDER.indexOf('rare')) return 2;
  return 1;
}

// ----------------------------------------------------------------------------
// КЛАССОВЫЕ КОМПЛЕКТЫ (сеты). Каждый сет — предметы одного класса по слотам.
// Любой предмет сета может выпасть любой рарности (рарность множит статы).
// Сет-бонус даётся за число надетых частей (2 / 4 / полный), независимо от рарности.
// minTier — с какого мира начинают падать части сета.
// ----------------------------------------------------------------------------
const GEAR_SETS = {
  // ----- МАГ -----
  arcane: { name:'Звёздный аркан', class:'Маг', icon:'🌟', minTier:3,
    pieces: {
      weapon: { name:'Посох звёздного аркана', slot:'weapon', type:'оружие', hands:2, dist:'средняя', dmg:[8,16], req:{int:14}, weight:4, bonus:{ int:6, fai:2 } },
      head:   { name:'Венец звездочёта', slot:'head', type:'броня', armorType:'лёгкая', armor:4, weight:2, req:{int:8}, bonus:{ int:3 } },
      body:   { name:'Мантия созвездий', slot:'body', type:'броня', armorType:'лёгкая', armor:7, weight:3, req:{int:10}, bonus:{ int:5, fai:2 } },
      amulet: { name:'Амулет небосвода', slot:'amulet', type:'бижутерия', weight:0, bonus:{ fai:5, int:3 } },
      ring:   { name:'Перстень звездочёта', slot:'ring', type:'бижутерия', weight:0, bonus:{ int:4 } },
    },
    bonuses: {
      '2':    { spellPct:12, desc:'+12% сила заклинаний' },
      '4':    { mpRegenFlat:6, add:{ int:4 }, desc:'+6 реген маны, +4 Интеллект' },
      'full': { spellPct:18, mpFlat:60, desc:'+18% сила заклинаний и +60 макс. маны' },
    } },
  // ----- ВОИН -----
  warlord: { name:'Гнев Вавилона', class:'Воин', icon:'⚔️', minTier:2,
    pieces: {
      weapon: { name:'Клинок Вавилона', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[10,20], req:{str:12}, weight:4, bonus:{ str:4 } },
      head:   { name:'Шлем владыки', slot:'head', type:'броня', armorType:'тяжёлая', armor:8, weight:6, req:{str:8}, bonus:{ str:2, end:2 } },
      body:   { name:'Латы владыки', slot:'body', type:'броня', armorType:'тяжёлая', armor:16, weight:12, req:{str:12}, bonus:{ end:4 } },
      shield: { name:'Щит Вавилона', slot:'shield', type:'броня', armorType:'тяжёлая', armor:10, weight:10, req:{str:8}, bonus:{ end:3 } },
      ring:   { name:'Печать воина', slot:'ring', type:'бижутерия', weight:0, bonus:{ str:4, end:2 } },
    },
    bonuses: {
      '2':    { dmgPct:8, desc:'+8% урон в ближнем бою' },
      '4':    { armorFlat:12, add:{ end:4 }, desc:'+12 брони, +4 Выносливости' },
      'full': { dmgPct:12, physCritFlat:8, desc:'+12% урон и +8% физ. крит' },
    } },
  // ----- БЕРСЕРК -----
  berserk: { name:'Кровавая жатва', class:'Берсерк', icon:'🩸', minTier:4,
    pieces: {
      weapon: { name:'Секира кровавой жатвы', slot:'weapon', type:'оружие', hands:2, dist:'ближняя', dmg:[16,30], req:{str:16}, weight:10, bonus:{ fur:4, str:3 } },
      head:   { name:'Шлем ярости', slot:'head', type:'броня', armorType:'средняя', armor:6, weight:4, req:{str:10}, bonus:{ fur:3 } },
      body:   { name:'Доспех берсерка', slot:'body', type:'броня', armorType:'средняя', armor:10, weight:7, req:{str:12}, bonus:{ fur:3, str:2 } },
      earring:{ name:'Серьга бешенства', slot:'earring', type:'бижутерия', weight:0, bonus:{ fur:5 } },
      ring:   { name:'Кольцо неистовства', slot:'ring', type:'бижутерия', weight:0, bonus:{ fur:3, str:3 } },
    },
    bonuses: {
      '2':    { physCritFlat:10, desc:'+10% физ. крит' },
      '4':    { maxDmgFlat:12, add:{ fur:4 }, desc:'+12% шанс макс. урона, +4 Ярости' },
      'full': { dmgPct:22, armorFlat:-8, desc:'+22% урон, но −8 брони (риск/награда)' },
    } },
  // ----- ЛУЧНИК -----
  ranger: { name:'Шёпот ветра', class:'Лучник', icon:'🍃', minTier:3,
    pieces: {
      weapon: { name:'Лук шёпота ветра', slot:'weapon', type:'оружие', hands:2, dist:'дальняя', dmg:[12,24], req:{agi:14}, weight:3, bonus:{ agi:4, luk:2 } },
      head:   { name:'Капюшон следопыта', slot:'head', type:'броня', armorType:'лёгкая', armor:4, weight:2, req:{agi:8}, bonus:{ agi:3 } },
      body:   { name:'Куртка следопыта', slot:'body', type:'броня', armorType:'средняя', armor:8, weight:5, req:{agi:10}, bonus:{ agi:3, luk:2 } },
      earring:{ name:'Серьга ветра', slot:'earring', type:'бижутерия', weight:0, bonus:{ agi:4, luk:2 } },
      ring:   { name:'Кольцо меткости', slot:'ring', type:'бижутерия', weight:0, bonus:{ agi:4 } },
    },
    bonuses: {
      '2':    { dmgPct:10, desc:'+10% урон в дальнем бою' },
      '4':    { physCounterFlat:8, add:{ agi:4 }, desc:'+8% уклонение, +4 Ловкости' },
      'full': { lootFlat:40, maxDmgFlat:10, desc:'+большой шанс ценного трофея и +10% макс. урон' },
    } },
  // ----- ТАНК -----
  guardian: { name:'Несокрушимый бастион', class:'Танк', icon:'🛡', minTier:4,
    pieces: {
      weapon: { name:'Молот стража', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[8,16], req:{str:10,end:8}, weight:8, bonus:{ end:3 } },
      head:   { name:'Шлем бастиона', slot:'head', type:'броня', armorType:'тяжёлая', armor:10, weight:7, req:{end:8}, bonus:{ end:3, rea:2 } },
      body:   { name:'Латы бастиона', slot:'body', type:'броня', armorType:'тяжёлая', armor:20, weight:14, req:{end:12}, bonus:{ end:5 } },
      shield: { name:'Башенный щит', slot:'shield', type:'броня', armorType:'тяжёлая', armor:14, weight:14, req:{str:10}, bonus:{ end:3, ref:2 } },
      amulet: { name:'Амулет твердыни', slot:'amulet', type:'бижутерия', weight:0, bonus:{ end:5, rea:3 } },
    },
    bonuses: {
      '2':    { hpFlat:80, desc:'+80 макс. HP' },
      '4':    { armorFlat:16, add:{ rea:4 }, desc:'+16 брони, +4 Реакции' },
      'full': { physCounterFlat:15, magCounterFlat:15, desc:'+15% физ. и маг. контрудар' },
    } },
  // ----- АССАСИН -----
  assassin: { name:'Тень Зиккурата', class:'Ассасин', icon:'🗡', minTier:3,
    pieces: {
      weapon: { name:'Клинок теней', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[9,18], req:{agi:12}, weight:2, bonus:{ agi:3, fur:2 } },
      head:   { name:'Маска зиккурата', slot:'head', type:'броня', armorType:'лёгкая', armor:3, weight:2, req:{agi:8}, bonus:{ agi:3 } },
      body:   { name:'Облачение теней', slot:'body', type:'броня', armorType:'лёгкая', armor:6, weight:3, req:{agi:10}, bonus:{ agi:3, luk:2 } },
      ring:   { name:'Кольцо убийцы', slot:'ring', type:'бижутерия', weight:0, bonus:{ fur:3, luk:2 } },
      earring:{ name:'Серьга тени', slot:'earring', type:'бижутерия', weight:0, bonus:{ agi:3, luk:2 } },
    },
    bonuses: {
      '2':    { physCritFlat:10, desc:'+10% физ. крит' },
      '4':    { physCounterFlat:10, add:{ agi:4 }, desc:'+10% уклонение, +4 Ловкости' },
      'full': { physCritFlat:15, maxDmgFlat:10, desc:'+15% физ. крит и +10% макс. урон' },
    } },
  // ----- ПАЛАДИН (эндгейм) -----
  paladin: { name:'Длань Небес', class:'Паладин', icon:'✨', minTier:9,
    pieces: {
      weapon: { name:'Булава небес', slot:'weapon', type:'оружие', hands:1, dist:'ближняя', dmg:[14,26], req:{str:16,fai:10}, weight:8, bonus:{ str:4, fai:3 } },
      head:   { name:'Венец паладина', slot:'head', type:'броня', armorType:'тяжёлая', armor:10, weight:7, req:{str:12}, bonus:{ fai:3, end:2 } },
      body:   { name:'Латы небес', slot:'body', type:'броня', armorType:'тяжёлая', armor:22, weight:14, req:{str:16,fai:8}, bonus:{ str:4, fai:3 } },
      shield: { name:'Эгида небес', slot:'shield', type:'броня', armorType:'тяжёлая', armor:14, weight:12, req:{str:12}, bonus:{ fai:4, end:3 } },
      amulet: { name:'Реликвия небес', slot:'amulet', type:'бижутерия', weight:0, bonus:{ fai:6, int:3 } },
    },
    bonuses: {
      '2':    { magCritFlat:12, desc:'+12% маг. крит' },
      '4':    { hpFlat:80, add:{ fai:5, str:3 }, desc:'+80 HP, +5 Веры, +3 Силы' },
      'full': { dmgPct:15, hpRegenFlat:8, desc:'+15% урон и +8 реген HP (исцеление аурой)' },
    } },
};

// ----------------------------------------------------------------------------
// ДОСТИЖЕНИЯ (пассивные вехи; награда выдаётся один раз при разблокировке)
// check(p) — предикат от объекта игрока.
// ----------------------------------------------------------------------------
const _acMaxRarity = (p) => {
  let best = -1;
  Object.values(p.codex || {}).forEach((slots) => Object.values(slots).forEach((rk) => {
    const i = RARITY_ORDER.indexOf(rk); if (i > best) best = i;
  }));
  return best;
};
const _acFullSet = (p) => Object.keys(GEAR_SETS).some((id) => p.codex && p.codex[id]
  && Object.keys(p.codex[id]).length >= Object.keys(GEAR_SETS[id].pieces).length);

const ACHIEVEMENTS = [
  { id:'first_blood', icon:'🩸', name:'Первая кровь', desc:'Убей первого моба.', reward:{ sparks:20 }, check:(p) => p.counters.kills >= 1 },
  { id:'slayer',      icon:'⚔️', name:'Истребитель',  desc:'Убей 100 мобов.',  reward:{ sparks:100 }, check:(p) => p.counters.kills >= 100 },
  { id:'executioner', icon:'💀', name:'Палач',        desc:'Убей 1000 мобов.', reward:{ souls:1 },     check:(p) => p.counters.kills >= 1000 },
  { id:'boss1',  icon:'🐲', name:'Гроза боссов',  desc:'Победи первого босса.', reward:{ sparks:50 }, check:(p) => (p.counters.bossKills || 0) >= 1 },
  { id:'boss10', icon:'🐉', name:'Драконоборец',  desc:'Победи 10 боссов.',     reward:{ souls:1 },   check:(p) => (p.counters.bossKills || 0) >= 10 },
  { id:'gatherer', icon:'⛏️', name:'Старатель', desc:'Добудь 200 ресурсов своими руками.', reward:{ sparks:80 }, check:(p) => p.counters.gathered >= 200 },
  { id:'smith',    icon:'🔨', name:'Кузнец',    desc:'Создай 50 предметов.',                reward:{ sparks:100 }, check:(p) => p.counters.crafted >= 50 },
  { id:'traveler', icon:'🪜', name:'Странник',  desc:'Соверши 25 походов.',                 reward:{ sparks:80 },  check:(p) => (p.counters.expeditions || 0) >= 25 },
  { id:'explorer', icon:'🗺️', name:'Первопроходец', desc:'Побывай в 30 локациях.',         reward:{ souls:1 },    check:(p) => (p.visitedLocations || []).length >= 30 },
  { id:'duelist',  icon:'🤺', name:'Дуэлянт',   desc:'Победи 10 игроков на Арене.',         reward:{ sparks:150 }, check:(p) => (p.pvp ? p.pvp.wins : 0) >= 10 },
  { id:'archmage', icon:'✨', name:'Архимаг',   desc:'Изучи все 12 заклинаний.',            reward:{ souls:1 },    check:(p) => p.spells.length >= 12 },
  { id:'lvl10', icon:'🎖', name:'Восхождение', desc:'Достигни 10 уровня.', reward:{ sparks:100 }, check:(p) => p.xpLevel >= 10 },
  { id:'lvl25', icon:'🌟', name:'Полубог',     desc:'Достигни 25 уровня.', reward:{ souls:1 },    check:(p) => p.xpLevel >= 25 },
  { id:'lvl50', icon:'👑', name:'Владыка',     desc:'Достигни 50 уровня.', reward:{ souls:3 },    check:(p) => p.xpLevel >= 50 },
  { id:'rich',  icon:'🪙', name:'Богач',       desc:'Накопи 10 000 золота.', reward:{ sparks:200 }, check:(p) => (p.resources.gold || 0) >= 10000 },
  { id:'dresser', icon:'🎒', name:'Модник',    desc:'Сохрани сборку экипировки.', reward:{ sparks:30 }, check:(p) => (p.loadouts || []).length >= 1 },
  { id:'collector', icon:'🎽', name:'Коллекционер', desc:'Собери полный комплект любого сета.', reward:{ souls:1 }, check:_acFullSet },
  { id:'archivist', icon:'🗂️', name:'Архивариус', desc:'Открой в Кодексе все 7 сетов.', reward:{ souls:2 }, check:(p) => Object.keys(GEAR_SETS).every((id) => p.codex && p.codex[id]) },
  { id:'legend', icon:'🟠', name:'Прикосновение легенды', desc:'Найди предмет легендарной рарности.', reward:{ souls:1 }, check:(p) => _acMaxRarity(p) >= RARITY_ORDER.indexOf('legendary') },
  { id:'mythic', icon:'🔴', name:'Миф во плоти', desc:'Найди предмет мифической рарности.', reward:{ souls:2 }, check:(p) => _acMaxRarity(p) >= RARITY_ORDER.indexOf('mythic') },
  { id:'conqueror', icon:'🏆', name:'Покоритель миров', desc:'Победи всех мобов во всех 12 мирах.', reward:{ souls:5 }, check:(p) => allWorldsCleared(p) },
];

// ----------------------------------------------------------------------------
// ЕЖЕДНЕВНОЕ: награда за вход (со стриком) и ежедневные задания.
// Прогресс заданий = накопительный счётчик минус «снимок» на начало дня.
// ----------------------------------------------------------------------------
const DAILY_QUESTS = [
  { id:'dq_kill',   icon:'⚔️', name:'Истребление', metric:'kills',       goal:30, desc:'Убей 30 мобов в походах',     reward:{ gold:150 } },
  { id:'dq_exped',  icon:'🪜', name:'Походы',       metric:'expeditions', goal:5,  desc:'Соверши 5 походов',           reward:{ gold:150 } },
  { id:'dq_boss',   icon:'🐲', name:'Босс дня',     metric:'bossKills',   goal:1,  desc:'Победи 1 босса',             reward:{ sparks:80 } },
  { id:'dq_arena',  icon:'🤺', name:'Арена',        metric:'pvpWins',     goal:3,  desc:'Победи 3 раза на Арене',     reward:{ gold:200 } },
  { id:'dq_gather', icon:'⛏️', name:'Заготовка',    metric:'gathered',    goal:20, desc:'Добудь 20 ресурсов руками',  reward:{ gold:120 } },
  { id:'dq_craft',  icon:'🔨', name:'Ремесло',      metric:'crafted',     goal:3,  desc:'Создай 3 предмета',          reward:{ sparks:60 } },
];
// Бонус за выполнение ВСЕХ ежедневных заданий
const DAILY_ALL_REWARD = { gold:500, souls:1 };

// Создать конкретный предмет сета заданной рарности (рарность множит статы).
function makeSetItem(setId, slot, rarityKey) {
  const set = GEAR_SETS[setId];
  const it = JSON.parse(JSON.stringify(set.pieces[slot]));
  const m = (RARITIES[rarityKey] || RARITIES.common).mult;
  if (it.dmg) it.dmg = [Math.max(1, Math.round(it.dmg[0] * m)), Math.max(2, Math.round(it.dmg[1] * m))];
  if (it.armor) it.armor = Math.max(1, Math.round(it.armor * m));
  if (it.bonus) Object.keys(it.bonus).forEach((k) => { it.bonus[k] = Math.max(1, Math.round(it.bonus[k] * m)); });
  it.set = setId; it.setName = set.name; it.rarity = rarityKey;
  it.durability = [1000, 1000];
  return it;
}

// --- Премиум-лавка (Фаза 2): сетовые предметы за Души ---
// Цена части по рарности (привязка ~$0.10/душа → $3/$5/$7/$10).
const PREMIUM_PIECE_PRICE = { rare: 30, epic: 50, legendary: 70, mythic: 100 };
// Премиум-аккаунт (Фаза 3): цена за 30 дней.
const PREMIUM_STARS = 300;
const PREMIUM_SOULS = 55;
const PREMIUM_DAYS = 30;
const PREMIUM_RARITIES = ['rare', 'epic', 'legendary', 'mythic'];
// Цена за весь сет = цена части × число частей × 0.7 (скидка за комплект), округление до 5.
function premiumSetPrice(setId, rarity) {
  const set = GEAR_SETS[setId];
  if (!set || !PREMIUM_PIECE_PRICE[rarity]) return 0;
  const n = Object.keys(set.pieces).length;
  return Math.round((PREMIUM_PIECE_PRICE[rarity] * n * 0.7) / 5) * 5;
}

// ----------------------------------------------------------------------------
// ЗДАНИЯ ВАВИЛОНСКОЙ БАШНИ (раздел «Техзадание» → Вавилонская башня)
// ----------------------------------------------------------------------------
const TOWER_BUILDINGS = [
  { id:'stats',     name:'Покои героя',   icon:'🧝', desc:'Экипировка, рюкзак, статы, дары дня и коллекция сетов.' },
  { id:'stairs',    name:'Лестница в Небо',icon:'🪜', desc:'Спуститься в миры и выбрать локацию для похода.' },
  { id:'lower',     name:'Нижний мир',    icon:'🏘️', desc:'Города и шахты смертных: пассивная добыча ресурсов во времени (раздел GDD «нижний мир»).' },
  { id:'arena',     name:'Арена',         icon:'⚔️', desc:'Тренировочные бои с двойником ради опыта.' },
  { id:'workshops', name:'Мастерские',    icon:'🔨', desc:'Переработка ресурсов и создание оружия, брони, бижутерии.' },
  { id:'lab',       name:'Лаборатории',   icon:'⚗️', desc:'Эликсиры, зелья и мази.' },
  { id:'shop',      name:'Магазин',       icon:'🏪', desc:'Купить ресурсы и расходники за золото, продать трофеи.' },
  { id:'academy',   name:'Академия',      icon:'📚', desc:'База знаний об открытых мирах и статистика.' },
  { id:'market',    name:'Барахолка',     icon:'🏷️', desc:'Торговля между игроками: выставляй лоты и покупай у других (раздел GDD «Барахолка»).' },
  { id:'tavern',    name:'Таверна',       icon:'🍺', desc:'Азартные игры на золото: кости, напёрстки и лотерея (раздел GDD «Таверна»).' },
  { id:'bank',      name:'Банк',          icon:'🏛️', desc:'Обмен Душ на Золото и Искры (монетизация GDD).' },
  { id:'clans',     name:'Кланы',         icon:'🛡️', desc:'Объедините полубогов в клан: общая казна и пассивный бонус всем участникам (раздел GDD «кланы»).' },
  { id:'chat',      name:'Чат мира',      icon:'💬', desc:'Общий живой чат всех полубогов.' },
  { id:'mageguild', name:'Гильдия магов', icon:'🔮', desc:'Членство, ранги, улучшение и изучение заклинаний (раздел GDD «Гильдия магов»).' },
  { id:'council',   name:'Совет старейшин',icon:'📜', desc:'Журнал заданий — большая часть квестов берётся здесь.' },
];

// ----------------------------------------------------------------------------
// НИЖНИЙ МИР (раздел GDD «нижний мир»): смертные пассивно добывают ресурсы.
// Постройки повышаются за золото; Город поднимает добычу всех шахт.
// base — добыча в час на 1 уровень. Накопление офлайн ограничено LOWER_CAP_HOURS.
// ----------------------------------------------------------------------------
const LOWER_BUILDINGS = {
  city:    { name:'Город',       icon:'🏰', res:'gold',  base:12, desc:'Подати с горожан. Каждый уровень +5% к добыче всех шахт.' },
  sawmill: { name:'Лесопилка',   icon:'🪓', res:'log',   base:18, desc:'Смертные валят лес — бревно.' },
  quarry:  { name:'Каменоломня', icon:'🪨', res:'stone', base:16, desc:'Добыча камня.' },
  mine:    { name:'Рудник',      icon:'⛏️', res:'ore',   base:12, desc:'Добыча руды.' },
  farm:    { name:'Ферма',       icon:'🌾', res:'fiber', base:14, desc:'Лён и волокно.' },
};
const LOWER_ORDER = ['city', 'sawmill', 'quarry', 'mine', 'farm'];
const LOWER_CAP_BASE = 12;     // базовый лимит офлайн-накопления (часов); +2 ч за уровень Города
const LOWER_BUILD_LEVEL = 10;  // с какого уровня героя открывается стройка
const LOWER_CAP_HOURS = 12;    // (совместимость; фактический лимит считает lowerCapHours())

// ----------------------------------------------------------------------------
// КВЕСТЫ (раздел «Квэсты») с «градиентом» 10/100/1000.
// type: kill|gather|craft|gold|locations
// ----------------------------------------------------------------------------
const QUESTS = [
  { id:'q_descend', name:'Спуститься вниз', type:'locations', goal:1,
    desc:'Достигни Лестницы в Небо и соверши первый поход в мир смертных.', reward:{ gold:100, souls:1 } },
  { id:'q_kill', name:'Истребитель тварей', type:'kill', goal:[10,100,1000],
    desc:'Убей мобов. Градиент 10 / 100 / 1000.', reward:{ gold:50, sparks:50 } },
  { id:'q_gather', name:'Заготовщик', type:'gather', goal:[10,100,1000],
    desc:'Добудь ресурсы своими руками. Градиент 10 / 100 / 1000.', reward:{ gold:40, sparks:40 } },
  { id:'q_craft', name:'Мастеровой', type:'craft', goal:[1,10,100],
    desc:'Создай предметы в мастерских. Градиент 1 / 10 / 100.', reward:{ gold:60, sparks:60 } },
  { id:'q_gold', name:'Стяжатель', type:'gold', goal:[100,1000,10000],
    desc:'Накопи золото. Градиент 100 / 1000 / 10000.', reward:{ sparks:100 } },
  { id:'q_explore', name:'Первопроходец', type:'locations', goal:[3,12,30],
    desc:'Побывай в разных локациях миров. Градиент 3 / 12 / 30.', reward:{ gold:80, souls:1 } },
  { id:'q_pvp',    name:'ПвП воин',          type:'pvp',    goal:[1,10,50],
    desc:'Победи других игроков на арене. Градиент 1 / 10 / 50.', reward:{ gold:200, sparks:200 } },
  { id:'q_boss',   name:'Охотник на боссов', type:'boss',   goal:[1,5,20],
    desc:'Сразись и победи боссов в мирах. Градиент 1 / 5 / 20.', reward:{ gold:300, souls:1 } },
  { id:'q_spells', name:'Мастер магии',       type:'spells', goal:[3,8,12],
    desc:'Изучи заклинания. Градиент 3 / 8 / 12.', reward:{ sparks:300 } },
];
