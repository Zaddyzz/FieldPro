import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errorMessage } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { t, type MessageKey } from '../../lib/i18n';
import { Button, ErrorBox, Notice, Spinner } from '../../components/ui';
import { AuthFrame } from './AuthFrame';

interface Preview { business_name: string; role: string; email: string; expired: boolean; used: boolean }

export default function AcceptInvite() {
  const { token = '' } = useParams();
  const { session, refresh, switchBusiness } = useSession();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) { setPreview(null); return; }
    supabase.rpc('invitation_preview', { p_token: token }).then(({ data }) => {
      setPreview(((data as Preview[] | null) ?? [])[0] ?? null);
    });
  }, [token]);

  const accept = async () => {
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
    if (error) { setBusy(false); return setError(errorMessage(error)); }
    switchBusiness(data as string);
    await refresh();
    setBusy(false);
    navigate('/', { replace: true });
  };

  if (preview === undefined) return <Spinner />;
  if (preview === null) return <AuthFrame title={t('invite.title')}><ErrorBox message={t('invite.invalid')} /></AuthFrame>;

  const roleLabel = t(`role.${preview.role}` as MessageKey);
  return (
    <AuthFrame title={t('invite.title')}>
      <p>{t('invite.body', { business: preview.business_name, email: preview.email, role: roleLabel })}</p>
      {preview.expired ? <ErrorBox message={t('invite.expired')} />
        : preview.used ? <Notice>{t('invite.used')} <Link to="/">{t('nav.overview')}</Link></Notice>
        : session ? (
          <div className="stack">
            {error && <ErrorBox message={error} />}
            <Button onClick={accept} busy={busy} block>{t('invite.accept')}</Button>
          </div>
        ) : (
          <div className="stack">
            <Notice>{t('invite.signInFirst', { email: preview.email })}</Notice>
            <Link className="btn btn-primary btn-block" to={`/signup?invite=${token}&email=${encodeURIComponent(preview.email)}`}>{t('invite.signUp')}</Link>
            <Link className="btn btn-secondary btn-block" to={`/login?next=/invite/${token}`}>{t('auth.signIn')}</Link>
          </div>
        )}
    </AuthFrame>
  );
}
