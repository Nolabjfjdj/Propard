import React, { useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

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
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('fr');
  const [translatedText, setTranslatedText] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);

  const translate = async () => {
    if (!text || loading) return;

    const TranslatorAPI = globalThis.Translator;
    if (!TranslatorAPI || typeof TranslatorAPI.create !== 'function') {
      setFallbackAvailable(true);
      setStatus('La traduction locale n’est pas disponible dans ce navigateur. Tu peux utiliser Propard AI en envoyant explicitement le texte à Groq.');
      return;
    }

    setLoading(true);
    setStatus('Vérification des modèles de traduction…');
    setTranslatedText('');
    setFallbackAvailable(false);
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
      setFallbackAvailable(true);
      setStatus((error?.message || 'La traduction locale a échoué.') + ' Tu peux essayer la traduction via Propard AI.');
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

  const translateWithAI = async () => {
    if (!text || loading) return;
    setLoading(true);
    setStatus('Traduction via Propard AI…');
    setTranslatedText('');
    try {
      const response = await api.post('/api/ai/translate', {
        text,
        sourceLanguage,
        targetLanguage
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (typeof response.data?.translatedText !== 'string' || !response.data.translatedText.trim()) {
        throw new Error('Aucune traduction reçue.');
      }
      setTranslatedText(response.data.translatedText);
      setStatus('Traduction effectuée via Propard AI.');
      setFallbackAvailable(false);
    } catch (error) {
      setStatus(error.response?.data?.error || error.message || 'La traduction via Propard AI a échoué.');
    } finally {
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
          {fallbackAvailable && (
            <div style={{ width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.45 }}>
              La traduction de secours envoie le texte du message à Propard AI via Groq. Le texte ne reste donc pas protégé par le chiffrement de bout en bout pendant cette opération.
              <button type="button" onClick={translateWithAI} disabled={loading} style={{ ...controlStyle, display: 'block', marginTop: 8, cursor: loading ? 'wait' : 'pointer' }}>
                {loading ? 'Traduction…' : 'Autoriser et traduire avec Propard AI'}
              </button>
            </div>
          )}
          {status && <p role="status" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.4 }}>{status}</p>}
        </>
      )}
    </div>
  );
}
