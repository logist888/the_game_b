/**
 * Cloudflare Worker: облачные сохранения «Проект Вавилон»
 *
 * Env vars (Cloudflare dashboard → Worker → Settings → Variables):
 *   BOT_TOKEN  — токен бота из BotFather (секрет, не разглашать)
 *   BOT_HANDLE — username бота без @, например babylongame_bot
 *   ADMIN_KEY  — произвольный секрет для защиты /admin (придумайте сами)
 *
 * KV namespace:
 *   SAVES — создать в dashboard и привязать к worker под именем SAVES
 *
 * Маршруты:
 *   GET  /save?user_id=<id>          → возвращает JSON сохранения (+ _pendingBonus/_refCount)
 *   POST /save  body: {initData, save} → верифицирует подпись Telegram, записывает save
 *   GET  /referrals                  → топ-10 рефереров (публичный)
 *   GET  /admin?key=<ADMIN_KEY>      → список всех игроков (только для админа)
 */

// Разрешённые источники (origin) для CORS. Прод переехал на Cloudflare Pages.
const ALLOWED_ORIGINS = [
  'https://babylon-af9.pages.dev',
  'https://logist888.github.io',
];
const ALLOWED_ORIGIN = 'https://babylon-af9.pages.dev'; // дефолт, если origin не из списка
const GAME_URL = 'https://babylon-af9.pages.dev/';

// Отправить сообщение пользователю через бот
async function tgNotify(botToken, botHandle, chatId, html) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        // web_app-кнопка открывает Mini App напрямую (работает в личке с ботом,
        // не требует настройки Main Mini App в BotFather).
        reply_markup: JSON.stringify({
          inline_keyboard: [[{ text: '🎮 Открыть игру', web_app: { url: GAME_URL } }]],
        }),
      }),
    });
  } catch (e) {}
}

// Вызов Telegram Bot API
async function tgApi(botToken, method, params) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json();
}

// --- Монетизация (Фаза 1): паки душ за Telegram Stars (XTR) ---
// stars — цена в звёздах, souls — сколько душ начисляем. Сервер — источник истины.
const SOUL_PACKS = {
  xs: { stars: 10,   souls: 1,   title: 'Одна душа' },
  s:  { stars: 60,   souls: 10,  title: 'Горсть душ' },
  m:  { stars: 300,  souls: 55,  title: 'Мешочек душ' },
  l:  { stars: 1000, souls: 200, title: 'Сундук душ' },
  xl: { stars: 2500, souls: 550, title: 'Сокровище душ' },
};

// Премиум-аккаунт (Фаза 3): цена в звёздах и срок в днях.
const PREMIUM_ACCOUNT_STARS = 300;
const PREMIUM_ACCOUNT_DAYS = 30;

