import api from './api';

export async function transcribeAudio(blob, token) {
  if (!(blob instanceof Blob) || blob.size < 512) {
    throw new Error('Aucun son exploitable n’a été enregistré.');
  }
  if (blob.size > 12 * 1024 * 1024) {
    throw new Error('Enregistrement trop volumineux. Fais une dictée plus courte.');
  }

  const mimeType = blob.type.split(';')[0].toLowerCase();
  const allowedTypes = [
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/m4a',
    'audio/mpga'
  ];
  if (!allowedTypes.includes(mimeType)) {
    throw new Error('Le format audio de cet appareil n’est pas pris en charge.');
  }

  const response = await api.post('/api/ai/transcribe', blob, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType
    },
    timeout: 70000
  });
  const transcript = response.data?.text;
  if (typeof transcript !== 'string' || !transcript.trim()) {
    throw new Error('Aucun texte n’a été reconnu dans cet enregistrement.');
  }
  return transcript.trim();
}

export function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/webm',
    'audio/ogg'
  ].find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}
