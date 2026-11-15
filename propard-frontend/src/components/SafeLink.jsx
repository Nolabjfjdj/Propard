import React, { useState } from 'react';

const TRUSTED_DOMAINS = [
  'google.com', 'google.fr', 'youtube.com', 'youtu.be', 'discord.com', 'discord.gg',
  'github.com', 'github.io', 'gitlab.com', 'microsoft.com', 'live.com', 'outlook.com',
  'apple.com', 'icloud.com', 'amazon.com', 'wikipedia.org', 'reddit.com',
  'instagram.com', 'facebook.com', 'messenger.com', 'tiktok.com', 'x.com',
  'twitter.com', 'twitch.tv', 'spotify.com', 'netflix.com', 'openai.com',
  'chatgpt.com', 'anthropic.com', 'claude.ai', 'steamcommunity.com', 'steampowered.com',
  'store.steampowered.com', 'roblox.com', 'minecraft.net', 'mojang.com',
  'cloudflare.com', 'vercel.com', 'render.com', 'npmjs.com', 'nodejs.org',
  'w3.org', 'developer.mozilla.org', 'stackoverflow.com', 'w3schools.com',
  'paypal.com', 'stripe.com', 'gouv.fr', 'service-public.fr', 'propard.site'
];

export function isTrustedDomain(hostname) {
  const host = hostname.toLowerCase().replace(/^www\\./, '');
  return TRUSTED_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain));
}

export default function SafeLink({ href, children, className, style }) {
  const [warning, setWarning] = useState(false);
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return <>{children}</>;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return <>{children}</>;
  const trusted = isTrustedDomain(parsed.hostname);
  const open = () => {
    window.open(parsed.href, '_blank', 'noopener,noreferrer');
    setWarning(false);
  };
  return <>
    <a
      href={parsed.href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        if (trusted) open();
        else setWarning(true);
      }}
    >{children}</a>
    {warning && <div role="presentation" onClick={() => setWarning(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.68)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="propard-link-warning-title" onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 390, boxSizing: 'border-box', padding: 22, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 25, marginBottom: 8 }}>⚠️</div>
        <h2 id="propard-link-warning-title" style={{ fontSize: 17, margin: '0 0 9px' }}>Lien non vérifié</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 10px' }}>Ce domaine ne figure pas dans la liste des sites connus de Propard. Cela ne signifie pas forcément qu’il est dangereux, mais vérifie l’adresse avant de continuer.</p>
        <p style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere', margin: '0 0 18px' }}>{parsed.hostname}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setWarning(false)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Annuler</button>
          <button type="button" onClick={open} style={{ border: 0, borderRadius: 8, padding: '9px 12px', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>Continuer vers le site</button>
        </div>
      </section>
    </div>}
  </>;
}
