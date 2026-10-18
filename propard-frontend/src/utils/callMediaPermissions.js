import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeScreenCapture = registerPlugin('PropardScreenCapture');

export async function ensureCallMediaPermissions({ video = false } = {}) {
  if (Capacitor.getPlatform() !== 'android') return;

  if (!Capacitor.isNativePlatform()) {
    throw new Error('Les autorisations natives de Propard sont indisponibles.');
  }

  try {
    await NativeScreenCapture.requestMediaPermissions({ video });
  } catch (error) {
    const message = error?.message || '';
    if (message.toLowerCase().includes('microphone')) {
      throw new Error('Autorise le microphone pour pouvoir lancer ou rejoindre un appel. Si Android ne propose plus la demande, ouvre Paramètres > Applications > Propard > Autorisations.');
    }
    if (video && message.toLowerCase().includes('caméra')) {
      throw new Error('Autorise la caméra pour pouvoir lancer un appel vidéo. Ouvre Paramètres > Applications > Propard > Autorisations si nécessaire.');
    }
    throw new Error(message || 'Impossible d’obtenir les autorisations du microphone et de la caméra.');
  }
}
