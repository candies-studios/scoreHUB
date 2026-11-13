import { useId } from 'react';

/**
 * The ScoreHUB mark, traced from the brand artwork into two interlocking
 * polygons — the white upper hook and the blue lower hook.
 *
 * Kept as inline SVG rather than an <img> so it stays sharp at any size and
 * can recolour per surface. The raster versions in /public are only for
 * favicons, app icons and social previews.
 */

const MARK_WHITE =
  'M42.27 0 L9.02 26.65 L7.05 29.45 L4.85 41.92 L20.42 54.85 L24.46 53.52 ' +
  'L30.4 48.01 L20.26 40.13 L20.26 37.88 L43.38 19.16 L44.69 18.28 ' +
  'L78.26 18.28 L100 0.22 Z';

const MARK_BLUE =
  'M40.75 28.85 L29.52 37.43 L38.52 44.71 L71.37 45.51 L51.78 61.01 ' +
  'L18.27 61.01 L0 75.55 L0 80.4 L52.85 80.4 L87.67 53.31 L90.31 39.58 ' +
  'L77.82 28.41 Z';

export function LogoMark({
  className = '',
  /** Colour of the upper hook. 'currentColor' lets it invert on light surfaces. */
  topColor = '#ffffff',
  title,
}: {
  className?: string;
  topColor?: string;
  title?: string;
}) {
  /**
   * Unique per instance so two marks on one page can't collide, and — the
   * part that matters — identical on the server and in the browser.
   *
   * A module-level counter is not. The server process is long-lived, so by
   * the time you load the page its counter has already advanced; the browser
   * starts again at one. React then finds `sh-grad-7` in the HTML where it
   * expected `sh-grad-1` and warns that the tree could not be hydrated.
   * useId exists precisely for this.
   *
   * The raw value is stripped to word characters because its punctuation
   * varies by React version (`:r0:` on 18, `«r0»` on 19) and would be awkward
   * inside a url(#…) reference.
   */
  const id = `sh-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      viewBox="0 0 100 80.4"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#29b6ff" />
          <stop offset="0.55" stopColor="#1580f5" />
          <stop offset="1" stopColor="#0b3fd4" />
        </linearGradient>
      </defs>
      <path d={MARK_WHITE} fill={topColor} />
      <path d={MARK_BLUE} fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * Full horizontal lockup: mark + "scoreHUB" + the tagline rule.
 *
 * `size` controls the wordmark scale; the mark tracks it. `tagline` shows the
 * RANKINGS / STATS / EVENTS / ATHLETES strip from the brand artwork — worth
 * having on the sign-in screen, too noisy in a header.
 */
export function Logo({
  className = '',
  size = 'md',
  tagline = false,
  onDark = true,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  tagline?: boolean;
  onDark?: boolean;
}) {
  // The mark sits slightly taller than the wordmark, as it does in the artwork.
  const scale = {
    sm: { mark: 'h-7', text: 'text-xl', gap: 'gap-2' },
    md: { mark: 'h-9', text: 'text-[1.75rem]', gap: 'gap-2.5' },
    lg: { mark: 'h-16', text: 'text-5xl', gap: 'gap-4' },
  }[size];

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={`inline-flex items-center ${scale.gap}`}>
        <LogoMark
          className={`${scale.mark} w-auto shrink-0`}
          topColor={onDark ? '#ffffff' : '#0b1120'}
          title="ScoreHUB"
        />
        <span
          className={`${scale.text} font-black italic leading-none tracking-tight`}
          style={{ fontStretch: 'condensed' }}
        >
          <span className={onDark ? 'text-white' : 'text-slate-900'}>score</span>
          <span className="text-sky-400">HUB</span>
        </span>
      </span>

      {tagline && (
        <span
          className={`mt-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${
            onDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          Rankings / Stats / Events / Athletes
        </span>
      )}
    </span>
  );
}
