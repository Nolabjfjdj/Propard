import React, { useState } from 'react';

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
        <form
          onSubmit={event => {
            event.preventDefault();
            react(emoji);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 5,
            padding: 7,
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--bg-secondary)'
          }}
        >
          <input
            type="text"
            value={emoji}
            onChange={event => setEmoji(event.target.value)}
            placeholder="Choisir un emoji..."
            aria-label="Emoji à envoyer"
            maxLength={32}
            style={{
              width: 150,
              minWidth: 0,
              border: '1px solid var(--border)',
              borderRadius: 7,
              padding: '7px 9px',
              color: 'var(--text-primary)',
              background: 'var(--bg-primary)'
            }}
          />
          <button
            type="submit"
            disabled={!emoji.trim()}
            style={{
              border: 0,
              borderRadius: 7,
              padding: '7px 10px',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Réagir
          </button>
        </form>
      )}
    </div>
  );
}
