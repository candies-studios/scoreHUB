export default function Brand({ onClick }) {
  return (
    <div className="brand" onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="brand-word">
        Score<span>Hub</span>
      </div>
      <svg className="brand-swoosh" viewBox="0 0 120 12" fill="none" aria-hidden="true">
        <path
          d="M2 8C22 1 44 1 62 5c16 3.6 34 4.6 56 -1"
          stroke="url(#sh-grad)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="sh-grad" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3b23c9" />
            <stop offset="1" stopColor="#7aa2ff" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
