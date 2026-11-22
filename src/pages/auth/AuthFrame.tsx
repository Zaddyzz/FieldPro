import type { ReactNode } from 'react';
import { t } from '../../lib/i18n';

export function AuthFrame({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-side" aria-hidden>
        <div className="brand brand-light"><span className="brand-mark">F</span>{t('app.name')}</div>
        <p className="auth-tagline">{t('app.tagline')}</p>
        <ul className="auth-points">
          <li><span>01</span>Jobs, schedules and technicians in one place</li>
          <li><span>02</span>Every customer's history, on every phone</li>
          <li><span>03</span>Works in your currency, time zone and tax rules</li>
        </ul>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <div className="brand auth-brand-mobile"><span className="brand-mark">F</span>{t('app.name')}</div>
          <h1>{title}</h1>
          {sub && <p className="muted">{sub}</p>}
          {children}
          {footer && <div className="auth-foot">{footer}</div>}
        </div>
      </section>
    </div>
  );
}

export const strongPassword = (p: string) => p.length >= 10 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
