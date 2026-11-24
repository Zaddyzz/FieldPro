import { logoUrl } from '../lib/logo';

/** Business logo for the top of a quote or invoice. */
export function PaperLogo({ path, name }: { path: string | null | undefined; name: string }) {
  const src = logoUrl(path);
  return src ? <img className="paper-logo" src={src} alt={`${name} logo`} /> : null;
}

/** Faint logo behind the document body; decorative, so hidden from screen readers. */
export function PaperWatermark({ path, on }: { path: string | null | undefined; on: boolean }) {
  const src = on ? logoUrl(path) : null;
  return src ? <img className="paper-watermark" src={src} alt="" aria-hidden /> : null;
}
