import { useState, type FormEvent } from 'react';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { loadMembers, memberName, must, useAsync } from '../lib/data';
import { formatDate } from '../lib/format';
import { t, type MessageKey } from '../lib/i18n';
import type { Member, Role } from '../lib/types';
import { Avatar, Button, ErrorBox, Field, PageHeader, Spinner, useToast } from '../components/ui';

interface Invite { id: string; email: string; role: Role; token: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }
interface TechProfile { user_id: string; service_area: string | null; skills: string[] }

export default function Team() {
  const { business, role: myRole, session, settings } = useBusiness();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [members, invites, techs] = await Promise.all([
      loadMembers(business.id),
      supabase.from('invitations').select('*').eq('business_id', business.id).is('accepted_at', null).is('revoked_at', null).order('created_at', { ascending: false }).then(must),
      supabase.from('technician_profiles').select('user_id, service_area, skills').eq('business_id', business.id).then(must),
    ]);
    return { members, invites: invites as Invite[], techs: new Map((techs as TechProfile[]).map((x) => [x.user_id, x])) };
  }, [business.id]);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('technician');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setFormError(null);
    const { error } = await supabase.from('invitations').insert({ business_id: business.id, email: email.trim().toLowerCase(), role, invited_by: session!.user.id });
    setBusy(false);
    if (error) return setFormError(errorMessage(error));
    setEmail(''); reload();
  };

  const link = (i: Invite) => `${window.location.origin}/invite/${i.token}`;
  const message = (i: Invite) => t('team.inviteMessage', { business: business.name, role: t(`role.${i.role}` as MessageKey), email: i.email, link: link(i) });

  const act = async (fn: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await fn;
    if (error) toast.show(errorMessage(error)); else reload();
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const roles: Role[] = myRole === 'owner' ? ['technician', 'dispatcher', 'admin'] : ['technician', 'dispatcher'];
  const canManage = (m: Member) => m.user_id !== session?.user.id && m.role !== 'owner' && (myRole === 'owner' || m.role !== 'admin');

  return (
    <div className="page">
      <PageHeader title={t('team.title')} />
      <div className="two-col">
        <section className="panel">
          <h2 className="panel-title">{t('team.members')}</h2>
          <ul className="people">
            {data.members.filter((m) => m.role !== 'customer').map((m) => {
              const tp = data.techs.get(m.user_id);
              return (
                <li key={m.id} className={m.status !== 'active' ? 'is-off' : ''}>
                  <Avatar name={memberName(m)} />
                  <div className="person">
                    <strong>{memberName(m)}{m.user_id === session?.user.id && <small className="you">{t('team.you')}</small>}</strong>
                    <small>{m.profile?.email}{m.profile?.phone ? ` · ${m.profile.phone}` : ''}</small>
                    {m.role === 'technician' && tp && (tp.service_area || tp.skills.length > 0) && <small>{[tp.service_area, tp.skills.join(', ')].filter(Boolean).join(' · ')}</small>}
                  </div>
                  <div className="person-actions">
                    {canManage(m) && m.status === 'active' ? (
                      <select value={m.role} onChange={(e) => act(supabase.rpc('set_member_role', { p_member: m.id, p_role: e.target.value }))} aria-label={t('team.role')}>
                        {roles.map((r) => <option key={r} value={r}>{t(`role.${r}` as MessageKey)}</option>)}
                      </select>
                    ) : <span className="role-tag">{t(`role.${m.role}` as MessageKey)}</span>}
                    {canManage(m) && (m.status === 'active'
                      ? <button className="link danger" onClick={() => window.confirm(t('team.deactivateConfirm')) && act(supabase.rpc('set_member_status', { p_member: m.id, p_status: 'deactivated' }))}>{t('team.deactivate')}</button>
                      : <button className="link" onClick={() => act(supabase.rpc('set_member_status', { p_member: m.id, p_status: 'active' }))}>{t('team.reactivate')}</button>)}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="stack">
          <section className="panel">
            <h2 className="panel-title">{t('team.invite')}</h2>
            <form className="pad stack" onSubmit={invite}>
              <p className="muted">{t('team.inviteSub')}</p>
              {formError && <ErrorBox message={formError} />}
              <Field label={t('auth.email')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label={t('team.role')}>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{roles.map((r) => <option key={r} value={r}>{t(`role.${r}` as MessageKey)}</option>)}</select>
              </Field>
              <Button type="submit" busy={busy}>{t('team.sendInvite')}</Button>
            </form>
          </section>

          <section className="panel">
            <h2 className="panel-title">{t('team.pending')}</h2>
            {data.invites.length === 0 ? <p className="muted pad">{t('team.noInvites')}</p> : (
              <ul className="invites">
                {data.invites.map((i) => (
                  <li key={i.id}>
                    <div><strong>{i.email}</strong><small>{t(`role.${i.role}` as MessageKey)} · {t('team.expires', { date: formatDate(i.expires_at, business.time_zone, business.date_format) })}</small></div>
                    <div className="invite-actions">
                      <button className="icon-btn" title={t('common.copy')} aria-label={t('common.copy')}
                        onClick={async () => { try { await navigator.clipboard.writeText(link(i)); toast.show(t('common.copied')); } catch { window.prompt(t('common.copy'), link(i)); } }}><Copy size={16} /></button>
                      <a className="icon-btn" title={t('team.shareEmail')} aria-label={t('team.shareEmail')}
                        href={`mailto:${i.email}?subject=${encodeURIComponent(t('team.inviteSubject', { business: business.name }))}&body=${encodeURIComponent(message(i))}`}><Mail size={16} /></a>
                      {settings?.whatsapp_enabled && <a className="icon-btn" title={t('team.shareWhatsApp')} aria-label={t('team.shareWhatsApp')}
                        href={`https://wa.me/?text=${encodeURIComponent(message(i))}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /></a>}
                      <button className="link danger" onClick={() => act(supabase.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', i.id))}>{t('team.revoke')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      {toast.node}
    </div>
  );
}
