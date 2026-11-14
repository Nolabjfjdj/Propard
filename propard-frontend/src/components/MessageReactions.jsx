import React, { useState } from 'react';
import EmojiPicker from 'emoji-picker-react';

export default function MessageReactions({ reactions = [], userId, onReact, showPicker = false }) {
  const [emoji, setEmoji] = useState('');
  const safeReactions = Array.isArray(reactions) ? reactions : [];
  const grouped = safeReactions.reduce((items, reaction) => {
    const current = items.find(item => item.emoji === reaction.emoji);
    if (current) current.users.push(reaction);
    else items.push({ emoji: reaction.emoji, users: [reaction] });
    return items;
  }, []);

  const react = value => {
    const normalized = value.trim();
    if (!normalized) return;
    onReact?.(normalized);
    setEmoji('');
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
            alignItems: 'stretch',
            gap: 9,
            width: 'min(100%, 350px)',
            marginTop: 5,
            padding: 9,
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--bg-secondary)'
          }}
        >
          <EmojiPicker
            onEmojiClick={emojiObject => setEmoji(emojiObject.emoji)}
            autoFocusSearch
            searchPlaceholder="Rechercher un emoji..."
            width="100%"
            height={320}
            lazyLoadEmojis={false}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
          {emoji && (
            <div
              aria-live="polite"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minHeight: 38,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: 24
              }}
            >
              <span>{emoji}</span>
              <span style={{ fontSize: 12 }}>Emoji sélectionné</span>
            </div>
          )}
          <button
            type="button"
            disabled={!emoji.trim()}
            onClick={() => react(emoji)}
            style={{
              border: 0,
              borderRadius: 8,
              padding: '9px 12px',
              background: emoji.trim() ? 'var(--accent)' : 'var(--border)',
              color: '#fff',
              cursor: emoji.trim() ? 'pointer' : 'not-allowed',
              opacity: emoji.trim() ? 1 : 0.6
            }}
          >
            Réagir
          </button>
        </div>
      )}
    </div>
  );
}