function corsHeaders(origin) {
  // эхо-разрешаем источник из белого списка (и любые превью *.pages.dev этого проекта)
  const ok = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.babylon-af9\.pages\.dev$/.test(origin);
  const allow = ok ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// --- Модерация чата: фильтр мата (стоп-слова) ---
// Список комнат мирового чата: «Глобальный» + по одной на каждый язык.
const CHAT_ROOMS = ['global', 'en', 'ru', 'es', 'de', 'fr', 'pt', 'it', 'zh', 'ja', 'ko', 'th'];
const CHAT_TEMP_BAN_MS = 60 * 60 * 1000; // час
// Корни матерных слов (рус + базовый англ). Проверка по нормализованному тексту.
const PROFANITY_ROOTS = [
  'хуй', 'хуе', 'хуё', 'хуя', 'пизд', 'ебат', 'ебал', 'ебан', 'ебуч', 'еблан', 'ёбан', 'ёбну', 'ебну',
  'бляд', 'блят', 'бля', 'сука', 'суки', 'сук', 'мудак', 'муда', 'мудил', 'пидор', 'пидар',
  'гондон', 'гандон', 'залуп', 'манда', 'дроч', 'выеб', 'наеб', 'отъеб', 'отьеб', 'уеб', 'долбоёб',
  'долбоеб', 'хер', 'ублюд', 'шлюх', 'проститут', 'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick',
  'pussy', 'faggot', 'nigger', 'whore',
];
// Базовая нормализация: нижний регистр, удаление неалфавитных символов (чтобы «х у й» → «хуй»)
// и схлопывание повторов. Скрипт (латиница/кириллица) сохраняется.
function _normBase(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-zа-яё]+/gi, '')
    .replace(/(.)\1{2,}/g, '$1$1');
}
// Доп. свёртка латинских лук-алайков в кириллицу — ловит обход вида «cyka» → «сука».
function _foldLookalike(t) {
  const map = { '0': 'о', '1': 'и', '3': 'е', '4': 'ч', a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', b: 'в', h: 'н', m: 'м', t: 'т' };
  return t.replace(/[0134aeopcxykbhmt]/g, (ch) => map[ch] || ch);
}
function hasProfanity(text) {
  const base = _normBase(text);          // прямые совпадения в обоих алфавитах (fuck, сука)
  const folded = _foldLookalike(base);   // обход кириллицы латиницей (cyka → сука)
  return PROFANITY_ROOTS.some((r) => base.includes(r) || folded.includes(r));
}

// Верификация initData по алгоритму Telegram WebApp
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const enc = new TextEncoder();

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const secretKeyBytes = await crypto.subtle.sign('HMAC', baseKey, enc.encode(botToken));

  // signature = HMAC-SHA256(secret_key, data_check_string)
  const sigKey = await crypto.subtle.importKey(
    'raw', secretKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', sigKey, enc.encode(dataCheckString));

  const hexSig = [...new Uint8Array(sigBytes)]
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return hexSig === hash;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);

    // --- GET /save?user_id=123 ---
    if (url.pathname === '/save' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id');
      if (!userId || !/^\d+$/.test(userId)) {
        return new Response('Bad user_id', { status: 400, headers });
      }
      const data = await env.SAVES.get(`save_${userId}`, 'json');
      if (data) {
        // Inject pending referral bonus (consume it so it's only delivered once)
        const bonus = await env.SAVES.get(`bonus_${userId}`, 'json');
        if (bonus) {
          data._pendingBonus = bonus;
          await env.SAVES.delete(`bonus_${userId}`);
        }
        // Inject current referral count
        const refs = await env.SAVES.get(`refs_${userId}`, 'json');
        if (refs) data._refCount = refs.count || 0;
        // Inject pending marketplace payout (gold from sold lots), consume once
        const payout = await env.SAVES.get(`payout_${userId}`, 'json');
        if (payout) {
          data._pendingMarketGold = payout;
          await env.SAVES.delete(`payout_${userId}`);
        }
        // Inject pending souls payout (from lots sold for souls), consume once
        const spayout = await env.SAVES.get(`soulpayout_${userId}`, 'json');
        if (spayout) {
          data._pendingMarketSouls = spayout;
          await env.SAVES.delete(`soulpayout_${userId}`);
        }
        // Inject returned items (e.g. legacy lots pulled from the shelf), consume once
        const iret = await env.SAVES.get(`itemreturn_${userId}`, 'json');
        if (iret && iret.length) {
          data._pendingMarketItems = iret;
          await env.SAVES.delete(`itemreturn_${userId}`);
        }
      }
      return new Response(JSON.stringify(data || null), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // --- POST /save  body: { initData, save } ---
    if (url.pathname === '/save' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch {
        return new Response('Invalid JSON', { status: 400, headers });
      }

      const { initData, save } = body;
      if (!initData || !save) {
        return new Response('Missing initData or save', { status: 400, headers });
      }

      // Верифицируем подпись
      const valid = await verifyInitData(initData, env.BOT_TOKEN);
      if (!valid) {
        return new Response('Unauthorized', { status: 401, headers });
      }

      // Извлекаем userId из initData (доверяем после верификации)
      const params = new URLSearchParams(initData);
      let userId;
      try {
        userId = JSON.parse(params.get('user')).id;
      } catch {
        return new Response('Cannot parse user', { status: 400, headers });
      }

      // Регистрируем реферал один раз (если игрок новый и пришёл по ссылке)
      const { referredBy, refRegistered } = save;
      if (referredBy && !refRegistered && String(referredBy) !== String(userId)) {
        save.refRegistered = true;

        // Увеличиваем счётчик рефералов у пригласившего
        const refKey = `refs_${referredBy}`;
        const existingRefs = await env.SAVES.get(refKey, 'json') || { count: 0, name: '' };
        existingRefs.count = (existingRefs.count || 0) + 1;
        const referrerSave = await env.SAVES.get(`save_${referredBy}`, 'json');
        if (referrerSave && referrerSave.name) existingRefs.name = referrerSave.name;
        await env.SAVES.put(refKey, JSON.stringify(existingRefs));

        // Начисляем 200 золота пригласившему
        const bonusKey = `bonus_${referredBy}`;
        const existingBonus = (await env.SAVES.get(bonusKey, 'json')) || 0;
        await env.SAVES.put(bonusKey, JSON.stringify(existingBonus + 200));

        // Уведомляем пригласившего в Telegram
        if (env.BOT_TOKEN && env.BOT_HANDLE) {
          await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, referredBy,
            `🎉 <b>Новый игрок!</b>\n${save.name || 'Полубог'} вступил в «Вавилон» по вашей ссылке.\nВы получили <b>+200 🪙</b> золота!`
          );
        }
      }

      // Сохраняем (TTL 365 дней)
      await env.SAVES.put(`save_${userId}`, JSON.stringify(save), {
        expirationTtl: 60 * 60 * 24 * 365,
      });

      return new Response('OK', { headers });
    }

    // --- POST /notify  body: { initData, type, payload } ---
    if (url.pathname === '/notify' && request.method === 'POST') {
      if (!env.BOT_TOKEN || !env.BOT_HANDLE) {
        return new Response('Not configured', { status: 503, headers });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response('Invalid JSON', { status: 400, headers });
      }
      const { initData, type, payload } = body;
      if (!initData || !type) return new Response('Missing fields', { status: 400, headers });

      const valid = await verifyInitData(initData, env.BOT_TOKEN);
      if (!valid) return new Response('Unauthorized', { status: 401, headers });

      const params = new URLSearchParams(initData);
      let userId;
      try { userId = JSON.parse(params.get('user')).id; } catch {
        return new Response('Cannot parse user', { status: 400, headers });
      }

      const templates = {
        levelup: (p) => `🎖 <b>Уровень ${p.level}!</b>\nВаш герой в «Вавилоне» достиг <b>${p.level} уровня</b>.\n<i>Продолжайте своё путешествие!</i>`,
      };
      const fn = templates[type];
      if (!fn) return new Response('Unknown type', { status: 400, headers });

      await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, userId, fn(payload || {}));
      return new Response('OK', { headers });
    }

    // --- POST /hp-notify  body: { initData, secsUntilFull } ---
    if (url.pathname === '/hp-notify' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch {
        return new Response('Invalid JSON', { status: 400, headers });
      }
      const { initData, secsUntilFull } = body;
      if (!initData || !secsUntilFull) return new Response('Missing fields', { status: 400, headers });

      const valid = await verifyInitData(initData, env.BOT_TOKEN);
      if (!valid) return new Response('Unauthorized', { status: 401, headers });

      const params = new URLSearchParams(initData);
      let userId, name;
      try {
        const u = JSON.parse(params.get('user'));
        userId = u.id;
        name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Герой';
      } catch { return new Response('Cannot parse user', { status: 400, headers }); }

      const notifyAt = Date.now() + Math.min(secsUntilFull, 86400) * 1000; // макс 24 ч
      await env.SAVES.put(`hpnotify_${userId}`, JSON.stringify({ chatId: userId, name, notifyAt }), {
        expirationTtl: 86400 + 3600,
      });
      return new Response('OK', { headers });
    }

    // --- DELETE /hp-notify  body: { initData } --- отмена уведомления (HP восстановился)
    if (url.pathname === '/hp-notify' && request.method === 'DELETE') {
      let body;
      try { body = await request.json(); } catch {
        return new Response('Invalid JSON', { status: 400, headers });
      }
      const { initData } = body;
      if (!initData) return new Response('Missing initData', { status: 400, headers });

      const valid = await verifyInitData(initData, env.BOT_TOKEN);
      if (!valid) return new Response('Unauthorized', { status: 401, headers });

      const params = new URLSearchParams(initData);
      let userId;
      try { userId = JSON.parse(params.get('user')).id; } catch {
        return new Response('Cannot parse user', { status: 400, headers });
      }
      await env.SAVES.delete(`hpnotify_${userId}`);
      return new Response('OK', { headers });
    }

    // --- GET /arena/opponents?user_id=<id> --- соперники близкие по силе
    if (url.pathname === '/arena/opponents' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id') || '';
      const allPlayers = [];
      let cursor;
      do {
        const listed = await env.SAVES.list({ prefix: 'save_', cursor });
        const entries = await Promise.all(
          listed.keys.map(async ({ name }) => {
            const data = await env.SAVES.get(name, 'json');
            if (!data || name === `save_${userId}`) return null;
            return {
              userId: name.slice(5),
              name: data.name || '—',
              xpLevel: data.xpLevel || 1,
              danger: data.danger || 1,
              maxHp: data.maxHp || 100,
              dmgMin: data.derived?.dmgMin || 3,
              dmgMax: data.derived?.dmgMax || 8,
              armor: data.derived?.armor || 0,
              defense: data.derived?.defense || 10,
            };
          })
        );
        allPlayers.push(...entries.filter(Boolean));
        cursor = listed.list_complete ? undefined : listed.cursor;
      } while (cursor);

      // Берём игроков ближайших по danger, с лёгким перемешиванием
      const myDanger = parseInt(url.searchParams.get('danger') || '1');
      allPlayers.sort((a, b) => Math.abs(a.danger - myDanger) - Math.abs(b.danger - myDanger));
      const pool = allPlayers.slice(0, 20);
      pool.sort(() => Math.random() - 0.5);

      return new Response(JSON.stringify(pool.slice(0, 6)), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // --- POST /arena/result  body: { initData, targetId, targetName, won } ---
    if (url.pathname === '/arena/result' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch {
        return new Response('Invalid JSON', { status: 400, headers });
      }
      const { initData, targetId, targetName, won } = body;
      if (!initData || !targetId) return new Response('Missing fields', { status: 400, headers });

      const valid = await verifyInitData(initData, env.BOT_TOKEN);
      if (!valid) return new Response('Unauthorized', { status: 401, headers });

      const params = new URLSearchParams(initData);
      let attackerId, attackerName;
      try {
        const u = JSON.parse(params.get('user'));
        attackerId = u.id;
        attackerName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Герой';
      } catch { return new Response('Cannot parse user', { status: 400, headers }); }

      // Уведомляем соперника
      if (env.BOT_TOKEN && env.BOT_HANDLE) {
        const msg = won
          ? `⚔️ <b>${attackerName}</b> атаковал тебя на арене и <b>победил</b>.\nПродолжай тренироваться!`
          : `🛡 <b>${attackerName}</b> атаковал тебя на арене, но <b>потерпел поражение</b>!\nТвоя защита держится!`;
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, targetId, msg);
      }

      return new Response('OK', { headers });
    }

    // --- GET /leaderboard --- топ-10 по уровню XP (публичный)
    if (url.pathname === '/leaderboard' && request.method === 'GET') {
      const players = [];
      let cursor;
      do {
        const listed = await env.SAVES.list({ prefix: 'save_', cursor });
        const entries = await Promise.all(
          listed.keys.map(async ({ name }) => {
            const data = await env.SAVES.get(name, 'json');
            if (!data) return null;
            return {
              name: data.name || '—',
              xpLevel: data.xpLevel || 1,
              xp: data.xp || 0,
              kills: data.counters?.kills || 0,
              danger: data.danger || 1,
              prem: (data.premiumUntil || 0) > Date.now(),
            };
          })
        );
        players.push(...entries.filter(Boolean));
        cursor = listed.list_complete ? undefined : listed.cursor;
      } while (cursor);

      players.sort((a, b) => (b.xpLevel - a.xpLevel) || (b.xp - a.xp));

      return new Response(JSON.stringify(players.slice(0, 10)), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    // --- GET /referrals --- топ-10 рефереров (публичный)
    if (url.pathname === '/referrals' && request.method === 'GET') {
      const referrers = [];
      let cursor;
      do {
        const listed = await env.SAVES.list({ prefix: 'refs_', cursor });
        const entries = await Promise.all(
          listed.keys.map(async ({ name }) => {
            const data = await env.SAVES.get(name, 'json');
            return data ? { userId: name.slice(5), ...data } : null;
          })
        );
        referrers.push(...entries.filter(Boolean));
        cursor = listed.list_complete ? undefined : listed.cursor;
      } while (cursor);

      referrers.sort((a, b) => (b.count || 0) - (a.count || 0));

      return new Response(JSON.stringify(referrers.slice(0, 10)), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      });
    }

    // ==================== БАРАХОЛКА (раздел GDD «Барахолка») ====================
    // Модель клиент-авторитарная (как и сохранения): золото игрок ведёт у себя,
    // а сервер хранит ЭСКРОУ выставленных предметов (чтобы их нельзя было
    // продублировать) и накапливает ВЫПЛАТЫ продавцу (доставляются при синхронизации).

    const MARKET_TTL = 60 * 60 * 24 * 30; // лоты живут 30 дней
    const MARKET_MAX_PER_SELLER = 12;     // лимит активных лотов на игрока

    // Разбор и верификация пользователя из initData → { id, name } или null
    const userFromInitData = async (initData) => {
      if (!initData) return null;
      if (!(await verifyInitData(initData, env.BOT_TOKEN))) return null;
      try {
        const u = JSON.parse(new URLSearchParams(initData).get('user'));
        return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Полубог' };
      } catch { return null; }
    };

    const listAllLots = async () => {
      const lots = [];
      let cursor;
      do {
        const listed = await env.SAVES.list({ prefix: 'market_', cursor });
        const entries = await Promise.all(listed.keys.map(({ name }) => env.SAVES.get(name, 'json')));
        lots.push(...entries.filter(Boolean));
        cursor = listed.list_complete ? undefined : listed.cursor;
      } while (cursor);
      return lots;
    };

    // --- GET /market --- все активные лоты (для просмотра и «мои лоты») ---
    if (url.pathname === '/market' && request.method === 'GET') {
      let lots = await listAllLots();
      // Разовая миграция: сетовые предметы теперь продаются только за Души —
      // снимаем старые «золотые» лоты сетовых вещей и возвращаем их продавцам.
      const migrated = await env.SAVES.get('mig_souls_v1');
      if (!migrated) {
        const removed = new Set();
        for (const l of lots) {
          if (l.kind === 'item' && l.item && l.item.set && l.currency !== 'souls') {
            await env.SAVES.delete(`market_${l.id}`);
            const k = `itemreturn_${l.sellerId}`;
            const arr = (await env.SAVES.get(k, 'json')) || [];
            arr.push(l.item);
            await env.SAVES.put(k, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 365 });
            removed.add(l.id);
          }
        }
        await env.SAVES.put('mig_souls_v1', '1');
        lots = lots.filter((l) => !removed.has(l.id));
      }
      lots.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return new Response(JSON.stringify(lots), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
      });
    }

    // --- POST /market/list  body: { initData, lot } --- выставить лот ---
    if (url.pathname === '/market/list' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const seller = await userFromInitData(body.initData);
      if (!seller) return new Response('Unauthorized', { status: 401, headers });

      const lot = body.lot || {};
      const price = Math.floor(Number(lot.price));
      if (!(price > 0) || price > 1e9) return new Response('Bad price', { status: 400, headers });
      if (lot.kind === 'res') {
        if (typeof lot.res !== 'string' || !(Math.floor(Number(lot.qty)) > 0)) return new Response('Bad resource lot', { status: 400, headers });
      } else if (lot.kind === 'item') {
        if (!lot.item || typeof lot.item !== 'object' || !lot.item.name) return new Response('Bad item lot', { status: 400, headers });
      } else {
        return new Response('Bad kind', { status: 400, headers });
      }

      const mine = (await listAllLots()).filter((l) => String(l.sellerId) === String(seller.id));
      if (mine.length >= MARKET_MAX_PER_SELLER) return new Response('Too many lots', { status: 429, headers });

      const currency = lot.currency === 'souls' ? 'souls' : 'gold';
      const id = crypto.randomUUID();
      const record = {
        id, sellerId: String(seller.id), sellerName: seller.name,
        kind: lot.kind, price, currency, createdAt: Date.now(),
        ...(lot.kind === 'res' ? { res: lot.res, qty: Math.floor(Number(lot.qty)) } : { item: lot.item }),
      };
      await env.SAVES.put(`market_${id}`, JSON.stringify(record), { expirationTtl: MARKET_TTL });
      return new Response(JSON.stringify({ ok: true, id }), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // --- POST /market/buy  body: { initData, id } --- купить лот ---
    if (url.pathname === '/market/buy' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const buyer = await userFromInitData(body.initData);
      if (!buyer) return new Response('Unauthorized', { status: 401, headers });
      if (!body.id) return new Response('Missing id', { status: 400, headers });

      const key = `market_${body.id}`;
      const lot = await env.SAVES.get(key, 'json');
      if (!lot) return new Response(JSON.stringify({ error: 'gone' }), { status: 409, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (String(lot.sellerId) === String(buyer.id)) return new Response(JSON.stringify({ error: 'own' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });

      // Снимаем лот первым делом — снижает шанс двойной покупки
      await env.SAVES.delete(key);

      const souls = lot.currency === 'souls';
      // Выплата продавцу за вычетом комиссии: золото 1%, души 10% (сжигаются).
      const net = souls ? Math.max(1, Math.floor(lot.price * 0.90)) : Math.max(1, Math.floor(lot.price * 0.99));
      const payoutKey = souls ? `soulpayout_${lot.sellerId}` : `payout_${lot.sellerId}`;
      const prev = (await env.SAVES.get(payoutKey, 'json')) || 0;
      await env.SAVES.put(payoutKey, JSON.stringify(prev + net), { expirationTtl: 60 * 60 * 24 * 365 });

      // Уведомляем продавца в Telegram
      if (env.BOT_TOKEN && env.BOT_HANDLE) {
        const what = lot.kind === 'res' ? `${lot.qty}× ресурса` : `«${lot.item.name}»`;
        const cur = souls ? `+${net} 👻` : `+${net} 🪙`;
        const fee = souls ? '10%' : '1%';
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, lot.sellerId,
          `💰 <b>Лот продан!</b>\n${buyer.name} купил ваш лот ${what}.\nВам начислено <b>${cur}</b> (после комиссии ${fee}).`);
      }

      return new Response(JSON.stringify({ ok: true, lot }), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // --- POST /market/cancel  body: { initData, id } --- снять свой лот ---
    if (url.pathname === '/market/cancel' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      if (!body.id) return new Response('Missing id', { status: 400, headers });

      const key = `market_${body.id}`;
      const lot = await env.SAVES.get(key, 'json');
      if (!lot) return new Response(JSON.stringify({ error: 'gone' }), { status: 409, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (String(lot.sellerId) !== String(user.id)) return new Response('Forbidden', { status: 403, headers });

      await env.SAVES.delete(key);
      return new Response(JSON.stringify({ ok: true, lot }), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ==================== КЛАНЫ (раздел GDD «кланы / семьи») ====================
    // Клан хранит только список memberIds + казну; имена/уровни подтягиваются
    // из сохранений участников при чтении (живые данные, как на арене).

    const CLAN_MAX_MEMBERS = 20;
    const RAID_COOLDOWN_MS = 10 * 60 * 1000; // удар по боссу раз в 10 мин
    const RAID_BOSSES = ['Каменный голем', 'Гидра бездны', 'Тёмный титан', 'Пожиратель миров', 'Древний дракон'];
    const raidName = (tier) => RAID_BOSSES[(tier - 1) % RAID_BOSSES.length] + (tier > RAID_BOSSES.length ? ` +${Math.floor((tier - 1) / RAID_BOSSES.length)}` : '');
    const raidHpMax = (tier, size) => 1000 * tier * (1 + Math.floor(Math.max(1, size) / 3)); // соло (клан 1) = 1000×тир
    const newRaid = (tier, size) => { const hp = raidHpMax(tier, size); return { tier, hpMax: hp, hp, contributors: {}, hits: {}, startedAt: Date.now() }; };
    // приведение старых «раздутых» боссов к новой (меньшей) формуле, сохраняя % остатка
    const rescaleRaid = (raid, size) => { if (!raid) return; const fresh = raidHpMax(raid.tier, size); if (raid.hpMax > fresh) { const frac = raid.hp / raid.hpMax; raid.hpMax = fresh; raid.hp = Math.max(1, Math.round(fresh * frac)); } };
    const pushClanLog = (clan, text) => { clan.log = clan.log || []; clan.log.unshift({ text, ts: Date.now() }); if (clan.log.length > 30) clan.log.length = 30; };
    const saveName = async (id) => { const s = await env.SAVES.get(`save_${id}`, 'json'); return (s && s.name) || 'Полубог'; };
    const jsonResp = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

    // ===== Монетизация (Фаза 1): паки душ за Telegram Stars =====

    // GET /pay/packs — каталог паков для витрины (публичный)
    if (url.pathname === '/pay/packs' && request.method === 'GET') {
      const list = Object.entries(SOUL_PACKS).map(([id, p]) => ({ id, stars: p.stars, souls: p.souls, title: p.title }));
      return jsonResp(list);
    }

    // POST /pay/create-invoice  body: { initData, packId } | { initData, product:'premium' }
    if (url.pathname === '/pay/create-invoice' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      if (!env.BOT_TOKEN) return jsonResp({ error: 'no_bot' }, 500);

      // Премиум-аккаунт за Stars (Фаза 3)
      if (body.product === 'premium') {
        const payload = `prem:${PREMIUM_ACCOUNT_DAYS}:${user.id}`;
        const res = await tgApi(env.BOT_TOKEN, 'createInvoiceLink', {
          title: `👑 Премиум-аккаунт (${PREMIUM_ACCOUNT_DAYS} дн.)`,
          description: `Премиум-статус в «Вавилон» на ${PREMIUM_ACCOUNT_DAYS} дней.`,
          payload,
          currency: 'XTR',
          prices: [{ label: `👑 ${PREMIUM_ACCOUNT_DAYS} дн.`, amount: PREMIUM_ACCOUNT_STARS }],
        });
        if (!res || !res.ok || !res.result) return jsonResp({ error: 'invoice_failed', detail: res && res.description }, 502);
        return jsonResp({ url: res.result });
      }

      const pack = SOUL_PACKS[body.packId];
      if (!pack) return jsonResp({ error: 'bad_pack' }, 400);
      // payload зашивает пак и игрока — по нему начислим в вебхуке (≤128 байт)
      const payload = `souls:${body.packId}:${user.id}`;
      const res = await tgApi(env.BOT_TOKEN, 'createInvoiceLink', {
        title: `${pack.souls} 👻 — ${pack.title}`,
        description: `Покупка ${pack.souls} душ для «Вавилон».`,
        payload,
        currency: 'XTR',
        prices: [{ label: `${pack.souls} 👻`, amount: pack.stars }],
      });
      if (!res || !res.ok || !res.result) return jsonResp({ error: 'invoice_failed', detail: res && res.description }, 502);
      return jsonResp({ url: res.result });
    }

    // POST /bot/webhook — апдейты от Telegram (pre_checkout + successful_payment).
    // Защита: заголовок секрета, заданный при setWebhook (env.WEBHOOK_SECRET).
    if (url.pathname === '/bot/webhook' && request.method === 'POST') {
      if (env.WEBHOOK_SECRET) {
        const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
        if (got !== env.WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });
      }
      let upd; try { upd = await request.json(); } catch { return new Response('ok'); }

      // 1) Подтверждение перед оплатой — обязателен ответ в течение 10 сек
      if (upd.pre_checkout_query) {
        const q = upd.pre_checkout_query;
        const pl = typeof q.invoice_payload === 'string' ? q.invoice_payload.split(':') : [];
        const okItem = (pl[0] === 'souls' && SOUL_PACKS[pl[1]]) || pl[0] === 'prem';
        await tgApi(env.BOT_TOKEN, 'answerPreCheckoutQuery', okItem
          ? { pre_checkout_query_id: q.id, ok: true }
          : { pre_checkout_query_id: q.id, ok: false, error_message: 'Товар недоступен' });
        return new Response('ok');
      }

      // 2) Успешная оплата — начисляем в серверный кошелёк (идемпотентно)
      const sp = upd.message && upd.message.successful_payment;
      if (sp && typeof sp.invoice_payload === 'string') {
        const [kind, arg, uid] = sp.invoice_payload.split(':');
        const charge = sp.telegram_payment_charge_id;
        if (uid && charge) {
          const key = `wallet_${uid}`;
          const w = (await env.SAVES.get(key, 'json')) || { pending: 0, lifetime: 0, ledger: [] };
          const seen = (w.ledger || []).some((e) => e.charge === charge);
          if (!seen) {
            w.ledger = w.ledger || [];
            let note = '';
            if (kind === 'souls' && SOUL_PACKS[arg]) {
              const pack = SOUL_PACKS[arg];
              w.pending = (w.pending || 0) + pack.souls;
              w.lifetime = (w.lifetime || 0) + pack.souls;
              w.ledger.push({ charge, packId: arg, souls: pack.souls, stars: sp.total_amount, ts: Date.now() });
              note = `<b>${pack.souls} 👻</b> зачислятся на ваш счёт в течение 1–2 минут.`;
            } else if (kind === 'prem') {
              const days = parseInt(arg, 10) || PREMIUM_ACCOUNT_DAYS;
              w.premiumPendingDays = (w.premiumPendingDays || 0) + days;
              w.ledger.push({ charge, product: 'premium', days, stars: sp.total_amount, ts: Date.now() });
              note = `👑 <b>Премиум-аккаунт</b> на ${days} дн. активируется в течение 1–2 минут.`;
            }
            if (note) {
              if (w.ledger.length > 200) w.ledger = w.ledger.slice(-200);
              await env.SAVES.put(key, JSON.stringify(w));
              if (env.BOT_TOKEN && env.BOT_HANDLE) {
                await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, uid, `✅ <b>Оплата получена!</b>\n${note}`);
              }
            }
          }
        }
        return new Response('ok');
      }
      return new Response('ok');
    }

    // POST /pay/claim  body: { initData } — забрать начисленное (души и/или премиум)
    if (url.pathname === '/pay/claim' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const key = `wallet_${user.id}`;
      const w = (await env.SAVES.get(key, 'json')) || { pending: 0, lifetime: 0, ledger: [] };
      const amount = w.pending || 0;
      const premiumDays = w.premiumPendingDays || 0;
      if (amount > 0 || premiumDays > 0) {
        w.pending = 0;
        w.premiumPendingDays = 0;
        w.delivered = (w.delivered || 0) + amount;
        await env.SAVES.put(key, JSON.stringify(w));
      }
      return jsonResp({ souls: amount, premiumDays, lifetime: w.lifetime || 0 });
    }

    const loadAllClans = async () => {
      const clans = [];
      let cursor;
      do {
        const listed = await env.SAVES.list({ prefix: 'clan_', cursor });
        const entries = await Promise.all(listed.keys.map(({ name }) => env.SAVES.get(name, 'json')));
        clans.push(...entries.filter(Boolean));
        cursor = listed.list_complete ? undefined : listed.cursor;
      } while (cursor);
      return clans;
    };

    // --- GET /clans --- список кланов (рейтинг по числу участников) ---
    if (url.pathname === '/clans' && request.method === 'GET') {
      const clans = await loadAllClans();
      const summary = clans.map((c) => ({
        id: c.id, name: c.name, tag: c.tag || '', leaderName: c.leaderName,
        size: (c.memberIds || []).length, treasury: c.treasury || 0, open: c.open !== false,
      })).sort((a, b) => b.size - a.size || b.treasury - a.treasury);
      return jsonResp(summary);
    }

    // --- GET /clan?user_id=<id> --- клан игрока с живым составом ---
    if (url.pathname === '/clan' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id');
      if (!userId) return jsonResp(null);
      const clanId = await env.SAVES.get(`clanmember_${userId}`, 'json');
      if (!clanId) return jsonResp(null);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) { await env.SAVES.delete(`clanmember_${userId}`); return jsonResp(null); }
      const officerIds = (clan.officerIds || []).map(String);
      const members = await Promise.all((clan.memberIds || []).map(async (mid) => {
        const s = await env.SAVES.get(`save_${mid}`, 'json');
        const isLeader = String(mid) === String(clan.leaderId);
        return { id: mid, name: (s && s.name) || 'Полубог', xpLevel: (s && s.xpLevel) || 1, danger: (s && s.danger) || 1, isLeader, isOfficer: !isLeader && officerIds.includes(String(mid)) };
      }));
      members.sort((a, b) => b.isLeader - a.isLeader || b.isOfficer - a.isOfficer || b.danger - a.danger);
      const applicants = (clan.applicants || []).map((a) => ({ id: String(a.id), name: a.name || 'Полубог', ts: a.ts || 0 }));
      const size = members.length;
      const rd = clan.raid || newRaid(1, size);
      rescaleRaid(rd, size);
      const contr = rd.contributors || {};
      const nameOf = (mid) => { const m = members.find((x) => String(x.id) === String(mid)); return m ? m.name : 'Боец'; };
      const top = Object.entries(contr).map(([mid, dmg]) => ({ name: nameOf(mid), dmg })).sort((a, b) => b.dmg - a.dmg).slice(0, 3);
      const lastHit = (rd.hits || {})[String(userId)] || 0;
      const cdLeft = Math.max(0, RAID_COOLDOWN_MS - (Date.now() - lastHit));
      const myReward = (clan.raidRewards || {})[String(userId)] || null;
      const raid = { tier: rd.tier, hp: Math.max(0, rd.hp), hpMax: rd.hpMax, name: raidName(rd.tier), myDmg: contr[String(userId)] || 0, top, cdLeft };
      const shop = (clan.shop || []).map((e) => ({ sid: e.sid, ownerId: e.ownerId, ownerName: e.ownerName, rentedBy: e.rentedBy || null, rentedByName: e.rentedByName || '', item: e.item }));
      return jsonResp({ id: clan.id, name: clan.name, tag: clan.tag || '', leaderId: clan.leaderId, leaderName: clan.leaderName, open: clan.open !== false, treasury: clan.treasury || 0, upgrades: clan.upgrades || {}, createdAt: clan.createdAt, size, members, officerIds, applicants, raid, raidReward: myReward, motd: clan.motd || '', motdBy: clan.motdBy || '', motdAt: clan.motdAt || 0, log: (clan.log || []).slice(0, 20), shop });
    }

    // --- POST /clan/create  body: { initData, name, tag } ---
    if (url.pathname === '/clan/create' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      if (await env.SAVES.get(`clanmember_${user.id}`, 'json')) return jsonResp({ error: 'already' }, 409);
      const name = String(body.name || '').trim().slice(0, 24);
      const tag = String(body.tag || '').trim().slice(0, 5);
      if (name.length < 3) return jsonResp({ error: 'name' }, 400);
      const id = crypto.randomUUID();
      const clan = { id, name, tag, leaderId: String(user.id), leaderName: user.name, memberIds: [String(user.id)], officerIds: [], applicants: [], open: true, treasury: 0, upgrades: {}, motd: '', motdBy: '', motdAt: 0, log: [], shop: [], createdAt: Date.now() };
      await env.SAVES.put(`clan_${id}`, JSON.stringify(clan));
      await env.SAVES.put(`clanmember_${user.id}`, JSON.stringify(id));
      return jsonResp({ ok: true, id });
    }

    // --- POST /clan/join  body: { initData, clanId } ---
    if (url.pathname === '/clan/join' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      if (await env.SAVES.get(`clanmember_${user.id}`, 'json')) return jsonResp({ error: 'already' }, 409);
      const clan = await env.SAVES.get(`clan_${body.clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      if ((clan.memberIds || []).length >= CLAN_MAX_MEMBERS) return jsonResp({ error: 'full' }, 429);
      clan.memberIds.push(String(user.id));
      await env.SAVES.put(`clan_${clan.id}`, JSON.stringify(clan));
      await env.SAVES.put(`clanmember_${user.id}`, JSON.stringify(clan.id));
      if (env.BOT_TOKEN && env.BOT_HANDLE && String(clan.leaderId) !== String(user.id)) {
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, clan.leaderId,
          `🛡 <b>Пополнение в клане!</b>\n${user.name} вступил в клан «${clan.name}».`);
      }
      return jsonResp({ ok: true, id: clan.id });
    }

    // --- POST /clan/leave  body: { initData } ---
    if (url.pathname === '/clan/leave' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      await env.SAVES.delete(`clanmember_${user.id}`);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (clan) {
        clan.memberIds = (clan.memberIds || []).filter((m) => String(m) !== String(user.id));
        clan.officerIds = (clan.officerIds || []).filter((m) => String(m) !== String(user.id));
        if (clan.memberIds.length === 0) {
          await env.SAVES.delete(`clan_${clanId}`); // клан распался
        } else {
          pushClanLog(clan, `🚪 ${user.name} покинул клан`);
          if (String(clan.leaderId) === String(user.id)) { // лидер ушёл — старшинство офицеру, иначе старейшему бойцу
            clan.leaderId = clan.officerIds[0] || clan.memberIds[0];
            clan.officerIds = clan.officerIds.filter((m) => String(m) !== String(clan.leaderId));
            const s = await env.SAVES.get(`save_${clan.leaderId}`, 'json');
            clan.leaderName = (s && s.name) || 'Полубог';
            pushClanLog(clan, `👑 Новый лидер: ${clan.leaderName}`);
          }
          await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
        }
      }
      return jsonResp({ ok: true });
    }

    // --- POST /clan/donate  body: { initData, amount } --- взнос в казну ---
    if (url.pathname === '/clan/donate' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const amount = Math.floor(Number(body.amount));
      if (!(amount > 0)) return jsonResp({ error: 'amount' }, 400);
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      clan.treasury = (clan.treasury || 0) + amount;
      pushClanLog(clan, `💰 ${user.name}: +${amount} 🪙 в казну`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, treasury: clan.treasury });
    }

    // --- POST /clan/upgrade  body: { initData, key } --- улучшение за казну (только лидер) ---
    if (url.pathname === '/clan/upgrade' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const KEYS = { artifact: 1, vault: 1, forge: 1, altar: 1 };
      const key = String(body.key || '');
      if (!KEYS[key]) return jsonResp({ error: 'key' }, 400);
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      if (String(clan.leaderId) !== String(user.id)) return jsonResp({ error: 'notleader' }, 403);
      if (!clan.upgrades) clan.upgrades = {};
      const lvl = clan.upgrades[key] || 0;
      if (lvl >= 5) return jsonResp({ error: 'max' }, 400);
      const cost = 1000 * (lvl + 1) * (lvl + 1); // 1000,4000,9000,16000,25000
      if ((clan.treasury || 0) < cost) return jsonResp({ error: 'treasury', cost }, 402);
      clan.treasury -= cost;
      clan.upgrades[key] = lvl + 1;
      pushClanLog(clan, `⚜️ Улучшение «${key}» до ур. ${lvl + 1} (−${cost} 🪙)`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, treasury: clan.treasury, upgrades: clan.upgrades });
    }

    // --- POST /clan/apply  body: { initData, clanId } --- вступить (открытый) или подать заявку (закрытый) ---
    if (url.pathname === '/clan/apply' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      if (await env.SAVES.get(`clanmember_${user.id}`, 'json')) return jsonResp({ error: 'already' }, 409);
      const clan = await env.SAVES.get(`clan_${body.clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      if ((clan.memberIds || []).length >= CLAN_MAX_MEMBERS) return jsonResp({ error: 'full' }, 429);
      if (clan.open !== false) { // открытый клан — мгновенное вступление
        clan.memberIds.push(String(user.id));
        pushClanLog(clan, `🛡 ${user.name} вступил в клан`);
        await env.SAVES.put(`clan_${clan.id}`, JSON.stringify(clan));
        await env.SAVES.put(`clanmember_${user.id}`, JSON.stringify(clan.id));
        if (env.BOT_TOKEN && env.BOT_HANDLE && String(clan.leaderId) !== String(user.id)) {
          await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, clan.leaderId, `🛡 <b>Пополнение в клане!</b>\n${user.name} вступил в клан «${clan.name}».`);
        }
        return jsonResp({ ok: true, joined: true, id: clan.id });
      }
      // закрытый клан — заявка
      clan.applicants = clan.applicants || [];
      if (clan.applicants.some((a) => String(a.id) === String(user.id))) return jsonResp({ ok: true, pending: true });
      clan.applicants.push({ id: String(user.id), name: user.name, ts: Date.now() });
      await env.SAVES.put(`clan_${clan.id}`, JSON.stringify(clan));
      if (env.BOT_TOKEN && env.BOT_HANDLE) {
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, clan.leaderId, `📨 <b>Заявка в клан «${clan.name}»</b>\n${user.name} хочет вступить. Прими или отклони в разделе «Кланы».`);
      }
      return jsonResp({ ok: true, pending: true });
    }

    // --- POST /clan/applicant  body: { initData, targetId, action } --- принять/отклонить заявку (лидер/офицер) ---
    if (url.pathname === '/clan/applicant' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const isLeader = String(clan.leaderId) === String(user.id);
      const isOfficer = (clan.officerIds || []).map(String).includes(String(user.id));
      if (!isLeader && !isOfficer) return jsonResp({ error: 'noperm' }, 403);
      const targetId = String(body.targetId || '');
      const action = String(body.action || '');
      clan.applicants = clan.applicants || [];
      const app = clan.applicants.find((a) => String(a.id) === targetId);
      if (!app) return jsonResp({ error: 'noapp' }, 404);
      clan.applicants = clan.applicants.filter((a) => String(a.id) !== targetId);
      if (action === 'accept') {
        if ((clan.memberIds || []).length >= CLAN_MAX_MEMBERS) { await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan)); return jsonResp({ error: 'full' }, 429); }
        if (await env.SAVES.get(`clanmember_${targetId}`, 'json')) { // успел вступить в другой клан
          await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
          return jsonResp({ error: 'busy' }, 409);
        }
        clan.memberIds.push(targetId);
        await env.SAVES.put(`clanmember_${targetId}`, JSON.stringify(clanId));
        pushClanLog(clan, `🛡 ${app.name} принят в клан`);
        if (env.BOT_TOKEN && env.BOT_HANDLE) await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, targetId, `✅ <b>Заявка принята!</b>\nТы теперь в клане «${clan.name}».`);
      } else if (env.BOT_TOKEN && env.BOT_HANDLE) {
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, targetId, `🚫 Заявка в клан «${clan.name}» отклонена.`);
      }
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true });
    }

    // --- POST /clan/kick  body: { initData, targetId } --- кик (лидер; офицер — только рядовых) ---
    if (url.pathname === '/clan/kick' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const targetId = String(body.targetId || '');
      if (targetId === String(user.id)) return jsonResp({ error: 'self' }, 400);
      if (String(clan.leaderId) === targetId) return jsonResp({ error: 'leader' }, 403);
      if (!(clan.memberIds || []).map(String).includes(targetId)) return jsonResp({ error: 'notmember' }, 404);
      const isLeader = String(clan.leaderId) === String(user.id);
      const officers = (clan.officerIds || []).map(String);
      const isOfficer = officers.includes(String(user.id));
      if (!isLeader && !isOfficer) return jsonResp({ error: 'noperm' }, 403);
      if (!isLeader && officers.includes(targetId)) return jsonResp({ error: 'noperm' }, 403); // офицер не кикает офицера
      clan.memberIds = (clan.memberIds || []).filter((m) => String(m) !== targetId);
      clan.officerIds = officers.filter((m) => m !== targetId);
      await env.SAVES.delete(`clanmember_${targetId}`);
      pushClanLog(clan, `⚔️ ${await saveName(targetId)} исключён из клана`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      if (env.BOT_TOKEN && env.BOT_HANDLE) await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, targetId, `⚔️ Тебя исключили из клана «${clan.name}».`);
      return jsonResp({ ok: true });
    }

    // --- POST /clan/promote  body: { initData, targetId } --- назначить/снять офицера (лидер) ---
    if (url.pathname === '/clan/promote' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      if (String(clan.leaderId) !== String(user.id)) return jsonResp({ error: 'notleader' }, 403);
      const targetId = String(body.targetId || '');
      if (targetId === String(user.id)) return jsonResp({ error: 'self' }, 400);
      if (!(clan.memberIds || []).map(String).includes(targetId)) return jsonResp({ error: 'notmember' }, 404);
      const officers = (clan.officerIds || []).map(String);
      let promoted;
      if (officers.includes(targetId)) { clan.officerIds = officers.filter((m) => m !== targetId); promoted = false; }
      else { clan.officerIds = [...officers, targetId]; promoted = true; }
      pushClanLog(clan, `🎖 ${await saveName(targetId)} ${promoted ? 'назначен офицером' : 'снят с офицеров'}`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      if (env.BOT_TOKEN && env.BOT_HANDLE) await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, targetId, promoted ? `🎖 Тебя назначили офицером клана «${clan.name}»!` : `Тебя сняли с поста офицера клана «${clan.name}».`);
      return jsonResp({ ok: true, officerIds: clan.officerIds });
    }

    // --- POST /clan/transfer  body: { initData, targetId } --- передать лидерство (лидер) ---
    if (url.pathname === '/clan/transfer' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      if (String(clan.leaderId) !== String(user.id)) return jsonResp({ error: 'notleader' }, 403);
      const targetId = String(body.targetId || '');
      if (targetId === String(user.id)) return jsonResp({ error: 'self' }, 400);
      if (!(clan.memberIds || []).map(String).includes(targetId)) return jsonResp({ error: 'notmember' }, 404);
      const oldLeader = String(clan.leaderId);
      clan.leaderId = targetId;
      const s = await env.SAVES.get(`save_${targetId}`, 'json');
      clan.leaderName = (s && s.name) || 'Полубог';
      const officers = (clan.officerIds || []).map(String).filter((m) => m !== targetId);
      officers.push(oldLeader); // бывший лидер становится офицером
      clan.officerIds = officers;
      pushClanLog(clan, `👑 Лидерство передано: ${clan.leaderName}`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      if (env.BOT_TOKEN && env.BOT_HANDLE) await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, targetId, `👑 <b>Ты теперь лидер клана «${clan.name}»!</b>`);
      return jsonResp({ ok: true });
    }

    // --- POST /clan/toggle-open  body: { initData } --- открыть/закрыть приём (лидер) ---
    if (url.pathname === '/clan/toggle-open' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      if (String(clan.leaderId) !== String(user.id)) return jsonResp({ error: 'notleader' }, 403);
      clan.open = clan.open === false; // toggle: closed→open, open→closed
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, open: clan.open });
    }

    // --- POST /clan/raid/hit  body: { initData, dmg } --- засчитать урон по боссу из боя (кулдаун) ---
    if (url.pathname === '/clan/raid/hit' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const size = (clan.memberIds || []).length;
      if (!clan.raid) clan.raid = newRaid(1, size);
      const raid = clan.raid;
      rescaleRaid(raid, size); // старые раздутые боссы → новая формула
      raid.hits = raid.hits || {}; raid.contributors = raid.contributors || {};
      const now = Date.now();
      const last = raid.hits[String(user.id)] || 0;
      if (now - last < RAID_COOLDOWN_MS) return jsonResp({ error: 'cooldown', cdLeft: RAID_COOLDOWN_MS - (now - last) }, 429);
      // урон приходит из интерактивного боя — без искусственного потолка, только остаток HP босса
      const reqDmg = Math.max(0, Math.floor(Number(body.dmg) || 0));
      const dmg = Math.min(reqDmg, raid.hp);
      if (dmg <= 0) return jsonResp({ ok: true, dmg: 0, killed: false, raid: { tier: raid.tier, hp: Math.max(0, raid.hp), hpMax: raid.hpMax, name: raidName(raid.tier), cdLeft: 0 } });
      raid.hp -= dmg;
      raid.contributors[String(user.id)] = (raid.contributors[String(user.id)] || 0) + dmg;
      let killed = false; let reward = null;
      if (raid.hp <= 0) {
        killed = true;
        const tier = raid.tier;
        const contrib = raid.contributors;
        const total = Object.values(contrib).reduce((a, b) => a + b, 0) || 1;
        clan.raidRewards = clan.raidRewards || {};
        clan.treasury = (clan.treasury || 0) + 500 * tier; // награда всем — в казну
        for (const mid of clan.memberIds) {
          const d = contrib[String(mid)] || 0;
          const r = clan.raidRewards[String(mid)] || { gold: 0, sparks: 0, xp: 0 };
          r.gold += 300 * tier + Math.round(700 * tier * (d / total)); // база всем + бонус по вкладу
          r.sparks += 150 * tier;
          r.xp = (r.xp || 0) + 150 * tier; // опыт поровну всем участникам клана (даже не бившим)
          clan.raidRewards[String(mid)] = r;
        }
        reward = clan.raidRewards[String(user.id)];
        pushClanLog(clan, `🐉 Босс «${raidName(tier)}» (тир ${tier}) повержен!`);
        clan.raid = newRaid(tier + 1, size); // следующий босс крепче
        if (env.BOT_TOKEN && env.BOT_HANDLE) {
          for (const mid of clan.memberIds) {
            await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, mid, `🐉 <b>Босс повержен!</b>\nКлан «${clan.name}» одолел «${raidName(tier)}». Забери награду в разделе «Кланы».`);
          }
        }
      } else {
        // босс выжил — это отступление/поражение, включаем перезарядку 10 мин.
        // Если убил — кулдауна нет, можно сразу идти на следующего босса.
        raid.hits[String(user.id)] = now;
      }
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      const cur = clan.raid;
      return jsonResp({ ok: true, dmg, killed, reward, raid: { tier: cur.tier, hp: Math.max(0, cur.hp), hpMax: cur.hpMax, name: raidName(cur.tier), cdLeft: killed ? 0 : RAID_COOLDOWN_MS } });
    }

    // --- POST /clan/raid/claim  body: { initData } --- забрать награду за рейд ---
    if (url.pathname === '/clan/raid/claim' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const r = (clan.raidRewards || {})[String(user.id)];
      if (!r) return jsonResp({ error: 'none' }, 404);
      delete clan.raidRewards[String(user.id)];
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, reward: r });
    }

    // --- POST /clan/motd  body: { initData, text } --- сообщение дня (лидер/офицер) ---
    if (url.pathname === '/clan/motd' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const isLeader = String(clan.leaderId) === String(user.id);
      const isOfficer = (clan.officerIds || []).map(String).includes(String(user.id));
      if (!isLeader && !isOfficer) return jsonResp({ error: 'noperm' }, 403);
      clan.motd = String(body.text || '').slice(0, 200);
      clan.motdBy = user.name;
      clan.motdAt = Date.now();
      pushClanLog(clan, `📢 ${user.name} обновил сообщение дня`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, motd: clan.motd, motdBy: clan.motdBy, motdAt: clan.motdAt });
    }

    // --- POST /clan/shop/lend  body: { initData, item } --- одолжить вещь клану ---
    if (url.pathname === '/clan/shop/lend' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const item = body.item;
      if (!item || typeof item !== 'object' || !item.slot) return jsonResp({ error: 'item' }, 400);
      clan.shop = clan.shop || [];
      if (clan.shop.length >= CLAN_MAX_MEMBERS * 20) return jsonResp({ error: 'shopfull' }, 429);
      if (clan.shop.filter((e) => String(e.ownerId) === String(user.id)).length >= 20) return jsonResp({ error: 'ownerfull' }, 429);
      const clean = { ...item }; delete clean.id; delete clean.rented; delete clean.sid; delete clean.rentOwnerName; // храним чистый предмет
      const sid = crypto.randomUUID();
      clan.shop.push({ sid, item: clean, ownerId: String(user.id), ownerName: user.name, rentedBy: null, rentedByName: '', listedAt: Date.now() });
      pushClanLog(clan, `📦 ${user.name} выставил «${clean.name}» в арсенал`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, sid });
    }

    // --- POST /clan/shop/rent  body: { initData, sid } --- арендовать вещь ---
    if (url.pathname === '/clan/shop/rent' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const e = (clan.shop || []).find((x) => x.sid === String(body.sid));
      if (!e) return jsonResp({ error: 'noitem' }, 404);
      if (String(e.ownerId) === String(user.id)) return jsonResp({ error: 'own' }, 400);
      if (e.rentedBy && String(e.rentedBy) !== String(user.id)) return jsonResp({ error: 'taken' }, 409);
      e.rentedBy = String(user.id); e.rentedByName = user.name;
      pushClanLog(clan, `🔑 ${user.name} арендовал «${e.item.name}»`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, sid: e.sid, item: e.item, ownerName: e.ownerName });
    }

    // --- POST /clan/shop/return  body: { initData, sid } --- вернуть аренду добровольно ---
    if (url.pathname === '/clan/shop/return' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const e = (clan.shop || []).find((x) => x.sid === String(body.sid));
      if (!e) return jsonResp({ error: 'noitem' }, 404);
      if (String(e.rentedBy) !== String(user.id)) return jsonResp({ error: 'notyours' }, 403);
      e.rentedBy = null; e.rentedByName = '';
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true });
    }

    // --- POST /clan/shop/reclaim  body: { initData, sid } --- владелец забирает вещь обратно ---
    if (url.pathname === '/clan/shop/reclaim' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const clan = await env.SAVES.get(`clan_${clanId}`, 'json');
      if (!clan) return jsonResp({ error: 'gone' }, 404);
      const e = (clan.shop || []).find((x) => x.sid === String(body.sid));
      if (!e) return jsonResp({ error: 'noitem' }, 404);
      if (String(e.ownerId) !== String(user.id)) return jsonResp({ error: 'notowner' }, 403);
      clan.shop = clan.shop.filter((x) => x.sid !== e.sid);
      pushClanLog(clan, `📥 ${user.name} забрал «${e.item.name}» из арсенала`);
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      if (e.rentedBy && env.BOT_TOKEN && env.BOT_HANDLE && String(e.rentedBy) !== String(user.id)) {
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, e.rentedBy, `🔒 Владелец забрал арендованную вещь «${e.item.name}» из клана «${clan.name}».`);
      }
      return jsonResp({ ok: true, item: e.item });
    }

    // --- Чат мира (общий) ---
    // Ключ KV для комнаты: глобальная — старый ключ chat_world (совместимость), языки — chat_world_<room>
    const chatRoomKey = (room) => (room === 'global' ? 'chat_world' : `chat_world_${room}`);
    const normRoom = (r) => (CHAT_ROOMS.includes(r) ? r : 'global');
    if (url.pathname === '/chat/world' && request.method === 'GET') {
      const room = normRoom(url.searchParams.get('room') || 'global');
      const list = (await env.SAVES.get(chatRoomKey(room), 'json')) || [];
      return jsonResp(list);
    }
    if (url.pathname === '/chat/world' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const uid = String(user.id);

      // Проверка действующего бана
      const ban = (await env.SAVES.get(`chatban_${uid}`, 'json')) || { strikes: 0 };
      if (ban.perma) return jsonResp({ error: 'banned', perma: true }, 403);
      if (ban.until && ban.until > Date.now()) return jsonResp({ error: 'banned', until: ban.until, strikes: ban.strikes }, 403);

      const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (!text) return jsonResp({ error: 'empty' }, 400);

      // Фильтр мата: нарушение → бан на час; после 3-го — навсегда. Сообщение не публикуется.
      if (hasProfanity(text)) {
        const strikes = (ban.strikes || 0) + 1;
        if (strikes >= 3) {
          await env.SAVES.put(`chatban_${uid}`, JSON.stringify({ perma: true, strikes }));
          return jsonResp({ error: 'banned', perma: true, strikes }, 403);
        }
        const until = Date.now() + CHAT_TEMP_BAN_MS;
        await env.SAVES.put(`chatban_${uid}`, JSON.stringify({ until, strikes }));
        return jsonResp({ error: 'profanity', until, strikes }, 403);
      }

      const room = normRoom(body.room || 'global');
      const key = chatRoomKey(room);
      const list = (await env.SAVES.get(key, 'json')) || [];
      const sd = await env.SAVES.get(`save_${uid}`, 'json');
      const prem = !!(sd && (sd.premiumUntil || 0) > Date.now());
      list.push({ uid, name: user.name, text, ts: Date.now(), prem });
      while (list.length > 50) list.shift();
      await env.SAVES.put(key, JSON.stringify(list));
      return jsonResp({ ok: true });
    }

    // --- Чат клана (по участнику) ---
    if (url.pathname === '/chat/clan' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id');
      const clanId = userId ? await env.SAVES.get(`clanmember_${userId}`, 'json') : null;
      if (!clanId) return jsonResp([]);
      const list = (await env.SAVES.get(`chat_clan_${clanId}`, 'json')) || [];
      return jsonResp(list);
    }
    if (url.pathname === '/chat/clan' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
      const user = await userFromInitData(body.initData);
      if (!user) return new Response('Unauthorized', { status: 401, headers });
      const clanId = await env.SAVES.get(`clanmember_${user.id}`, 'json');
      if (!clanId) return jsonResp({ error: 'none' }, 404);
      const uid = String(user.id);

      // Тот же чат-бан, что и в мировом чате
      const ban = (await env.SAVES.get(`chatban_${uid}`, 'json')) || { strikes: 0 };
      if (ban.perma) return jsonResp({ error: 'banned', perma: true }, 403);
      if (ban.until && ban.until > Date.now()) return jsonResp({ error: 'banned', until: ban.until, strikes: ban.strikes }, 403);

      const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (!text) return jsonResp({ error: 'empty' }, 400);

      if (hasProfanity(text)) {
        const strikes = (ban.strikes || 0) + 1;
        if (strikes >= 3) {
          await env.SAVES.put(`chatban_${uid}`, JSON.stringify({ perma: true, strikes }));
          return jsonResp({ error: 'banned', perma: true, strikes }, 403);
        }
        const until = Date.now() + CHAT_TEMP_BAN_MS;
        await env.SAVES.put(`chatban_${uid}`, JSON.stringify({ until, strikes }));
        return jsonResp({ error: 'profanity', until, strikes }, 403);
      }

      const key = `chat_clan_${clanId}`;
      const list = (await env.SAVES.get(key, 'json')) || [];
      const sd = await env.SAVES.get(`save_${uid}`, 'json');
      const prem = !!(sd && (sd.premiumUntil || 0) > Date.now());
      list.push({ uid: String(user.id), name: user.name, text, ts: Date.now(), prem });
      while (list.length > 50) list.shift();
      await env.SAVES.put(key, JSON.stringify(list));
      return jsonResp({ ok: true });
    }

    // --- GET /admin/revenue?key=ADMIN_KEY --- сводка по продажам душ ---
    if (url.pathname === '/admin/revenue' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
        return new Response('Forbidden', { status: 403, headers });
      }
      const bal = await tgApi(env.BOT_TOKEN, 'getMyStarBalance', {});
      const starBalance = bal && bal.ok && bal.result ? (bal.result.amount || 0) : null;

      let cursor, buyers = 0, soulsSold = 0, starsEarned = 0;
      const purchases = [];
      do {
        const listed = await env.SAVES.list({ prefix: 'wallet_', cursor });
        const entries = await Promise.all(
          listed.keys.map(async ({ name }) => ({ uid: name.slice(7), w: await env.SAVES.get(name, 'json') }))
        );
        for (const { uid, w } of entries) {
          if (!w) continue;
          buyers++;
          soulsSold += w.lifetime || 0;
          for (const e of (w.ledger || [])) {
            starsEarned += e.stars || 0;
            purchases.push({ uid, packId: e.packId, souls: e.souls, stars: e.stars, ts: e.ts });
          }
        }
        cursor = listed.list_complete ? undefined : listed.cursor;
      } while (cursor);
      purchases.sort((a, b) => (b.ts || 0) - (a.ts || 0));

      return jsonResp({
        starBalance,
        starsEarned,
        soulsSold,
        buyers,
        orders: purchases.length,
        usdEstimate: +(starsEarned * 0.013).toFixed(2),
        recent: purchases.slice(0, 40),
      });
    }

    // --- GET /admin?key=ADMIN_KEY ---
    if (url.pathname === '/admin' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
        return new Response('Forbidden', { status: 403, headers });
      }

      const players = [];
      let cursor;
      do {
        const listed = await env.SAVES.list({ prefix: 'save_', cursor });
        const entries = await Promise.all(
          listed.keys.map(async ({ name }) => {
            const data = await env.SAVES.get(name, 'json');
            return data ? { _userId: name.slice(5), ...data } : null;
          })
        );
        players.push(...entries.filter(Boolean));
        cursor = listed.list_complete ? undefined : listed.cursor;
      } while (cursor);

      players.sort((a, b) => (b.xp || 0) - (a.xp || 0));

      return new Response(JSON.stringify(players), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      });
    }

    return new Response('Not found', { status: 404, headers });
  },

  // Cloudflare Cron Trigger — проверяем HP-уведомления (настроить: */10 * * * *)
  async scheduled(event, env) {
    if (!env.BOT_TOKEN || !env.BOT_HANDLE) return;
    const now = Date.now();
    let cursor;
    do {
      const listed = await env.SAVES.list({ prefix: 'hpnotify_', cursor });
      await Promise.all(listed.keys.map(async ({ name: key }) => {
        const data = await env.SAVES.get(key, 'json');
        if (!data || data.notifyAt > now) return;
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, data.chatId,
          `❤️ <b>HP восстановлен!</b>\n${data.name}, твой герой в «Вавилоне» полностью восстановил здоровье.\n<i>Самое время продолжить путешествие!</i>`
        );
        await env.SAVES.delete(key);
      }));
      cursor = listed.list_complete ? undefined : listed.cursor;
    } while (cursor);
  },
};
