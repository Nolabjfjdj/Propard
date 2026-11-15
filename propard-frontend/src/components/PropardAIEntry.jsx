import { useRef, useState } from 'react';

export default function PropardAIEntry() {
  const [hidden, setHidden] = useState(() => localStorage.getItem('propard_ai_hidden') === 'true');
  const [menu, setMenu] = useState(null);
  const timer = useRef(null);
  const suppressClick = useRef(false);

  if (hidden) return null;

  const openMenu = (x, y) => {
    suppressClick.current = true;
    setMenu({ x: Math.max(8, Math.min(x, window.innerWidth - 150)), y: Math.max(8, Math.min(y, window.innerHeight - 70)) });
  };

  const startPress = event => {
    const touch = event.touches?.[0];
    if (!touch) return;
    timer.current = window.setTimeout(() => openMenu(touch.clientX, touch.clientY), 650);
  };

  const cancelPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 4px' }}>IA</div>
      <a
        href="/ai"
        onContextMenu={event => { event.preventDefault(); openMenu(event.clientX, event.clientY); }}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onTouchMove={cancelPress}
        onClick={event => { if (suppressClick.current) { event.preventDefault(); suppressClick.current = false; } }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 9, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13, fontWeight: 650 }}
      >
        <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent-glow)', border: '1px solid var(--accent)', color: 'var(--accent)', fontWeight: 800 }}>P</span>
        Propard AI
      </a>
      {menu && <>
        <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 500 }} />
        <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 501, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 9, padding: 5, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
          <button onClick={() => { localStorage.setItem('propard_ai_hidden', 'true'); setHidden(true); setMenu(null); }} style={{ border: 0, background: 'transparent', color: 'var(--text-primary)', padding: '9px 14px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13 }}>Masquer</button>
        </div>
      </>}
    </div>
  );
}
