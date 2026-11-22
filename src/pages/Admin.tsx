import { useMemo, useState, type FormEvent } from 'react';
import { supabase, errorMessage } from '../lib/supabase';
import { must, useAsync } from '../lib/data';
import { relativeFromNow } from '../lib/format';
import { digits } from '../lib/money';
import { t, type MessageKey } from '../lib/i18n';
import { Button, ErrorBox, Field, PageHeader, Spinner, useToast } from '../components/ui';

interface AdminBusiness {
  id: string; name: string; industry: string; country: string; currency: string; created_at: string; business_status: string;
  owner_email: string | null; plan: string | null; status: string | null; trial_ends_at: string | null; current_period_end: string | null;
  notes: string | null; staff: number; customers: number; jobs: number; jobs_30d: number; last_activity: string | null;
}
interface Plan { code: string; name: string; sort: number; max_staff: number | null; max_jobs_month: number | null; max_customers: number | null; prices: Record<string, number>; public: boolean }
interface Overview { businesses: AdminBusiness[]; plans: Plan[]; settings: { support_email: string | null; support_whatsapp: string | null; upgrade_note: string | null } }

const STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'suspended'] as const;
const isBlocked = (b: AdminBusiness) =>
  b.business_status === 'suspended' || b.status === 'suspended' || b.status === 'cancelled'
  || (b.status === 'trial' && !!b.trial_ends_at && new Date(b.trial_ends_at) < new Date());

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
// end of the chosen day in UTC, so "until 30 Nov" includes all of 30 Nov everywhere
const endOfDay = (d: string) => (d ? new Date(d + 'T23:59:59Z').toISOString() : null);

