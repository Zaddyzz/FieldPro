import { useState, type FormEvent } from 'react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { must, useAsync } from '../lib/data';
import { COUNTRIES, countryByCode, CURRENCIES, toE164 } from '../lib/countries';
import { t } from '../lib/i18n';
import { useTheme, type ThemeChoice } from '../lib/theme';
import { TimeZoneSelect } from '../components/TimeZoneSelect';
import { PlanCard } from '../components/Plan';
import { Button, ErrorBox, Field, LinkButton, Notice, PageHeader, PhoneInput, useToast } from '../components/ui';

export default function Settings() {
  const { business, settings, isAdmin, profile, role, refresh } = useBusiness();
  const toast = useToast();
  return (
    <div className="page page-narrow">
      <PageHeader title={t('settings.title')} actions={isAdmin ? <LinkButton to="/setup" variant="secondary">{t('setup.open')}</LinkButton> : undefined} />
      {isAdmin && <PlanCard />}
      {isAdmin ? <BusinessSettings key={business.id + (settings?.job_prefix ?? '')} onSaved={async () => { await refresh(); toast.show(t('settings.saved')); }} />
        : <Notice>{t('settings.ownerOnly')}</Notice>}
      <ProfileSettings key={profile?.id} country={business.country} onSaved={async () => { await refresh(); toast.show(t('settings.saved')); }} />
      {isAdmin && <InvoiceSettings />}
      {role === 'technician' && <TechSettings />}
      <Appearance />
      {toast.node}
    </div>
  );
}

function BusinessSettings({ onSaved }: { onSaved: () => void }) {
  const { business, settings } = useBusiness();
  const [f, setF] = useState({
    name: business.name, country: business.country, currency: business.currency, time_zone: business.time_zone,
    date_format: business.date_format, tax_label: business.tax_label, email: business.email ?? '',
    address_line1: business.address_line1 ?? '', city: business.city ?? '', region: business.region ?? '', postal_code: business.postal_code ?? '',
    job_prefix: settings?.job_prefix ?? 'JOB-', whatsapp_enabled: settings?.whatsapp_enabled ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currencies = Array.from(new Set([...CURRENCIES, f.currency])).sort();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[A-Z0-9-]{1,10}$/.test(f.job_prefix)) return setError('Job prefix: up to 10 capital letters, numbers or dashes.');
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('update_business_settings', { p_business: business.id, p: f });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="card-title">{t('settings.business')}</h2>
      {error && <ErrorBox message={error} />}
      <Field label={t('auth.businessName')}><input value={f.name} onChange={set('name')} required minLength={2} /></Field>
      <Field label={t('auth.email')} optional><input type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label={t('cust.address1')} optional><input value={f.address_line1} onChange={set('address_line1')} /></Field>
      <div className="grid-3">
        <Field label={t('cust.city')} optional><input value={f.city} onChange={set('city')} /></Field>
        <Field label={t('cust.region')} optional><input value={f.region} onChange={set('region')} /></Field>
        <Field label={t('cust.postal')} optional><input value={f.postal_code} onChange={set('postal_code')} /></Field>
      </div>

      <h2 className="card-title">{t('settings.regional')}</h2>
      <div className="grid-2">
        <Field label={t('auth.country')}>
          <select value={f.country} onChange={(e) => { const c = countryByCode(e.target.value); setF((x) => ({ ...x, country: e.target.value, ...(c ? { time_zone: c.timeZone } : {}) })); }}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
        </Field>
        <Field label={t('settings.currency')}>
          <select value={f.currency} onChange={set('currency')}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label={t('settings.timeZone')}>
          <TimeZoneSelect key={f.country} country={f.country} value={f.time_zone} onChange={(z) => setF((x) => ({ ...x, time_zone: z }))} />
        </Field>
        <Field label={t('settings.dateFormat')}>
          <select value={f.date_format} onChange={set('date_format')}>
            <option value="dd/MM/yyyy">31/12/2026</option><option value="MM/dd/yyyy">12/31/2026</option><option value="yyyy-MM-dd">2026-12-31</option>
          </select>
        </Field>
        <Field label={t('settings.taxLabel')}><input value={f.tax_label} onChange={set('tax_label')} maxLength={30} /></Field>
      </div>

      <h2 className="card-title">{t('settings.jobs')}</h2>
      <Field label={t('settings.jobPrefix')} hint={`${f.job_prefix}0001`}><input value={f.job_prefix} onChange={(e) => setF((x) => ({ ...x, job_prefix: e.target.value.toUpperCase() }))} maxLength={10} /></Field>
      <label className="check">
        <input type="checkbox" checked={f.whatsapp_enabled} onChange={(e) => setF((x) => ({ ...x, whatsapp_enabled: e.target.checked }))} />
        <span>{t('settings.whatsapp')}<small className="field-hint block">{t('settings.whatsappHint')}</small></span>
      </label>
      <div className="form-actions"><Button type="submit" busy={busy}>{busy ? t('common.saving') : t('common.save')}</Button></div>
    </form>
  );
}

