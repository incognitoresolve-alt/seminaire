// Lecteur QR : BarcodeDetector natif (Android/Chrome) sinon jsQR chargé à la demande (iOS).
let jsqrPromise = null;
const loadJsQR = () =>
  (jsqrPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/jsQR.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = reject;
    document.head.append(s);
  }));

/** @returns {Promise<() => void>} fonction d'arrêt */
export async function startScanner(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();

  let detector = null;
  try {
    if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
      detector = new BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch {
    detector = null;
  }
  const jsQR = detector ? null : await loadJsQR();
  const canvas = document.createElement('canvas');
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
  let running = true;
  let busy = false;

  const tick = async () => {
    if (!running) return;
    if (!busy && video.readyState >= 2) {
      busy = true;
      try {
        let value = null;
        if (detector) {
          value = (await detector.detect(video))[0]?.rawValue ?? null;
        } else {
          const scale = Math.min(1, 640 / video.videoWidth); // image réduite : décodage rapide
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
          value = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
        }
        if (value && running) {
          navigator.vibrate?.(60);
          onCode(value);
        }
      } catch {
        /* frame illisible */
      }
      busy = false;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/** Extrait le token d'un QR (URL du pass) ou d'un code saisi. */
export function parsePassCode(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/[#&]p=([A-Za-z0-9_-]{16,32})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{6,32}$/.test(s)) return s;
  return null;
}
