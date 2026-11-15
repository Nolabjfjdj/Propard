import React, { useMemo, useState } from 'react';

const emojiGroups = [
  {
    id: 'smileys',
    label: 'Visages',
    icon: '😀',
    emojis: [
      ['😀', 'sourire heureux'], ['😃', 'grand sourire'], ['😄', 'sourire yeux fermes'], ['😁', 'grand sourire dents'],
      ['😆', 'rire'], ['😅', 'rire sueur'], ['🤣', 'mort de rire'], ['😂', 'larmes de joie'],
      ['🙂', 'sourire leger'], ['🙃', 'visage retourne'], ['😉', 'clin oeil'], ['😊', 'content'],
      ['😇', 'ange'], ['🥰', 'amoureux'], ['😍', 'coeurs yeux'], ['🤩', 'etoiles'],
      ['😘', 'bisou'], ['😋', 'miam'], ['😛', 'langue'], ['🤪', 'fou'],
      ['😎', 'lunettes soleil'], ['🤓', 'geek'], ['🥳', 'fete'], ['😭', 'pleure'],
      ['😢', 'triste'], ['😡', 'enerve'], ['🤬', 'en colere'], ['🤔', 'reflechit'],
      ['🫡', 'salut'], ['🤯', 'explosion tete'], ['🥶', 'froid'], ['🥵', 'chaud'],
      ['😴', 'dort'], ['🤤', 'bave'], ['🤮', 'vomit'], ['🤧', 'eternue'],
      ['👻', 'fantome'], ['💀', 'crane'], ['☠️', 'danger'], ['🤡', 'clown']
    ]
  },
  {
    id: 'gestures',
    label: 'Gestes',
    icon: '👋',
    emojis: [
      ['👋', 'bonjour salut'], ['🤚', 'main levee'], ['✋', 'stop'], ['🖖', 'vulcain'],
      ['👌', 'ok'], ['🤌', 'doigts pinces'], ['🤏', 'petit'], ['✌️', 'victoire paix'],
      ['🤞', 'doigts croises'], ['🫰', 'coeur doigts'], ['🤟', 'je taime'], ['🤘', 'rock'],
      ['🤙', 'appel'], ['👈', 'gauche'], ['👉', 'droite'], ['👆', 'haut'],
      ['👇', 'bas'], ['☝️', 'index'], ['👍', 'pouce haut like'], ['👎', 'pouce bas dislike'],
      ['✊', 'poing'], ['👊', 'poing frappe'], ['👏', 'applaudissements'], ['🙌', 'mains levees'],
      ['🫶', 'coeur mains'], ['🙏', 'merci prier'], ['💪', 'force'], ['🦾', 'bras robot']
    ]
  },
  {
    id: 'hearts',
    label: 'Cœurs',
    icon: '❤️',
    emojis: [
      ['❤️', 'coeur rouge'], ['🧡', 'coeur orange'], ['💛', 'coeur jaune'], ['💚', 'coeur vert'],
      ['💙', 'coeur bleu'], ['🩵', 'coeur bleu clair'], ['💜', 'coeur violet'], ['🖤', 'coeur noir'],
      ['🩶', 'coeur gris'], ['🤍', 'coeur blanc'], ['🤎', 'coeur marron'], ['💔', 'coeur brise'],
      ['❤️‍🔥', 'coeur feu'], ['❤️‍🩹', 'coeur soigne'], ['💕', 'deux coeurs'], ['💞', 'coeurs tournants'],
      ['💓', 'coeur battant'], ['💗', 'coeur grandissant'], ['💖', 'coeur brillant'], ['💘', 'coeur fleche'],
      ['💝', 'coeur cadeau'], ['💟', 'coeur decoration']
    ]
  },
  {
    id: 'animals',
    label: 'Animaux',
    icon: '🐱',
    emojis: [
      ['🐶', 'chien'], ['🐱', 'chat'], ['🐭', 'souris'], ['🐹', 'hamster'],
      ['🐰', 'lapin'], ['🦊', 'renard'], ['🐻', 'ours'], ['🐼', 'panda'],
      ['🐨', 'koala'], ['🐯', 'tigre'], ['🦁', 'lion'], ['🐮', 'vache'],
      ['🐸', 'grenouille'], ['🐵', 'singe'], ['🐧', 'pingouin'], ['🐦', 'oiseau'],
      ['🦆', 'canard'], ['🦉', 'hibou'], ['🦄', 'licorne'], ['🐝', 'abeille'],
      ['🦋', 'papillon'], ['🐢', 'tortue'], ['🐍', 'serpent'], ['🐙', 'poulpe'],
      ['🦈', 'requin'], ['🐬', 'dauphin'], ['🐳', 'baleine'], ['🦖', 'dinosaure']
    ]
  },
  {
    id: 'food',
    label: 'Nourriture',
    icon: '🍕',
    emojis: [
      ['🍏', 'pomme verte'], ['🍎', 'pomme rouge'], ['🍌', 'banane'], ['🍉', 'pasteque'],
      ['🍇', 'raisins'], ['🍓', 'fraise'], ['🫐', 'myrtilles'], ['🍒', 'cerises'],
      ['🍑', 'peche'], ['🥭', 'mangue'], ['🍍', 'ananas'], ['🥥', 'noix coco'],
      ['🍕', 'pizza'], ['🍔', 'burger'], ['🍟', 'frites'], ['🌭', 'hot dog'],
      ['🍿', 'popcorn'], ['🍩', 'donut'], ['🍪', 'cookie'], ['🎂', 'gateau'],
      ['🍫', 'chocolat'], ['🍬', 'bonbon'], ['☕', 'cafe'], ['🧋', 'bubble tea']
    ]
  },
  {
    id: 'activities',
    label: 'Activités',
    icon: '⚽',
    emojis: [
      ['⚽', 'football'], ['🏀', 'basket'], ['🏈', 'football americain'], ['⚾', 'baseball'],
      ['🎾', 'tennis'], ['🏐', 'volleyball'], ['🎱', 'billard'], ['🏓', 'ping pong'],
      ['🎮', 'jeu video gaming'], ['🕹️', 'manette arcade'], ['🎯', 'cible'], ['🎲', 'de'],
      ['🎧', 'casque musique'], ['🎵', 'musique'], ['🎤', 'micro'], ['🎸', 'guitare'],
      ['🏆', 'trophee'], ['🥇', 'medaille or'], ['🚀', 'fusee'], ['🎉', 'confettis']
    ]
  },
  {
    id: 'nature',
    label: 'Nature',
    icon: '🌈',
    emojis: [
      ['🔥', 'feu'], ['💧', 'eau'], ['🌊', 'vague'], ['🌈', 'arc en ciel'],
      ['☀️', 'soleil'], ['🌤️', 'soleil nuage'], ['⛈️', 'orage'], ['❄️', 'neige'],
      ['⚡', 'eclair'], ['🌙', 'lune'], ['⭐', 'etoile'], ['🌟', 'etoile brillante'],
      ['✨', 'etincelles'], ['☁️', 'nuage'], ['🌸', 'fleur'], ['🌹', 'rose'],
      ['🌻', 'tournesol'], ['🍀', 'trefle'], ['🌳', 'arbre'], ['🌍', 'terre']
    ]
  },
  {
    id: 'objects',
    label: 'Objets',
    icon: '💡',
    emojis: [
      ['💯', 'cent parfait'], ['💢', 'colere'], ['💥', 'explosion'], ['💫', 'vertige'],
      ['💬', 'bulle discussion'], ['💭', 'pensee'], ['💡', 'idee ampoule'], ['📱', 'telephone'],
      ['💻', 'ordinateur'], ['⌨️', 'clavier'], ['🖥️', 'ecran'], ['📷', 'appareil photo'],
      ['🔒', 'cadenas'], ['🔑', 'cle'], ['🛠️', 'outils'], ['⚙️', 'engrenage'],
      ['🎁', 'cadeau'], ['📦', 'colis'], ['✏️', 'crayon'], ['📌', 'punaise']
    ]
  }
];

