import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, errorMessage } from '../../lib/supabase';
import { t } from '../../lib/i18n';
import { Button, ErrorBox, Field } from '../../components/ui';
import { AuthFrame } from './AuthFrame';

export default function Login() {
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    navigate(next.startsWith('/') ? next : '/', { replace: true });
  };

  return (
    <AuthFrame title={t('auth.signIn')}
      footer={<>{t('auth.noAccount')} <Link to="/signup">{t('auth.createAccount')}</Link></>}>
      <form onSubmit={submit} className="stack">
        {error && <ErrorBox message={error} />}
        <Field label={t('auth.email')}><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label={t('auth.password')}><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Button type="submit" busy={busy} block>{busy ? t('auth.signingIn') : t('auth.signIn')}</Button>
        <Link to="/reset-password" className="small-link">{t('auth.forgot')}</Link>
      </form>
    </AuthFrame>
  );
}
