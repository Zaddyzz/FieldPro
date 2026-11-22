import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { allTimeZones, COUNTRIES, countryByCode, CURRENCIES, toE164 } from '../lib/countries';
import { t, type MessageKey } from '../lib/i18n';
import type { Role } from '../lib/types';
import { Button, ErrorBox, Field, Notice, PhoneInput } from '../components/ui';

const STEPS = ['setup.s1', 'setup.s2', 'setup.s3', 'setup.s4'] as const;

export default function Setup() {
  const { business, settings, session, refresh } = useBusiness();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({
    name: business.name, email: business.email ?? '', address_line1: business.address_line1 ?? '',
    city: business.city ?? '', region: business.region ?? '', postal_code: business.postal_code ?? '',
    country: business.country, currency: business.currency, time_zone: business.time_zone,
    date_format: business.date_format, tax_label: business.tax_label,
    job_prefix: settings?.job_prefix ?? 'JOB-', whatsapp_enabled: settings?.whatsapp_enabled ?? false,
  });
  const [dial, setDial] = useState(countryByCode(business.country)?.dial ?? '1');
  const [phone, setPhone] = useState(business.phone ?? '');
  const [invite, setInvite] = useState({ email: '', role: 'technician' as Role });
  const [invited, setInvited] = useState<string[]>([]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('update_business_settings', { p_business: business.id, p: patch });
    setBusy(false);
    if (error) { setError(errorMessage(error)); return false; }
    return true;
  };

  const finish = async () => {
    if (await save({ setup_completed: true })) { await refresh(); navigate('/', { replace: true }); }
  };

  const submitStep = async (e: FormEvent) => {
    e.preventDefault();
    let patch: Record<string, unknown> = {};
    if (step === 0) {
      if (f.name.trim().length < 2) return setError(t('common.required'));
      const p = phone ? toE164(phone, dial) : null;
      if (phone && !p) return setError(t('auth.badPhone'));
      patch = { name: f.name.trim(), email: f.email.trim(), phone: p ?? '', address_line1: f.address_line1.trim(), city: f.city.trim(), region: f.region.trim(), postal_code: f.postal_code.trim() };
    } else if (step === 1) {
      patch = { country: f.country, currency: f.currency, time_zone: f.time_zone, date_format: f.date_format, tax_label: f.tax_label.trim() || 'Tax' };
    } else if (step === 2) {
      if (!/^[A-Z0-9-]{1,10}$/.test(f.job_prefix)) return setError('Job prefix: up to 10 capital letters, numbers or dashes.');
      patch = { job_prefix: f.job_prefix, whatsapp_enabled: f.whatsapp_enabled };
    }
    if (await save(patch)) setStep((s) => s + 1);
  };

  const addInvite = async (e: FormEvent) => {
    e.preventDefault();
    const email = invite.email.trim().toLowerCase();
    if (!email) return;
    setBusy(true); setError(null);
    const { error } = await supabase.from('invitations').insert({ business_id: business.id, email, role: invite.role, invited_by: session!.user.id });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setInvited((x) => [...x, email]);
    setInvite((x) => ({ ...x, email: '' }));
  };

  const zones = allTimeZones();
  const currencies = Array.from(new Set([...CURRENCIES, f.currency])).sort();

  return (
    <div className="page page-narrow setup">
      <header className="setup-head">
        <div>
          <h1>{t('setup.title')}</h1>
          <p className="muted">{t('setup.sub')}</p>
        </div>
        {!settings?.setup_completed_at && <Button variant="ghost" onClick={finish} disabled={busy}>{t('setup.skipAll')}</Button>}
      </header>

      <ol className="stepper" aria-label={t('setup.step', { n: step + 1, total: STEPS.length })}>
        {STEPS.map((k, i) => (
          <li key={k} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="step-dot">{i < step ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
              <span className="step-name">{t(k as MessageKey)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="card stack setup-card">
        <div>
          <h2 className="setup-title">{t(STEPS[step] as MessageKey)}</h2>
          <p className="muted">{t(`${STEPS[step]}Sub` as MessageKey)}</p>
        </div>
        {error && <ErrorBox message={error} />}

        {step === 0 && (
          <form className="stack" onSubmit={submitStep} noValidate>
            <Field label={t('auth.businessName')}><input value={f.name} onChange={set('name')} required /></Field>
            <div className="grid-2">
              <Field label={t('auth.phone')} optional><PhoneInput dial={dial} onDial={setDial} value={phone} onChange={setPhone} /></Field>
              <Field label={t('auth.email')} optional><input type="email" value={f.email} onChange={set('email')} /></Field>
            </div>
            <Field label={t('cust.address1')} optional><input value={f.address_line1} onChange={set('address_line1')} /></Field>
            <div className="grid-3">
              <Field label={t('cust.city')} optional><input value={f.city} onChange={set('city')} /></Field>
              <Field label={t('cust.region')} optional><input value={f.region} onChange={set('region')} /></Field>
              <Field label={t('cust.postal')} optional><input value={f.postal_code} onChange={set('postal_code')} /></Field>
            </div>
            <StepActions busy={busy} />
          </form>
        )}

        {step === 1 && (
          <form className="stack" onSubmit={submitStep}>
            <div className="grid-2">
              <Field label={t('auth.country')}>
                <select value={f.country} onChange={(e) => {
                  const c = countryByCode(e.target.value);
                  setF((x) => ({ ...x, country: e.target.value, ...(c ? { currency: c.currency, time_zone: c.timeZone, date_format: c.dateFormat, tax_label: c.taxLabel } : {}) }));
                }}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
              </Field>
              <Field label={t('settings.currency')}>
                <select value={f.currency} onChange={set('currency')}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
              <Field label={t('settings.timeZone')}>
                <select value={f.time_zone} onChange={set('time_zone')}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
              </Field>
              <Field label={t('settings.dateFormat')}>
                <select value={f.date_format} onChange={set('date_format')}>
                  <option value="dd/MM/yyyy">31/12/2026</option><option value="MM/dd/yyyy">12/31/2026</option><option value="yyyy-MM-dd">2026-12-31</option>
                </select>
              </Field>
              <Field label={t('settings.taxLabel')} hint="For example VAT, GST or Sales Tax"><input value={f.tax_label} onChange={set('tax_label')} maxLength={30} /></Field>
            </div>
            <StepActions busy={busy} onBack={() => setStep(0)} />
          </form>
        )}

        {step === 2 && (
          <form className="stack" onSubmit={submitStep}>
            <Field label={t('settings.jobPrefix')} hint={t('setup.example', { ref: `${f.job_prefix || 'JOB-'}0001` })}>
              <input value={f.job_prefix} onChange={(e) => setF((x) => ({ ...x, job_prefix: e.target.value.toUpperCase() }))} maxLength={10} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={f.whatsapp_enabled} onChange={(e) => setF((x) => ({ ...x, whatsapp_enabled: e.target.checked }))} />
              <span>{t('settings.whatsapp')}<small className="field-hint block">{t('settings.whatsappHint')}</small></span>
            </label>
            <StepActions busy={busy} onBack={() => setStep(1)} />
          </form>
        )}

        {step === 3 && (
          <div className="stack">
            <form className="invite-row" onSubmit={addInvite}>
              <input type="email" placeholder={t('auth.email')} aria-label={t('auth.email')} value={invite.email} onChange={(e) => setInvite((x) => ({ ...x, email: e.target.value }))} />
              <select value={invite.role} onChange={(e) => setInvite((x) => ({ ...x, role: e.target.value as Role }))} aria-label={t('team.role')}>
                {(['technician', 'dispatcher', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{t(`role.${r}` as MessageKey)}</option>)}
              </select>
              <Button type="submit" variant="secondary" busy={busy} disabled={!invite.email.trim()}>{t('setup.inviteAdd')}</Button>
            </form>
            {invited.length === 0 ? <p className="muted">{t('setup.noInvites')}</p> : (
              <ul className="invited">{invited.map((e) => <li key={e}><Check size={15} />{t('setup.invited', { email: e })}</li>)}</ul>
            )}
            {settings?.setup_completed_at && <Notice tone="success">{t('setup.done')}</Notice>}
            <div className="form-actions setup-actions">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>{t('setup.back')}</Button>
              <Button type="button" busy={busy} onClick={finish}>{t('setup.finish')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepActions({ busy, onBack }: { busy: boolean; onBack?: () => void }) {
  return (
    <div className="form-actions setup-actions">
      {onBack && <Button type="button" variant="ghost" onClick={onBack}>{t('setup.back')}</Button>}
      <Button type="submit" busy={busy}>{t('setup.next')}</Button>
    </div>
  );
}
