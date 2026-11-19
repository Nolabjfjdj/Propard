import React, { useState } from 'react';

const languages = [
  ['ar', 'Arabe'],
  ['bg', 'Bulgare'],
  ['bn', 'Bengali'],
  ['cs', 'Tchèque'],
  ['da', 'Danois'],
  ['de', 'Allemand'],
  ['el', 'Grec'],
  ['en', 'Anglais'],
  ['es', 'Espagnol'],
  ['fi', 'Finnois'],
  ['fr', 'Français'],
  ['he', 'Hébreu'],
  ['hi', 'Hindi'],
  ['hr', 'Croate'],
  ['hu', 'Hongrois'],
  ['id', 'Indonésien'],
  ['it', 'Italien'],
  ['ja', 'Japonais'],
  ['kn', 'Kannada'],
  ['ko', 'Coréen'],
  ['lt', 'Lituanien'],
  ['mr', 'Marathi'],
  ['nl', 'Néerlandais'],
  ['no', 'Norvégien'],
  ['pl', 'Polonais'],
  ['pt', 'Portugais'],
  ['ro', 'Roumain'],
  ['ru', 'Russe'],
  ['sk', 'Slovaque'],
  ['sl', 'Slovène'],
  ['sv', 'Suédois'],
  ['ta', 'Tamoul'],
  ['te', 'Télougou'],
  ['th', 'Thaï'],
  ['tr', 'Turc'],
  ['uk', 'Ukrainien'],
  ['vi', 'Vietnamien'],
  ['zh', 'Chinois'],
  ['zh-Hant', 'Chinois traditionnel']
];

const controlStyle = {
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: '5px 7px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 11,
  maxWidth: '100%'
};

function normalizeLanguageCode(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  const exactMatch = languages.find(([code]) => code.toLowerCase() === normalized);
  if (exactMatch) return exactMatch[0];
  const baseLanguage = normalized.split('-')[0];
  return languages.find(([code]) => code.toLowerCase() === baseLanguage)?.[0] || '';
}

function attachDownloadMonitor(setDownloadProgress) {
  return monitor => {
    monitor.addEventListener('downloadprogress', event => {
      const progress = Number(event.loaded);
      if (Number.isFinite(progress)) {
        setDownloadProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
      }
    });
  };
}

async function ensureApiAvailable(api, options, label) {
  if (typeof api?.availability !== 'function') return;
  const availability = await api.availability(options);
  if (availability === 'unavailable') {
    throw new Error(`${label} n’est pas disponible sur cet appareil ou pour cette combinaison de langues.`);
  }
}

export default function MessageTranslation({ text }) {
  const [open, setOpen] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('fr');
  const [translatedText, setTranslatedText] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  const translate = async () => {
    if (!text || loading) return;

    const TranslatorAPI = globalThis.Translator;
    if (!TranslatorAPI || typeof TranslatorAPI.create !== 'function') {
      setStatus('La traduction locale n’est pas prise en charge par ce navigateur. Elle est notamment indisponible dans les navigateurs mobiles compatibles avec Chrome. Aucun message n’a été envoyé à un service externe.');
      return;
    }

    setLoading(true);
    setStatus('Vérification des modèles de traduction…');
    setTranslatedText('');
    setDownloadProgress(null);

    let translator;
    let detector;

    try {
      let detectedSource = sourceLanguage;

      if (detectedSource === 'auto') {
        const DetectorAPI = globalThis.LanguageDetector;
        if (!DetectorAPI || typeof DetectorAPI.create !== 'function') {
          throw new Error('La détection automatique n’est pas disponible. Choisis manuellement la langue source.');
        }

        await ensureApiAvailable(DetectorAPI, undefined, 'La détection de langue');
        detector = await DetectorAPI.create({
          monitor: attachDownloadMonitor(setDownloadProgress)
        });
        const detections = await detector.detect(text);
        detectedSource = normalizeLanguageCode(detections?.[0]?.detectedLanguage);

        if (!detectedSource) {
          throw new Error('La langue du message n’a pas pu être détectée parmi les langues prises en charge. Choisis-la manuellement.');
        }
      }

      if (normalizeLanguageCode(detectedSource) === normalizeLanguageCode(targetLanguage)) {
        throw new Error('Le message est déjà dans la langue sélectionnée.');
      }

      const translationOptions = {
        sourceLanguage: detectedSource,
        targetLanguage
      };

      await ensureApiAvailable(TranslatorAPI, translationOptions, 'La traduction');

      setStatus('Préparation du modèle de traduction…');
      translator = await TranslatorAPI.create({
        ...translationOptions,
        monitor: attachDownloadMonitor(setDownloadProgress)
      });

      setStatus('Traduction en cours…');
      const result = await translator.translate(text);
      if (typeof result !== 'string' || !result.trim()) {
        throw new Error('La traduction n’a retourné aucun texte.');
      }

      setTranslatedText(result);
      setStatus('Traduit localement sur cet appareil. Le message original reste inchangé.');
    } catch (error) {
      setStatus(error?.message || 'La traduction a échoué sur cet appareil.');
    } finally {
      try {
        await translator?.destroy?.();
        await detector?.destroy?.();
      } catch (cleanupError) {
        console.warn('Nettoyage du moteur de traduction impossible:', cleanupError?.message || cleanupError);
      }
      setDownloadProgress(null);
      setLoading(false);
    }
  };

  if (typeof text !== 'string' || !text.trim()) return null;

  return (
    <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, maxWidth: '100%' }}>
      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setStatus(''); }} style={{ ...controlStyle, cursor: 'pointer' }}>
          Traduire
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
            <select aria-label="Langue source" value={sourceLanguage} onChange={event => { setSourceLanguage(event.target.value); setTranslatedText(''); setStatus(''); }} disabled={loading} style={controlStyle}>
              <option value="auto">Détection automatique</option>
              {languages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <span aria-hidden="true" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>vers</span>
            <select aria-label="Langue cible" value={targetLanguage} onChange={event => { setTargetLanguage(event.target.value); setTranslatedText(''); setStatus(''); }} disabled={loading} style={controlStyle}>
              {languages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <button type="button" onClick={translate} disabled={loading} style={{ ...controlStyle, cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? 'Traduction…' : 'Traduire'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTranslatedText(''); setStatus(''); }} disabled={loading} aria-label="Fermer la traduction" style={{ ...controlStyle, cursor: 'pointer' }}>
              Fermer
            </button>
          </div>
          {translatedText && (
            <div style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text-primary)', fontSize: 13 }}>
              {translatedText}
            </div>
          )}
          {downloadProgress !== null && loading && (
            <div role="status" style={{ width: '100%', color: 'var(--text-secondary)', fontSize: 10 }}>
              Téléchargement du modèle : {downloadProgress}%
              <progress value={downloadProgress} max="100" style={{ display: 'block', width: '100%', marginTop: 4 }} />
            </div>
          )}
          {status && <p role="status" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.4 }}>{status}</p>}
        </>
      )}
    </div>
  );
}
