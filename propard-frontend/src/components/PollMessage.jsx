import React from 'react';

const voteEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

export default function PollMessage({ content, reactions = [], userId, onVote, disabled = false }) {
  if (disabled || typeof content !== 'string') {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sondage chiffré impossible à déchiffrer sur cet appareil.</p>;
  }
  let poll;
  try {
    poll = JSON.parse(content);
  } catch {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sondage impossible à lire.</p>;
  }

  if (
    poll?.type !== 'propard-poll' ||
    typeof poll.question !== 'string' ||
    !Array.isArray(poll.options) ||
    poll.options.length < 2 ||
    poll.options.length > 6 ||
    poll.options.some(option => typeof option !== 'string' || !option.trim())
  ) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Format de sondage invalide.</p>;
  }

  const totalVotes = reactions.filter(reaction => voteEmojis.includes(reaction.emoji)).length;
  const myVote = reactions.find(reaction =>
    reaction.userId?.toString() === userId?.toString() && voteEmojis.includes(reaction.emoji)
  )?.emoji;

  return (
    <div style={{ minWidth: 220, maxWidth: 360, padding: '2px 0' }}>
      <strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>{poll.question}</strong>
      <div style={{ display: 'grid', gap: 8 }}>
        {poll.options.map((option, index) => {
          const emoji = voteEmojis[index];
          const count = reactions.filter(reaction => reaction.emoji === emoji).length;
          const percentage = totalVotes ? Math.round(count / totalVotes * 100) : 0;
          const selected = myVote === emoji;
          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => onVote(emoji)}
              aria-pressed={selected}
              style={{
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                width: '100%',
                padding: '9px 10px',
                borderRadius: 8,
                border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: disabled ? 'not-allowed' : 'pointer'
              }}
            >
              <span style={{ position: 'absolute', inset: '0 auto 0 0', width: percentage + '%', background: 'var(--accent-glow)', pointerEvents: 'none' }} />
              <span style={{ position: 'relative', overflowWrap: 'anywhere' }}>{emoji} {option}</span>
              <strong style={{ position: 'relative', fontSize: 11, whiteSpace: 'nowrap' }}>{count} · {percentage}%</strong>
            </button>
          );
        })}
      </div>
      <small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary)' }}>
        {totalVotes} vote(s) · {myVote ? 'Ton vote : ' + myVote : 'Choisis une réponse'}
      </small>
    </div>
  );
}
