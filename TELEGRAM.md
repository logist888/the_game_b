# «Вавилон» как Telegram Mini App

Игра уже готова к запуску внутри Telegram: подключён Telegram WebApp SDK
(`js/telegram.js`) — на весь экран, учёт «чёлки»/домашней полоски, цвета шапки
под тему, подтверждение закрытия (чтобы не терять прогресс). В обычном браузере
всё работает как раньше — SDK игнорируется.

Чтобы играть с телефона, нужно один раз выложить статику в интернет и создать бота.

## Шаг 1. Включить GitHub Pages (один раз)

В репозитории на GitHub: **Settings → Pages → Build and deployment → Source:
выбрать «GitHub Actions»**. Больше ничего настраивать не нужно.

В репозиторий уже добавлен workflow `.github/workflows/pages.yml` — он при каждом
пуше в ветку публикует папку `babylon/`. После первого успешного запуска
(вкладка **Actions**) сайт будет доступен по адресу:

```
https://logist888.github.io/the_game_b/
```

Открой этот адрес в браузере телефона — игра должна запуститься. Это и есть URL
для Mini App.

## Шаг 2. Создать бота и привязать игру (в самом Telegram)

1. Открой **@BotFather** в Telegram.
2. `/newbot` → задай имя и username бота (например `babylon_game_bot`). Получишь токен (хранить в секрете).
3. Привяжи Mini App одним из способов:

   **Способ A — кнопка-меню (быстрее всего):**
   - `/mybots` → выбери бота → **Bot Settings → Menu Button → Configure menu button**.
   - Вставь URL Pages (`https://logist888.github.io/the_game_b/`) и название кнопки, например «Играть».

   **Способ B — отдельное Mini App:**
   - `/newapp` → выбери бота → задай название, описание, картинку, и **вставь тот же URL** (`https://logist888.github.io/the_game_b/`).
   - BotFather выдаст ссылку вида `https://t.me/твой_бот/имя_аппа`.

4. Открой своего бота в Telegram, нажми кнопку **«Играть»** (или ссылку Mini App) —
   «Вавилон» откроется на весь экран прямо в Telegram.

## Шаг 3. Облачные сохранения (Cloudflare Worker)

Чтобы прогресс был **серверным** (привязан к Telegram-аккаунту, переживает смену
устройства и очистку кэша) и работали реферальная программа, зал славы, PvP и
уведомления — разверни воркер. Полная инструкция: [`worker/README.md`](worker/README.md).

Кратко (через CLI):

```bash
cd babylon/worker
npx wrangler login                    # или export CLOUDFLARE_API_TOKEN=...
npx wrangler kv namespace create SAVES   # id вписать в wrangler.toml
npx wrangler secret put BOT_TOKEN     # токен бота
npx wrangler secret put ADMIN_KEY     # пароль для /admin
npx wrangler deploy
```

Адрес воркера должен совпадать с константой `CLOUD_URL` в `js/state.js`
(сейчас `https://babylon-save.logist888.workers.dev`).

## Обновления

Любой пуш в ветку (или нажатие **Run workflow** в Actions) пере-публикует игру.
В Telegram достаточно переоткрыть Mini App (можно очистить кэш: в меню Mini App
есть «Reload»). При изменении `worker/save-worker.js` — повторить `wrangler deploy`.

## Заметки

- **Сохранение двухуровневое**: мгновенно в `localStorage` + в облако (Cloudflare
  KV) при сворачивании/закрытии и раз в ~30 с. Вне Telegram облако не используется —
  работает только локальное сохранение.
- Сложность 75–200% и вся механика работают так же, как в браузере.
- Подпись `initData` проверяется на сервере (HMAC-SHA256) — чужое сохранение
  подделать нельзя.
