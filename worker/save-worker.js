/**
 * Cloudflare Worker: облачные сохранения «Проект Вавилон»
 *
 * Env vars (Cloudflare dashboard → Worker → Settings → Variables):
 *   BOT_TOKEN  — токен бота из BotFather (секрет, не разглашать)
 *
 * KV namespace:
 *   SAVES — создать в dashboard и привязать к worker под именем SAVES
 *
 * Маршруты:
 *   GET  /save?user_id=<id>          → возвращает JSON сохранения
 *   POST /save  body: {initData, save} → верифицирует подпись Telegram, записывает save
 */

const ALLOWED_ORIGIN = 'https://logist888.github.io';

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
      const data = await env.SAVES.get(`save_${userId}`);
      return new Response(data || 'null', {
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

      // Сохраняем (TTL 365 дней)
      await env.SAVES.put(`save_${userId}`, JSON.stringify(save), {
        expirationTtl: 60 * 60 * 24 * 365,
      });

      return new Response('OK', { headers });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
