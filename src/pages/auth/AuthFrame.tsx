import type { ReactNode } from 'react';
import { t } from '../../lib/i18n';
import { Logo, LogoFull } from '../../components/Logo';

export function AuthFrame({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-side" aria-hidden>
        <LogoFull width={240} />
        <p className="auth-tagline">Control with confidence.</p>
        <div className="ticket">
          <div className="ticket-head"><span className="ref">JOB-0142</span><span className="badge st-in_progress">In progress</span></div>
          <div className="ticket-body">
            <span className="ticket-title">Install 5 kVA inverter and 8 panels</span>
            <dl className="ticket-rows">
              <dt>Customer</dt><dd>Okafor Residence, GRA</dd>
              <dt>Technician</dt><dd>Daniel E.</dd>
              <dt>Materials</dt><dd>6 mm cable × 24 m, 2 breakers</dd>
            </dl>
          </div>
          <div className="ticket-foot"><span>Today, 10:30</span><strong>3 photos</strong></div>
        </div>
        <p className="auth-note">{t('app.pitch')} Works in your currency, time zone and tax rules.</p>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <div className="auth-brand-mobile"><Logo size={30} tagline /></div>
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