export default function MessageReactions({ reactions = [], userId, onReact, showPicker = false }) {
  const [emoji, setEmoji] = useState('');
  const [activeGroup, setActiveGroup] = useState('smileys');
  const [search, setSearch] = useState('');
  const safeReactions = Array.isArray(reactions) ? reactions : [];
  const grouped = safeReactions.reduce((items, reaction) => {
    const current = items.find(item => item.emoji === reaction.emoji);
    if (current) current.users.push(reaction);
    else items.push({ emoji: reaction.emoji, users: [reaction] });
    return items;
  }, []);

  const activeEmojis = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    if (query) {
      return emojiGroups.flatMap(group => group.emojis).filter(([value, keywords]) =>
        value.includes(query) || keywords.includes(query)
      );
    }
    return emojiGroups.find(group => group.id === activeGroup)?.emojis || emojiGroups[0].emojis;
  }, [activeGroup, search]);

  const react = value => {
    const normalized = value.trim();
    if (!normalized) return;
    onReact?.(normalized);
    setEmoji('');
    setSearch('');
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 7 }}>
      {grouped.map(({ emoji: reactionEmoji, users }) => {
        const selected = users.some(item => (item.userId?._id || item.userId)?.toString() === userId?.toString());
        return (
          <button
            key={reactionEmoji}
            type="button"
            aria-label={`${reactionEmoji}, ${users.length} réaction(s)`}
            onClick={() => react(reactionEmoji)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 14,
              padding: '3px 7px',
              background: selected ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            <span>{reactionEmoji}</span>
            <span>{users.length}</span>
          </button>
        );
      })}
      {showPicker && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            width: 'min(320px, calc(100vw - 24px))',
            maxWidth: 'calc(100vw - 24px)',
            minWidth: 0,
            flex: '0 0 auto',
            boxSizing: 'border-box',
            alignSelf: 'flex-start',
            marginTop: 5,
            padding: 10,
            border: '1px solid var(--border)',
            borderRadius: 13,
            background: 'var(--bg-secondary)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)'
          }}
        >
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Rechercher un emoji..."
            aria-label="Rechercher un emoji"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid var(--border)',
              borderRadius: 9,
              padding: '10px 12px',
              color: 'var(--text-primary)',
              background: 'var(--bg-primary)',
              outlineColor: 'var(--accent)'
            }}
          />
          {!search.trim() && (
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 3 }}>
              {emojiGroups.map(group => (
                <button
                  key={group.id}
                  type="button"
                  title={group.label}
                  aria-label={group.label}
                  aria-pressed={activeGroup === group.id}
                  onClick={() => setActiveGroup(group.id)}
                  style={{
                    flex: '0 0 36px',
                    width: 36,
                    height: 34,
                    border: activeGroup === group.id ? '1px solid var(--accent)' : '1px solid transparent',
                    borderRadius: 8,
                    background: activeGroup === group.id ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
                    fontSize: 19,
                    cursor: 'pointer'
                  }}
                >
                  {group.icon}
                </button>
              ))}
            </div>
          )}
          <div
            role="group"
            aria-label="Emojis disponibles"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
              gap: 3,
              maxHeight: 160,
              overflowY: 'auto',
              padding: 2
            }}
          >
            {activeEmojis.map(([value, keywords]) => (
              <button
                key={value}
                type="button"
                title={keywords}
                aria-label={keywords}
                aria-pressed={emoji === value}
                onClick={() => setEmoji(value)}
                style={{
                  minWidth: 0,
                  aspectRatio: '1',
                  border: emoji === value ? '1px solid var(--accent)' : '1px solid transparent',
                  borderRadius: 8,
                  background: emoji === value ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                  fontSize: 21,
                  cursor: 'pointer'
                }}
              >
                {value}
              </button>
            ))}
            {activeEmojis.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                Aucun emoji trouvé
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
              <span style={{ fontSize: 25, lineHeight: 1 }}>{emoji || '🙂'}</span>
              <span>{emoji ? 'Emoji sélectionné' : 'Sélectionne un emoji'}</span>
            </div>
            <button
              type="button"
              disabled={!emoji}
              onClick={() => react(emoji)}
              style={{
                flex: '0 0 auto',
                border: 0,
                borderRadius: 8,
                padding: '9px 13px',
                background: emoji ? 'var(--accent)' : 'var(--border)',
                color: '#fff',
                cursor: emoji ? 'pointer' : 'not-allowed',
                opacity: emoji ? 1 : 0.55
              }}
            >
              Réagir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
