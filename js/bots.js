/*
 * Боты арены «Вавилон».
 * Детерминированно генерируем популяцию «игроков»-ботов: на низких уровнях их
 * много, на высоких — мало (по убывающей от 73 до 3 на уровень). На арене с ними
 * можно сразиться так же, как с реальными соперниками, — особенно когда живых
 * игроков рядом по силе нет. Ростер стабилен между сессиями (сид фиксирован).
 */

// mulberry32 — детерминированный ГПСЧ, чтобы имена/статы ботов не менялись
function _botRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _BOT_EPITHET = [
  'Грозный', 'Тёмный', 'Багровый', 'Стальной', 'Дикий', 'Бледный', 'Хитрый',
  'Яростный', 'Седой', 'Бессмертный', 'Кровавый', 'Молчаливый', 'Жестокий',
  'Хладный', 'Пламенный', 'Призрачный', 'Северный', 'Древний', 'Безумный', 'Золотой',
];
const _BOT_NAME = [
  'Вальдред', 'Морган', 'Кейн', 'Дрейк', 'Торн', 'Гримм', 'Рагнар', 'Корвин',
  'Альдор', 'Сваргон', 'Дамир', 'Ксандр', 'Лютвиг', 'Ворон', 'Бранд', 'Хальгар',
  'Зейн', 'Мордред', 'Гарм', 'Эймар', 'Фенрир', 'Ульрик', 'Тревор', 'Снорри',
  'Бьёрн', 'Каэль', 'Дориан', 'Орм', 'Веллер', 'Скар',
];

function _buildBots() {
  const rng = _botRng(20260614);
  const bots = [];
  const used = new Set();
  let id = 0;
  // Для каждого доступного уровня (1..15) — убывающее число бойцов: 73, 68, ... 3.
  for (let L = 1; L <= 15; L++) {
    const count = 73 - (L - 1) * 5;
    for (let i = 0; i < count; i++) {
      id++;
      const ep = _BOT_EPITHET[Math.floor(rng() * _BOT_EPITHET.length)];
      const nm = _BOT_NAME[Math.floor(rng() * _BOT_NAME.length)];
      let name = `${ep} ${nm}`;
      let dup = 2;
      while (used.has(name)) { name = `${ep} ${nm} ${dup}`; dup++; }
      used.add(name);
      const jHp = Math.floor(rng() * (L * 4 + 6));
      const jDmg = Math.floor(rng() * (L + 2));
      bots.push({
        userId: `bot_${id}`,
        isBot: true,
        name,
        xpLevel: L,
        danger: L,
        maxHp: 90 + L * 10 + jHp,
        dmgMin: 2 + Math.round(L * 1.0) + Math.floor(jDmg / 2),
        dmgMax: 6 + Math.round(L * 2.2) + jDmg,
        armor: Math.round(L * 0.6),
        defense: 8 + Math.round(L * 1.5),
      });
    }
  }
  return bots;
}

const BOTS = _buildBots();
if (typeof window !== 'undefined') window.BOTS = BOTS;
