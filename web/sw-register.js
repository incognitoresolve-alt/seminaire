/** Service worker : l'appli se recharge même si le Wi-Fi coupe (jamais pour /api). */
export function registerSW() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost') return;
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
