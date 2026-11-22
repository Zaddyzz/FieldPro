/** COVARO mark: a geometric C — a thick 280° arc with a rose-gold keystone set into the opening. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <path d="M24.2 8.9A11 11 0 1 0 24.2 23.1" fill="none" stroke="currentColor" strokeWidth="4.6" strokeLinecap="butt" />
      <rect x="22.4" y="13.6" width="4.8" height="4.8" transform="rotate(45 24.8 16)" fill="var(--rose)" />
    </svg>
  );
}

export function Logo({ size = 30, tagline }: { size?: number; tagline?: boolean }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-text">
        <span className="logo-word">COVARO</span>
        {tagline && <span className="logo-tag">CONTROL WITH CONFIDENCE.</span>}
      </span>
    </span>
  );
}
