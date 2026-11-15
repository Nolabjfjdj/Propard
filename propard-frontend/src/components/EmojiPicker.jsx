import React, { useEffect, useRef, useState } from 'react';

const emojiGroups = [
  ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘','😋','😎','🤩','🥳','😭','😢','🥺','😡','🤬','🤔','🤨','😴','🤯','😱','🥶','🤗','🫡','🤝','🙏','👏','🙌','👍','👎','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','🔥','✨','⭐','💯','🎉','🎊','💀','👀','💪','🫶','🐱','🐶','🦊','🐸','🍌','🍕','🍔','🍟','🍿','⚽','🎮','🎧','🚀']
];

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="propardEmojiRoot" ref={rootRef}>
      <style>{`
        .propardEmojiRoot{position:relative;display:flex;align-items:center;flex-shrink:0}
        .propardEmojiTrigger{width:42px;height:42px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font-size:21px;cursor:pointer;display:grid;place-items:center}
        .propardEmojiTrigger:hover{background:var(--bg-primary)}
        .propardEmojiPanel{position:absolute;right:0;bottom:calc(100% + 10px);width:300px;max-height:260px;overflow-y:auto;padding:10px;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);z-index:1200}
        .propardEmojiItem{border:0;background:transparent;border-radius:7px;padding:6px 2px;font-size:22px;line-height:1.2;cursor:pointer}
        .propardEmojiItem:hover{background:var(--bg-tertiary)}
        @media(max-width:768px){.propardEmojiRoot{display:none!important}}
      `}</style>
      <button type="button" className="propardEmojiTrigger" aria-label="Choisir un emoji" title="Choisir un emoji" onClick={() => setOpen(value => !value)}>😀</button>
      {open && (
        <div className="propardEmojiPanel" role="dialog" aria-label="Sélecteur d'emojis">
          {emojiGroups.flat().map((emoji, index) => (
            <button key={index} type="button" className="propardEmojiItem" onClick={() => { onSelect(emoji); setOpen(false); }} aria-label={emoji}>{emoji}</button>
          ))}
        </div>
      )}
    </div>
  );
}
