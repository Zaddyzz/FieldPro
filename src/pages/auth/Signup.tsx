import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase, errorMessage } from '../../lib/supabase';
import { t, type MessageKey } from '../../lib/i18n';
import { COUNTRIES, countryByCode, toE164 } from '../../lib/countries';
import { Button, ErrorBox, Field, Notice, PhoneInput } from '../../components/ui';
import { AuthFrame, strongPassword } from './AuthFrame';

function guessCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return COUNTRIES.find((c) => c.timeZone === tz)?.code ?? 'US';
  } catch { return 'US'; }
}

export default function Signup() {
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');
  const inviteEmail = params.get('email') ?? '';
  const personal = Boolean(inviteToken);

  const initial = useMemo(guessCountry, []);
  const [country, setCountry] = useState(initial);
  const [dial, setDial] = useState(countryByCode(initial)?.dial ?? '1');
  const [form, setForm] = useState({ business: '', name: '', email: inviteEmail, phone: '', password: '', industry: 'solar' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const phone = toE164(form.phone, dial);
    if (!personal && form.business.trim().length < 2) errs.business = t('common.required');
    if (form.name.trim().length < 2) errs.name = t('common.required');
    if (!phone) errs.phone = t('auth.badPhone');
    if (!strongPassword(form.password)) errs.password = t('auth.weakPassword');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const c = countryByCode(country)!;
    setBusy(true); setError(null);
    const redirect = `${window.location.origin}${inviteToken ? `/invite/${inviteToken}` : '/'}`;
    const data = personal
      ? { full_name: form.name.trim(), phone }
      : {
          signup_type: 'business', full_name: form.name.trim(), phone, business_name: form.business.trim(),
          industry: form.industry, country: c.code, currency: c.currency, time_zone: c.timeZone,
          date_format: c.dateFormat, tax_label: c.taxLabel,
        };
    const { data: res, error } = await supabase.auth.signUp({
      email: form.email.trim(), password: form.password, options: { data, emailRedirectTo: redirect },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    if (!res.session) setSent(true);
  };

  if (sent) {
    return (
      <AuthFrame title={t('auth.checkEmail')} footer={<Link to="/login">{t('auth.signIn')}</Link>}>
        <Notice tone="success">{t('auth.checkEmailBody', { email: form.email })}</Notice>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={personal ? t('invite.title') : t('auth.signUpTitle')} sub={personal ? undefined : t('auth.signUpSub')}
      footer={<>{t('auth.haveAccount')} <Link to={inviteToken ? `/login?next=/invite/${inviteToken}` : '/login'}>{t('auth.signIn')}</Link></>}>
      <form onSubmit={submit} className="stack" noValidate>
        {error && <ErrorBox message={error} />}
        {!personal && (
          <Field label={t('auth.businessName')} error={errors.business}>
            <input value={form.business} onChange={(e) => set('business')(e.target.value)} autoComplete="organization" required />
          </Field>
        )}
        <Field label={t('auth.ownerName')} error={errors.name}>
          <input value={form.name} onChange={(e) => set('name')(e.target.value)} autoComplete="name" required />
        </Field>
        <Field label={t('auth.email')}>
          <input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" required readOnly={personal && !!inviteEmail} />
        </Field>
        {!personal && (
          <div className="grid-2">
            <Field label={t('auth.country')}>
              <select value={country} onChange={(e) => { setCountry(e.target.value); setDial(countryByCode(e.target.value)?.dial ?? dial); }}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={t('auth.industry')}>
              <select value={form.industry} onChange={(e) => set('industry')(e.target.value)}>
                {(['cctv', 'solar', 'internet', 'other'] as const).map((i) => <option key={i} value={i}>{t(`industry.${i}` as MessageKey)}</option>)}
              </select>
            </Field>
          </div>
        )}
        <Field label={t('auth.phone')} error={errors.phone}>
          <PhoneInput dial={dial} onDial={setDial} value={form.phone} onChange={set('phone')} required />
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={errors.password}>
          <input type="password" value={form.password} onChange={(e) => set('password')(e.target.value)} autoComplete="new-password" required />
        </Field>
        {!personal && (
          <p className="fine">Prices in {countryByCode(country)?.currency}, times in {countryByCode(country)?.timeZone}. You can change both in Settings.</p>
        )}
        <Button type="submit" busy={busy} block>{busy ? t('auth.creating') : t('auth.create')}</Button>
      </form>
    </AuthFrame>
  );
}