function ProfileSettings({ country, onSaved }: { country: string; onSaved: () => void }) {
  const { profile, session } = useBusiness();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [dial, setDial] = useState(countryByCode(country)?.dial ?? '1');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = phone ? toE164(phone, dial) : null;
    if (phone && !p) return setError(t('auth.badPhone'));
    setBusy(true); setError(null);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), phone: p }).eq('id', session!.user.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="card-title">{t('settings.profile')}</h2>
      {error && <ErrorBox message={error} />}
      <Field label={t('auth.ownerName')}><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <Field label={t('auth.phone')} optional><PhoneInput dial={dial} onDial={setDial} value={phone} onChange={setPhone} /></Field>
      <div className="form-actions"><Button type="submit" busy={busy}>{t('common.save')}</Button></div>
    </form>
  );
}

function TechSettings() {
  const { business, session } = useBusiness();
  const toast = useToast();
  const { data, loading } = useAsync(async () =>
    must(await supabase.from('technician_profiles').select('service_area, skills').eq('business_id', business.id).eq('user_id', session!.user.id).maybeSingle()) as { service_area: string | null; skills: string[] } | null,
  [business.id]);
  if (loading || !data) return null;
  return <TechForm initial={data} onSave={async (area, skills) => {
    const { error } = await supabase.from('technician_profiles').update({ service_area: area || null, skills }).eq('business_id', business.id).eq('user_id', session!.user.id);
    toast.show(error ? errorMessage(error) : t('settings.saved'));
  }} toastNode={toast.node} />;
}

function TechForm({ initial, onSave, toastNode }: { initial: { service_area: string | null; skills: string[] }; onSave: (a: string, s: string[]) => Promise<void>; toastNode: React.ReactNode }) {
  const [area, setArea] = useState(initial.service_area ?? '');
  const [skills, setSkills] = useState<string[]>(initial.skills);
  const all = ['CCTV', 'Solar', 'Networking', 'Electrical', 'Access control'];
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); onSave(area.trim(), skills); }}>
      <Field label={t('team.serviceArea')} optional><input value={area} onChange={(e) => setArea(e.target.value)} /></Field>
      <Field label={t('team.skills')} optional>
        <div className="chips">{all.map((s) => (
          <label key={s} className={`chip ${skills.includes(s) ? 'on' : ''}`}>
            <input type="checkbox" checked={skills.includes(s)} onChange={(e) => setSkills((x) => e.target.checked ? [...x, s] : x.filter((y) => y !== s))} />{s}
          </label>))}
        </div>
      </Field>
      <div className="form-actions"><Button type="submit">{t('common.save')}</Button></div>
      {toastNode}
    </form>
  );
}

function Appearance() {
  const { choice, setChoice } = useTheme();
  const opts: ThemeChoice[] = ['light', 'dark', 'system'];
  return (
    <section className="card stack">
      <h2 className="card-title">{t('theme.title')}</h2>
      <div className="segmented" role="radiogroup" aria-label={t('theme.title')}>
        {opts.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={choice === o} className={choice === o ? 'on' : ''} onClick={() => setChoice(o)}>
            {t(`theme.${o}` as const)}
          </button>
        ))}
      </div>
      <p className="fine">{t('theme.hint')}</p>
    </section>
  );
}

