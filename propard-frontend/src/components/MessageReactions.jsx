import React, { useState } from 'react';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀'];

export default function MessageReactions({ reactions = [], userId, onReact }) {
  const [open, setOpen] = useState(false);
  const safeReactions = Array.isArray(reactions) ? reactions : [];
  const grouped = EMOJIS.map(emoji => ({
    emoji,
    users: safeReactions.filter(item => item.emoji === emoji)
  })).filter(item => item.users.length > 0);

  const react = emoji => {
    setOpen(false);
    onReact?.(emoji);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 7 }}>
      {grouped.map(({ emoji, users }) => {
        const selected = users.some(item => (item.userId?._id || item.userId)?.toString() === userId?.toString());
        return (
          <button
            key={emoji}
            type="button"
            aria-label={`${emoji}, ${users.length} réaction(s)`}
            onClick={() => react(emoji)}
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
            <span>{emoji}</span>
            <span>{users.length}</span>
          </button>
        );
      })}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          aria-label="Ajouter une réaction"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          style={{
            width: 27,
            height: 25,
            border: '1px solid var(--border)',
            borderRadius: 14,
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer'
          }}
        >
          +
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              zIndex: 30,
              bottom: 'calc(100% + 6px)',
              left: 0,
              display: 'flex',
              gap: 3,
              padding: 5,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--bg-secondary)',
              boxShadow: 'var(--shadow)'
            }}
          >
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                aria-label={`Réagir avec ${emoji}`}
                onClick={() => react(emoji)}
                style={{
                  border: 0,
                  borderRadius: 7,
                  padding: 4,
                  background: 'transparent',
                  fontSize: 18,
                  cursor: 'pointer'
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
