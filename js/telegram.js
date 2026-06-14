/*
 * Интеграция с Telegram Mini App. Работает только внутри Telegram —
 * в обычном браузере window.Telegram отсутствует и модуль ничего не делает.
 */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;

  try { tg.ready(); } catch (e) {}
  try { tg.expand(); } catch (e) {}                 // на весь экран
  // запретить случайное закрытие свайпом вниз во время прокрутки (API v7.7+)
  try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}
  // спрашивать подтверждение перед закрытием, чтобы не терять прогресс
  try { if (tg.enableClosingConfirmation) tg.enableClosingConfirmation(); } catch (e) {}
  // цвета шапки/фона под тему игры
  try { tg.setHeaderColor('#211910'); } catch (e) {}
  try { tg.setBackgroundColor('#15110c'); } catch (e) {}

  document.documentElement.classList.add('in-telegram');

  // высота вьюпорта Telegram -> CSS-переменная, чтобы нижняя панель не уезжала
  function applyViewport() {
    const h = tg.viewportStableHeight || tg.viewportHeight || window.innerHeight;
    document.documentElement.style.setProperty('--tg-vh', h + 'px');
  }
  applyViewport();
  try { tg.onEvent('viewportChanged', applyViewport); } catch (e) {}

  // лёгкая тактильная отдача на важные события (если доступно)
  window.tgHaptic = function (type) {
    try { tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(type || 'success'); } catch (e) {}
  };
})();
