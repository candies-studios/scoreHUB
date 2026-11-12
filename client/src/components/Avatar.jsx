import { useState } from 'react';
import { mediaUrl } from '../api/client.js';

/**
 * A fighter's photo, with initials as the fallback.
 *
 * Photos live in client/public/fighters/<slug>.jpg and are referenced by the
 * roster as a relative path. Until a real photo is dropped in, the file 404s —
 * so rather than showing a broken image, this renders the fighter's initials
 * on a corner-tinted tile. Add the file later and it appears on its own, no
 * code change needed. See docs/DATA.md.
 */
export default function Avatar({ name, photoUrl, corner, size = 40, rounded = '50%' }) {
  const [failed, setFailed] = useState(false);
  const src = photoUrl ? mediaUrl(photoUrl) : '';
  const showPhoto = src && !failed;

  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const tint =
    corner === 'red'
      ? { bg: 'rgba(224,45,69,0.16)', fg: '#c4162c', ring: 'rgba(224,45,69,0.45)' }
      : corner === 'blue'
      ? { bg: 'rgba(61,123,255,0.16)', fg: '#2f49d1', ring: 'rgba(61,123,255,0.45)' }
      : { bg: 'rgba(99,102,241,0.14)', fg: '#4f2fe0', ring: 'rgba(99,102,241,0.4)' };

  const base = {
    width: size,
    height: size,
    borderRadius: rounded,
    flexShrink: 0,
    objectFit: 'cover',
    display: 'block',
  };

  if (showPhoto) {
    return (
      <img
        src={src}
        alt={name || 'Fighter'}
        style={{ ...base, border: `1px solid ${tint.ring}` }}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-label={name || 'Fighter'}
      title={name || ''}
      style={{
        ...base,
        background: tint.bg,
        color: tint.fg,
        border: `1px solid ${tint.ring}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        letterSpacing: '0.02em',
        userSelect: 'none',
      }}
    >
      {initials}
    </span>
  );
}
