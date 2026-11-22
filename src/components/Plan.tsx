import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBusiness, type Usage } from '../lib/session';
import { formatDate } from '../lib/format';
import { money } from '../lib/money';
import { t, type MessageKey } from '../lib/i18n';

const DAY = 86_400_000;

/** One-line notice above every page when the trial is ending or creation is blocked. */
export function PlanBanner() {
  const { usage, isAdmin } = useBusiness();
  if (!usage) return null;
  if (!usage.writable && usage.blocked_reason) {
    return (
      <div className="plan-banner plan-banner-block" role="status">
        <span>{t(`plan.banner.${usage.blocked_reason}` as MessageKey)}</span>
        {isAdmin && <Link to="/settings#plan">{t('plan.banner.action')}</Link>}
      </div>
    );
  }
  if (usage.status === 'trial' && usage.trial_ends_at) {
    const days = Math.ceil((new Date(usage.trial_ends_at).getTime() - Date.now()) / DAY);
    if (days <= 5) {
      return (
        <div className="plan-banner" role="status">
          <span>{days <= 0 ? t('plan.banner.trialToday') : t('plan.banner.trialSoon', { days })}</span>
          {isAdmin && <Link to="/settings#plan">{t('plan.banner.action')}</Link>}
        </div>
      );
    }
  }
  return null;
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = limit && used >= limit ? 'full' : limit && pct >= 80 ? 'near' : '';
  return (
    <div className={`meter ${tone}`}>
      <div className="meter-top">
        <span>{label}</span>
        <strong>{limit ? t('plan.of', { used: used.toLocaleString(), limit: limit.toLocaleString() }) : `${used.toLocaleString()} (${t('plan.unlimited').toLowerCase()})`}</strong>
      </div>
      {limit ? <div className="meter-track" aria-hidden><span style={{ width: `${pct}%` }} /></div> : null}
    </div>
  );
}

const limitText = (n: number | null, unit: string) => `${n === null ? t('plan.unlimited').toLowerCase() : n.toLocaleString()} ${unit}`;

function priceFor(p: Usage['plans'][number], currency: string) {
  const v = p.prices?.[currency] ?? p.prices?.USD;
  if (v === undefined) return null;
  const cur = p.prices?.[currency] !== undefined ? currency : 'USD';
  return `${money(v, cur)} ${t('plan.perMonth')}`;
}

export function PlanCard() {
  const { usage, business } = useBusiness();
  const loc = useLocation();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (loc.hash === '#plan' && usage) ref.current?.scrollIntoView({ block: 'start' }); }, [loc.hash, usage]);
  if (!usage) return null;
  const statusLine = usage.status === 'trial' && usage.trial_ends_at
    ? t('plan.trialEnds', { date: formatDate(usage.trial_ends_at, business.time_zone, business.date_format) })
    : usage.current_period_end ? t('plan.renews', { date: formatDate(usage.current_period_end, business.time_zone, business.date_format) }) : null;
  const wa = usage.support.whatsapp?.replace(/\D/g, '');

  return (
    <section className="card stack" id="plan" ref={ref}>
      <h2 className="card-title">{t('plan.title')}</h2>
      <div className="plan-now">
        <div>
          <span className="plan-name">{usage.plan_name}</span>
          {!(usage.plan === 'trial' && usage.status === 'trial') && (
            <span className={`plan-status plan-status-${usage.writable ? usage.status : 'blocked'}`}>{t(`plan.status.${usage.status}` as MessageKey)}</span>)}
        </div>
        {statusLine && <span className="muted">{statusLine}</span>}
      </div>
      <Meter label={t('plan.staff')} used={usage.staff} limit={usage.max_staff} />
      <Meter label={t('plan.jobs')} used={usage.jobs_this_month} limit={usage.max_jobs_month} />
      <Meter label={t('plan.customers')} used={usage.customers} limit={usage.max_customers} />

      <h2 className="card-title">{t('plan.available')}</h2>
      <ul className="plan-list">
        {usage.plans.map((p) => {
          const msg = encodeURIComponent(t('plan.upgradeMessage', { business: business.name, plan: p.name }));
          return (
            <li key={p.code} className={p.code === usage.plan ? 'current' : ''}>
              <div className="plan-list-head">
                <strong>{p.name}</strong>
                <span>{priceFor(p, business.currency) ?? t('plan.priceOnRequest')}</span>
              </div>
              <p className="muted">
                {limitText(p.max_staff, t('plan.unitStaff'))}, {limitText(p.max_jobs_month, t('plan.unitJobs'))}, {limitText(p.max_customers, t('plan.unitCustomers'))}
              </p>
              {p.code !== usage.plan && (wa || usage.support.email) && (
                <div className="plan-actions">
                  {wa && <a className="btn btn-secondary btn-sm" href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noreferrer">{t('plan.whatsappUs')}</a>}
                  {usage.support.email && <a className="btn btn-secondary btn-sm" href={`mailto:${usage.support.email}?subject=${encodeURIComponent('COVARO upgrade')}&body=${msg}`}>{t('plan.emailUs')}</a>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="fine">{usage.support.note || t('plan.upgradeHow')}</p>
      {!wa && !usage.support.email && <p className="fine">{t('plan.noContact')}</p>}
    </section>
  );
}