export default function Admin() {
  const { data, error, loading, reload } = useAsync(async () => must(await supabase.rpc('admin_overview')) as Overview, []);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const toast = useToast();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.businesses ?? []).filter((b) => !s || b.name.toLowerCase().includes(s) || (b.owner_email ?? '').toLowerCase().includes(s));
  }, [data, q]);

  if (loading && !data) return <Spinner />;
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data) return null;

  const all = data.businesses;
  const planName = (code: string | null) => data.plans.find((p) => p.code === code)?.name ?? code ?? '—';

  return (
    <div className="page">
      <PageHeader title={t('admin.title')} sub={t('admin.sub')} />
      <p className="admin-counts">
        <span>{t('admin.total', { n: all.length })}</span>
        <span>{t('admin.trialing', { n: all.filter((b) => b.status === 'trial' && !isBlocked(b)).length })}</span>
        <span>{t('admin.paying', { n: all.filter((b) => b.status === 'active').length })}</span>
        <span>{t('admin.blocked', { n: all.filter(isBlocked).length })}</span>
      </p>

      <section className="panel">
        <div className="panel-title-row">
          <h2 className="panel-title">{t('admin.businesses')}</h2>
          <input type="search" className="admin-search" placeholder={t('admin.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('admin.search')} />
        </div>
        <ul className="admin-list">
          {list.map((b) => (
            <li key={b.id}>
              <div className="admin-row">
                <div className="admin-main">
                  <strong>{b.name}</strong>
                  <span className="muted">{b.owner_email ?? '—'}, {b.country}, {t(`industry.${b.industry}` as MessageKey)}</span>
                  <span className="muted">{t('admin.usage', { staff: b.staff, customers: b.customers, jobs: b.jobs, jobs30: b.jobs_30d })}</span>
                  <span className="fine">{t('admin.created')} {new Date(b.created_at).toLocaleDateString()}{b.last_activity ? `. ${t('admin.lastActive', { when: relativeFromNow(b.last_activity) })}` : ''}</span>
                </div>
                <div className="admin-side">
                  <span className="plan-name-sm">{planName(b.plan)}</span>
                  <span className={`plan-status plan-status-${isBlocked(b) ? 'blocked' : b.status}`}>
                    {t(`plan.status.${b.status ?? 'trial'}` as MessageKey)}
                    {b.status === 'trial' && b.trial_ends_at ? `, ${new Date(b.trial_ends_at) < new Date() ? 'ended' : 'ends'} ${dateOnly(b.trial_ends_at)}` : ''}
                  </span>
                  <Button variant="secondary" className="btn-sm" onClick={() => setEditing(editing === b.id ? null : b.id)} aria-expanded={editing === b.id}>
                    {t('admin.change')}
                  </Button>
                </div>
              </div>
              {editing === b.id && (
                <SubscriptionForm business={b} plans={data.plans}
                  onDone={async () => { setEditing(null); toast.show(t('admin.saved')); await reload(); }} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="two-col rep-gap">
        <section className="panel">
          <h2 className="panel-title">{t('admin.plans')}</h2>
          <div className="admin-plans">
            {data.plans.map((p) => <PlanForm key={p.code + p.sort} plan={p} onSaved={async () => { toast.show(t('settings.saved')); await reload(); }} />)}
          </div>
        </section>
        <ContactForm initial={data.settings} onSaved={async () => { toast.show(t('settings.saved')); await reload(); }} />
      </div>
      {toast.node}
    </div>
  );
}

function SubscriptionForm({ business, plans, onDone }: { business: AdminBusiness; plans: Plan[]; onDone: () => void }) {
  const [plan, setPlan] = useState(business.plan ?? 'trial');
  const [status, setStatus] = useState(business.status ?? 'trial');
  const [trialEnd, setTrialEnd] = useState(dateOnly(business.trial_ends_at));
  const [periodEnd, setPeriodEnd] = useState(dateOnly(business.current_period_end));
  const [notes, setNotes] = useState(business.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'trial' && !trialEnd) return setError(t('admin.trialEnd'));
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('admin_set_subscription', {
      p_business: business.id, p_plan: plan, p_status: status,
      p_trial_ends_at: status === 'trial' ? endOfDay(trialEnd) : null,
      p_period_end: status === 'trial' ? null : endOfDay(periodEnd), p_notes: notes,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onDone();
  };

  return (
    <form className="admin-edit stack" onSubmit={submit}>
      {error && <ErrorBox message={error} />}
      <div className="grid-2">
        <Field label={t('admin.plan')}>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        </Field>
        <Field label={t('admin.status')}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{t(`plan.status.${s}` as MessageKey)}</option>)}</select>
        </Field>
        {status === 'trial'
          ? <Field label={t('admin.trialEnd')}><input type="date" value={trialEnd} onChange={(e) => setTrialEnd(e.target.value)} required /></Field>
          : <Field label={t('admin.periodEnd')} optional><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>}
      </div>
      <Field label={t('admin.notes')} hint={t('admin.notesHint')} optional><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
      <div className="form-actions"><Button type="submit" busy={busy}>{t('admin.save')}</Button></div>
    </form>
  );
}

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const pricesToText = (p: Record<string, number>) => Object.entries(p).map(([c, v]) => `${c} ${v / 10 ** digits(c)}`).join('\n');

function PlanForm({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [f, setF] = useState({ name: plan.name, staff: plan.max_staff?.toString() ?? '', jobs: plan.max_jobs_month?.toString() ?? '',
    customers: plan.max_customers?.toString() ?? '', prices: pricesToText(plan.prices) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const limits = [f.staff, f.jobs, f.customers].map(numOrNull);
    if (limits.some((n) => n !== null && !(Number.isInteger(n) && n > 0))) return setError(t('admin.blankUnlimited'));
    const prices: Record<string, number> = {};
    for (const line of f.prices.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^([A-Za-z]{3})\s+([0-9]+(?:\.[0-9]{1,2})?)$/.exec(line);
      if (!m) return setError(`${t('admin.prices')}: ${line}`);
      const code = m[1].toUpperCase();
      prices[code] = Math.round(Number(m[2]) * 10 ** digits(code));
    }
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('admin_update_plan', { p_code: plan.code,
      p: { name: f.name.trim(), max_staff: limits[0], max_jobs_month: limits[1], max_customers: limits[2], prices } });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  };

  return (
    <form className="admin-plan stack" onSubmit={submit}>
      <div className="admin-plan-head"><strong>{plan.name}</strong>{!plan.public && <span className="fine">{plan.code}, not offered</span>}</div>
      {error && <ErrorBox message={error} />}
      <div className="grid-3">
        <Field label={t('plan.staff')}><input inputMode="numeric" value={f.staff} onChange={set('staff')} placeholder={t('plan.unlimited')} /></Field>
        <Field label={t('plan.jobs')}><input inputMode="numeric" value={f.jobs} onChange={set('jobs')} placeholder={t('plan.unlimited')} /></Field>
        <Field label={t('plan.customers')}><input inputMode="numeric" value={f.customers} onChange={set('customers')} placeholder={t('plan.unlimited')} /></Field>
      </div>
      {plan.public && <Field label={t('admin.prices')} hint={t('admin.pricesHint')} optional><textarea rows={2} value={f.prices} onChange={set('prices')} /></Field>}
      <div className="form-actions"><Button type="submit" variant="secondary" className="btn-sm" busy={busy}>{t('admin.savePlan')}</Button></div>
    </form>
  );
}

function ContactForm({ initial, onSaved }: { initial: Overview['settings']; onSaved: () => void }) {
  const [f, setF] = useState({ support_email: initial.support_email ?? '', support_whatsapp: initial.support_whatsapp ?? '', upgrade_note: initial.upgrade_note ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const wa = f.support_whatsapp.replace(/[\s()-]/g, '');
    if (wa && !/^\+[1-9][0-9]{6,14}$/.test(wa)) return setError(`${t('admin.supportWhatsapp')}: +2348012345678`);
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('admin_update_settings', { p: { ...f, support_whatsapp: wa } });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  };
  return (
    <form className="panel admin-contact stack" onSubmit={submit}>
      <h2 className="panel-title">{t('admin.contact')}</h2>
      <div className="stack pad-x">
        {error && <ErrorBox message={error} />}
        <Field label={t('admin.supportEmail')} optional><input type="email" value={f.support_email} onChange={set('support_email')} /></Field>
        <Field label={t('admin.supportWhatsapp')} optional><input type="tel" value={f.support_whatsapp} onChange={set('support_whatsapp')} placeholder="+2348012345678" /></Field>
        <Field label={t('admin.upgradeNote')} hint={t('plan.upgradeHow')} optional><textarea rows={3} value={f.upgrade_note} onChange={set('upgrade_note')} maxLength={500} /></Field>
        <div className="form-actions"><Button type="submit" busy={busy}>{t('common.save')}</Button></div>
      </div>
    </form>
  );
}
