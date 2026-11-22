import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errorMessage } from '../../lib/supabase';
import { t } from '../../lib/i18n';
import { Button, ErrorBox, Field, Notice } from '../../components/ui';
import { AuthFrame, strongPassword } from './AuthFrame';

export function ResetPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/update-password` });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setDone(true);
  };

  return (
    <AuthFrame title={t('auth.resetTitle')} footer={<Link to="/login">{t('auth.signIn')}</Link>}>
      {done ? <Notice tone="success">{t('auth.resetSent', { email })}</Notice> : (
        <form onSubmit={submit} className="stack">
          {error && <ErrorBox message={error} />}
          <Field label={t('auth.email')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <Button type="submit" busy={busy} block>{t('auth.resetSend')}</Button>
        </form>
      )}
    </AuthFrame>
  );
}

export function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!strongPassword(password)) return setError(t('auth.weakPassword'));
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    navigate('/', { replace: true });
  };

  return (
    <AuthFrame title={t('auth.setPassword')}>
      <form onSubmit={submit} className="stack">
        {error && <ErrorBox message={error} />}
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Button type="submit" busy={busy} block>{t('auth.setPassword')}</Button>
      </form>
    </AuthFrame>
  );
}