function InvoiceSettings() {
  const { business } = useBusiness();
  const toast = useToast();
  const { data, loading } = useAsync(async () =>
    must(await supabase.from('business_settings').select('quote_prefix, invoice_prefix, default_tax_rate, invoice_terms_days, payment_instructions, tax_number, payment_methods').eq('business_id', business.id).single()) as
      { quote_prefix: string; invoice_prefix: string; default_tax_rate: number; invoice_terms_days: number; payment_instructions: string | null; tax_number: string | null; payment_methods: string[] },
  [business.id]);
  if (loading || !data) return null;
  return <InvoiceForm key={business.id} initial={data} onSave={async (p) => {
    const { error } = await supabase.rpc('update_business_settings', { p_business: business.id, p });
    toast.show(error ? errorMessage(error) : t('settings.saved'));
  }} toastNode={toast.node} />;
}

function InvoiceForm({ initial, onSave, toastNode }: { initial: { quote_prefix: string; invoice_prefix: string; default_tax_rate: number; invoice_terms_days: number; payment_instructions: string | null; tax_number: string | null; payment_methods: string[] }; onSave: (p: Record<string, unknown>) => Promise<void>; toastNode: React.ReactNode }) {
  const [f, setF] = useState({ quote_prefix: initial.quote_prefix, invoice_prefix: initial.invoice_prefix, default_tax_rate: String(initial.default_tax_rate),
    invoice_terms_days: String(initial.invoice_terms_days), payment_instructions: initial.payment_instructions ?? '', tax_number: initial.tax_number ?? '',
    methods: initial.payment_methods.join(', ') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const rate = Number(f.default_tax_rate); const days = Number(f.invoice_terms_days);
    if (!/^[A-Z0-9-]{1,10}$/.test(f.quote_prefix) || !/^[A-Z0-9-]{1,10}$/.test(f.invoice_prefix)) return setError('Prefixes: up to 10 capital letters, numbers or dashes.');
    if (!(rate >= 0 && rate <= 100) || !(Number.isInteger(days) && days >= 0 && days <= 365)) return setError(t('set.taxRate'));
    const methods = f.methods.split(',').map((m) => m.trim()).filter(Boolean).slice(0, 12);
    setBusy(true); setError(null);
    await onSave({ quote_prefix: f.quote_prefix, invoice_prefix: f.invoice_prefix, default_tax_rate: rate, invoice_terms_days: days,
      payment_instructions: f.payment_instructions.trim(), tax_number: f.tax_number.trim(), payment_methods: methods.length ? methods : ['Cash'] });
    setBusy(false);
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="card-title">{t('set.invoicing')}</h2>
      {error && <ErrorBox message={error} />}
      <div className="grid-2">
        <Field label={t('set.quotePrefix')} hint={`${f.quote_prefix}0001`}><input value={f.quote_prefix} onChange={(e) => setF((x) => ({ ...x, quote_prefix: e.target.value.toUpperCase() }))} maxLength={10} /></Field>
        <Field label={t('set.invoicePrefix')} hint={`${f.invoice_prefix}0001`}><input value={f.invoice_prefix} onChange={(e) => setF((x) => ({ ...x, invoice_prefix: e.target.value.toUpperCase() }))} maxLength={10} /></Field>
        <Field label={t('set.taxRate')}><input inputMode="decimal" value={f.default_tax_rate} onChange={set('default_tax_rate')} /></Field>
        <Field label={t('set.terms')}><input inputMode="numeric" value={f.invoice_terms_days} onChange={set('invoice_terms_days')} /></Field>
      </div>
      <Field label={t('set.taxNumber')} optional><input value={f.tax_number} onChange={set('tax_number')} maxLength={60} /></Field>
      <Field label={t('set.payInstructions')} hint={t('set.payInstructionsHint')} optional><textarea rows={3} value={f.payment_instructions} onChange={set('payment_instructions')} maxLength={1000} /></Field>
      <Field label={t('set.methods')} hint={t('set.methodsHint')}><input value={f.methods} onChange={set('methods')} /></Field>
      <div className="form-actions"><Button type="submit" busy={busy}>{t('common.save')}</Button></div>
      {toastNode}
    </form>
  );
}
