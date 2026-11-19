import React, { useState } from 'react';

const languages = [
  ['ar', 'Arabe'],
  ['de', 'Allemand'],
  ['en', 'Anglais'],
  ['zh', 'Chinois'],
  ['ko', 'Coréen'],
  ['es', 'Espagnol'],
  ['fr', 'Français'],
  ['it', 'Italien'],
  ['ja', 'Japonais'],
  ['nl', 'Néerlandais'],
  ['pl', 'Polonais'],
  ['pt', 'Portugais'],
  ['ru', 'Russe'],
  ['tr', 'Turc'],
  ['uk', 'Ukrainien']
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

export default function MessageTranslation({ text }) {
  const [open, setOpen] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('fr');
  const [translatedText, setTranslatedText] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const translate = async () => {
    if (!text || loading) return;

    const TranslatorAPI = globalThis.Translator;
    if (!TranslatorAPI || typeof TranslatorAPI.create !== 'function') {
      setStatus('La traduction locale n’est pas encore prise en charge par ce navigateur. Aucun message n’a été envoyé à un service externe.');
      return;
    }

    setLoading(true);
    setStatus('');
    setTranslatedText('');

    let translator;
    let detector;

    try {
      let detectedSource = sourceLanguage;

      if (detectedSource === 'auto') {
        const DetectorAPI = globalThis.LanguageDetector;
        if (!DetectorAPI || typeof DetectorAPI.create !== 'function') {
          throw new Error('La détection automatique de langue n’est pas disponible. Choisis manuellement la langue source.');
        }

        detector = await DetectorAPI.create();
        const detections = await detector.detect(text);
        detectedSource = detections?.[0]?.detectedLanguage;

        if (!detectedSource || !languages.some(([code]) => code === detectedSource)) {
          throw new Error('La langue du message n’a pas pu être détectée. Choisis-la manuellement.');
        }
      }

      if (detectedSource === targetLanguage) {
        throw new Error('Le message est déjà dans la langue sélectionnée.');
      }

      translator = await TranslatorAPI.create({
        sourceLanguage: detectedSource,
        targetLanguage
      });

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
      } catch {}
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
            <select aria-label="Langue source" value={sourceLanguage} onChange={event => setSourceLanguage(event.target.value)} disabled={loading} style={controlStyle}>
              <option value="auto">Détection automatique</option>
              {languages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <span aria-hidden="true" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>vers</span>
            <select aria-label="Langue cible" value={targetLanguage} onChange={event => setTargetLanguage(event.target.value)} disabled={loading} style={controlStyle}>
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
          {status && <p role="status" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.4 }}>{status}</p>}
        </>
      )}
    </div>
  );
}
