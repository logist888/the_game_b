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
];

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
  lab:       [['hp_elixir',1],['mp_elixir',1],['poison_vial',2],['str_balm',3]],
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

  // --- БУТЫЛКИ: эликсиры/зелья/мази (раздел «Бутылки») ---
  { id:'hp_elixir',  ws:'lab', name:'Эликсир жизни', in:{herb:5},
    out:{ item:{ name:'Эликсир жизни', slot:null, type:'эликсир', use:{ heal:40 }, stack:true } } },
  { id:'mp_elixir',  ws:'lab', name:'Эликсир маны', in:{mica:5},
    out:{ item:{ name:'Эликсир маны', slot:null, type:'эликсир', use:{ mana:40 }, stack:true } } },
  { id:'poison_vial',ws:'lab', name:'Зелье яда', in:{mushroom:5},
    out:{ item:{ name:'Зелье яда', slot:null, type:'зелье', use:{ throwDmg:25 }, stack:true } } },
  { id:'str_balm',   ws:'lab', name:'Мазь силы', in:{herb:3, mushroom:3},
    out:{ item:{ name:'Мазь силы', slot:null, type:'мазь', use:{ buff:{ str:5 }, mins:30 }, stack:true } } },
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

// ----------------------------------------------------------------------------
// ЗДАНИЯ ВАВИЛОНСКОЙ БАШНИ (раздел «Техзадание» → Вавилонская башня)
// ----------------------------------------------------------------------------
const TOWER_BUILDINGS = [
  { id:'stats',     name:'Покои героя',   icon:'🧝', desc:'Статы, навыки, экипировка и магия полубога.' },
  { id:'stairs',    name:'Лестница в Небо',icon:'🪜', desc:'Спуститься в миры и выбрать локацию для похода.' },
  { id:'lower',     name:'Нижний мир',    icon:'🏘️', desc:'Города и шахты смертных: пассивная добыча ресурсов во времени (раздел GDD «нижний мир»).' },
  { id:'arena',     name:'Арена',         icon:'⚔️', desc:'Тренировочные бои с двойником ради опыта.' },
  { id:'workshops', name:'Мастерские',    icon:'🔨', desc:'Переработка ресурсов и создание оружия, брони, бижутерии.' },
  { id:'lab',       name:'Лаборатории',   icon:'⚗️', desc:'Эликсиры, зелья и мази.' },
  { id:'shop',      name:'Магазин',       icon:'🏪', desc:'Купить ресурсы и расходники за золото, продать трофеи.' },
  { id:'academy',   name:'Академия',      icon:'📚', desc:'База знаний об открытых мирах и статистика.' },
  { id:'codex',     name:'Коллекция',     icon:'🗂️', desc:'Кодекс классовых сетов: какие части и какой рарности уже найдены, и какие сет-бонусы дают.' },
  { id:'market',    name:'Барахолка',     icon:'🏷️', desc:'Торговля между игроками: выставляй лоты и покупай у других (раздел GDD «Барахолка»).' },
  { id:'tavern',    name:'Таверна',       icon:'🍺', desc:'Азартные игры на золото: кости, напёрстки и лотерея (раздел GDD «Таверна»).' },
  { id:'bank',      name:'Банк',          icon:'🏛️', desc:'Обмен Душ на Золото и Искры (монетизация GDD).' },
  { id:'clans',     name:'Кланы',         icon:'🛡️', desc:'Объедините полубогов в клан: общая казна и пассивный бонус всем участникам (раздел GDD «кланы»).' },
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
const LOWER_CAP_HOURS = 12; // максимум накопления, пока игрок офлайн

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
