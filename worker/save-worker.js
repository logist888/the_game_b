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

const ALLOWED_ORIGIN = 'https://logist888.github.io';
const GAME_URL = 'https://logist888.github.io/the_game_b/';

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

function corsHeaders(origin) {
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
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
      const lots = await listAllLots();
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

      const id = crypto.randomUUID();
      const record = {
        id, sellerId: String(seller.id), sellerName: seller.name,
        kind: lot.kind, price, createdAt: Date.now(),
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

      // Выплата продавцу за вычетом 1% комиссии (раздел GDD «Комиссия»)
      const net = Math.max(1, Math.floor(lot.price * 0.99));
      const payoutKey = `payout_${lot.sellerId}`;
      const prev = (await env.SAVES.get(payoutKey, 'json')) || 0;
      await env.SAVES.put(payoutKey, JSON.stringify(prev + net), { expirationTtl: 60 * 60 * 24 * 365 });

      // Уведомляем продавца в Telegram
      if (env.BOT_TOKEN && env.BOT_HANDLE) {
        const what = lot.kind === 'res' ? `${lot.qty}× ресурса` : `«${lot.item.name}»`;
        await tgNotify(env.BOT_TOKEN, env.BOT_HANDLE, lot.sellerId,
          `💰 <b>Лот продан!</b>\n${buyer.name} купил ваш лот ${what}.\nВам начислено <b>+${net} 🪙</b> (после комиссии 1%).`);
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
    const jsonResp = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

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
        size: (c.memberIds || []).length, treasury: c.treasury || 0,
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
      const members = await Promise.all((clan.memberIds || []).map(async (mid) => {
        const s = await env.SAVES.get(`save_${mid}`, 'json');
        return { id: mid, name: (s && s.name) || 'Полубог', xpLevel: (s && s.xpLevel) || 1, danger: (s && s.danger) || 1, isLeader: String(mid) === String(clan.leaderId) };
      }));
      members.sort((a, b) => b.isLeader - a.isLeader || b.danger - a.danger);
      return jsonResp({ id: clan.id, name: clan.name, tag: clan.tag || '', leaderId: clan.leaderId, leaderName: clan.leaderName, treasury: clan.treasury || 0, createdAt: clan.createdAt, size: members.length, members });
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
      const clan = { id, name, tag, leaderId: String(user.id), leaderName: user.name, memberIds: [String(user.id)], treasury: 0, createdAt: Date.now() };
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
        if (clan.memberIds.length === 0) {
          await env.SAVES.delete(`clan_${clanId}`); // клан распался
        } else {
          if (String(clan.leaderId) === String(user.id)) { // лидер ушёл — передаём старшинство
            clan.leaderId = clan.memberIds[0];
            const s = await env.SAVES.get(`save_${clan.leaderId}`, 'json');
            clan.leaderName = (s && s.name) || 'Полубог';
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
      await env.SAVES.put(`clan_${clanId}`, JSON.stringify(clan));
      return jsonResp({ ok: true, treasury: clan.treasury });
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
