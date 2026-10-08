/* PWA glue, shared by both looks: registers the service worker and powers the
 * optional "Install" button (any element with a data-install attribute).
 * Works only over https or localhost; on file:// it quietly does nothing.
 */
(function () {
  const here = document.currentScript && document.currentScript.src;
  if (!here) return;
  const base = new URL('.', here); // folder this file lives in (the project root)

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname }).catch(() => {
        /* offline support is a bonus: the game still works without it */
      });
    });
  }

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const buttons = () => document.querySelectorAll('[data-install]');
  const tips = () => document.querySelectorAll('[data-install-tip]');
  const section = () => document.querySelectorAll('[data-install-section]');
  const syncSection = () => {
    const any = [...buttons(), ...tips()].some((el) => !el.hidden);
    section().forEach((s) => (s.hidden = !any));
  };
  let deferred = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e;
    buttons().forEach((b) => (b.hidden = false));
    tips().forEach((t) => (t.hidden = true));
    syncSection();
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-install]');
    if (!btn || !deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    buttons().forEach((b) => (b.hidden = true));
    syncSection();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    buttons().forEach((b) => (b.hidden = true));
    tips().forEach((t) => (t.hidden = true));
    syncSection();
  });

  // iOS Safari has no install prompt: show the manual hint there, once the page is ready.
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos && !standalone) {
    document.addEventListener('DOMContentLoaded', () => {
      tips().forEach((t) => (t.hidden = false));
      syncSection();
    });
  }
})();
