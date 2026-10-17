import { registerPlugin } from '@capacitor/core';

const NativeScreenCapture = registerPlugin('PropardScreenCapture');

export const isNativeScreenCaptureAvailable = () =>
  Boolean(window.Capacitor?.isNativePlatform?.());

export async function startMobileScreenCapture() {
  if (!isNativeScreenCaptureAvailable()) return null;

  if (typeof document === 'undefined' || typeof MediaStream === 'undefined') {
    throw new Error('Capture mobile indisponible dans cet environnement.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossible de créer le flux vidéo mobile.');

  let stopped = false;
  let listener;
  let lastFrameAt = 0;
  const stream = canvas.captureStream(12);

  const stopCapture = async () => {
    if (stopped) return;
    stopped = true;
    try { await listener?.remove(); } catch {}
    try { await NativeScreenCapture.stop(); } catch {}
    stream.getTracks().forEach(track => track.stop());
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  try {
    listener = await NativeScreenCapture.addListener('screenFrame', payload => {
      if (stopped || !payload?.data) return;
      const now = Date.now();
      if (now - lastFrameAt < 70) return;
      lastFrameAt = now;
      const image = new Image();
      image.onload = () => {
        if (stopped) return;
        if (canvas.width !== image.width || canvas.height !== image.height) {
          canvas.width = image.width;
          canvas.height = image.height;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = `data:image/jpeg;base64,${payload.data}`;
    });
    await NativeScreenCapture.start();
  } catch (error) {
    await stopCapture();
    throw new Error(error?.message || 'La capture native de l’écran n’a pas pu démarrer.');
  }

  return { stream, stopCapture, nativeScreenCapture: true };
}
