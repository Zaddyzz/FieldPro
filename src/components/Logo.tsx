/** COVARO brand assets, cut from the approved logo file (public/brand). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return <img className="logo-mark" src="/brand/covaro-mark.png" width={size} height={size} alt="" aria-hidden />;
}

/** Full logo with tagline: white wordmark, for dark surfaces only (sidebar, sign-in panel). */
export function LogoFull({ width = 200 }: { width?: number }) {
  return <img className="logo-full" src="/brand/covaro-logo.png" width={width} height={Math.round(width * 231 / 900)} alt="COVARO — Control with confidence." />;
}

/** Mark + wordmark in the current text colour, for light or dark surfaces. */
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
