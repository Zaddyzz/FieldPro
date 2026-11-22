import { Link } from 'react-router-dom';
import { useBusiness } from '../lib/session';
import { supabase } from '../lib/supabase';
import { loadMembers, memberName, must, useAsync } from '../lib/data';
import { dayKey, formatDate, formatTime, relativeFromNow, zonedLocalToUtc } from '../lib/format';
import { t, type MessageKey } from '../lib/i18n';
import type { Activity, Job } from '../lib/types';
import { isOverdue } from '../lib/types';
import { ErrorBox, PageHeader, PriorityTag, RefTag, Spinner, StatusBadge } from '../components/ui';

const OPEN = ['new', 'scheduled', 'assigned', 'in_progress', 'awaiting_parts'] as const;

export default function Dashboard() {
  const { business, subscription } = useBusiness();
  const tz = business.time_zone;

  const { data, error, loading, reload } = useAsync(async () => {
    const today = dayKey(new Date(), tz);
    const startToday = zonedLocalToUtc(`${today}T00:00`, tz);
    const endToday = new Date(new Date(startToday).getTime() + 86400000).toISOString();
    const monthStart = zonedLocalToUtc(`${today.slice(0, 8)}01T00:00`, tz);
    const b = business.id;
    const count = (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) =>
      Promise.resolve(q).then((r) => { if (r.error) throw new Error(r.error.message); return r.count ?? 0; });

    const [customers, techs, openRows, completed, overdue, todayJobs, activity, members] = await Promise.all([
      count(supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', b).eq('status', 'active')),
      count(supabase.from('business_members').select('id', { count: 'exact', head: true }).eq('business_id', b).eq('role', 'technician').eq('status', 'active')),
      supabase.from('jobs').select('status').eq('business_id', b).eq('archived', false).in('status', [...OPEN]).limit(5000).then(must),
      count(supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('business_id', b).eq('status', 'completed').gte('completed_at', monthStart)),
      count(supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('business_id', b).eq('archived', false).in('status', [...OPEN]).lt('scheduled_at', new Date().toISOString())),
      supabase.from('jobs').select('*, customer:customers(id, name, phone, address_line1, city), job_assignments(user_id)')
        .eq('business_id', b).eq('archived', false).gte('scheduled_at', startToday).lt('scheduled_at', endToday).order('scheduled_at').then(must),
      supabase.from('job_activities').select('id, kind, from_value, to_value, note, created_at, actor_id, job:jobs(id, reference, title)')
        .eq('business_id', b).order('created_at', { ascending: false }).limit(12).then(must),
      loadMembers(b),
    ]);
    const lanes = Object.fromEntries(OPEN.map((st) => [st, 0])) as Record<(typeof OPEN)[number], number>;
    for (const r of openRows as { status: (typeof OPEN)[number] }[]) lanes[r.status]++;
    const open = (openRows as unknown[]).length;
    return { customers, techs, open, lanes, completed, overdue, todayJobs: todayJobs as Job[],
             activity: activity as unknown as (Activity & { job: { id: string; reference: string; title: string } | null })[], members };
  }, [business.id, tz]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const byUser = new Map(data.members.map((m) => [m.user_id, m]));
  const fresh = data.customers === 0 && data.open === 0 && data.completed === 0;
  const trial = subscription?.status === 'trial' && subscription.trial_ends_at;

  return (
    <div className="page">
      <PageHeader title={t('dash.title')}
        sub={trial ? t('dash.trialEnds', { date: formatDate(subscription!.trial_ends_at, tz, business.date_format) }) : undefined} />

      {fresh && (
        <section className="onboard">
          <h2>{t('dash.firstSteps')}</h2>
          <ol>
            <li><Link to="/customers/new">{t('dash.step1')}</Link></li>
            <li><Link to="/team">{t('dash.step2')}</Link></li>
            <li><Link to="/jobs/new">{t('dash.step3')}</Link></li>
          </ol>
        </section>
      )}

      <section className="board" aria-label={t('dash.openJobs')}>
        <div className="board-head">
          <span className="board-total"><strong>{data.open.toLocaleString()}</strong>{t('dash.openJobs').toLowerCase()}</span>
          <Link to="/schedule" className="small-link">{t('nav.schedule')}</Link>
        </div>
        <div className="lane-bar" aria-hidden>
          {data.open > 0 && OPEN.filter((st) => data.lanes[st] > 0).map((st) => (
            <span key={st} className={`fill-${st}`} style={{ flexGrow: data.lanes[st] }} />
          ))}
        </div>
        <div className="lanes">
          {OPEN.map((st) => (
            <Link key={st} to={`/jobs?status=${st}`} className="lane">
              <span className="lane-count">{data.lanes[st]}</span>
              <span className="lane-name"><i className={`fill-${st}`} />{t(`status.${st}` as MessageKey)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="figures">
        <Metric label={t('dash.overdue')} value={data.overdue} to="/jobs?status=overdue" tone={data.overdue ? 'warn' : undefined} />
        <Metric label={t('dash.completedMonth')} value={data.completed} />
        <Metric label={t('dash.customers')} value={data.customers} to="/customers" />
        <Metric label={t('dash.technicians')} value={data.techs} to="/team" />
      </section>

      <div className="two-col">
        <section className="panel">
          <h2 className="panel-title">{t('dash.today')}</h2>
          {data.todayJobs.length === 0 ? <p className="muted pad">{t('dash.noToday')}</p> : (
            <ul className="rows">
              {data.todayJobs.map((j) => (
                <li key={j.id}>
                  <Link to={`/jobs/${j.id}`} className="row-link">
                    <span className="row-time">{formatTime(j.scheduled_at, tz, business.date_format)}</span>
                    <span className="row-main"><strong>{j.title}</strong><span className="meta"><RefTag value={j.reference} /><span>{j.customer?.name}</span>
                      {j.job_assignments?.length ? <span>{j.job_assignments.map((a) => memberName(byUser.get(a.user_id))).join(', ')}</span> : null}</span></span>
                    <PriorityTag priority={j.priority} />
                    <StatusBadge status={j.status} overdue={isOverdue(j)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">{t('dash.activity')}</h2>
          {data.activity.length === 0 ? <p className="muted pad">{t('dash.noActivity')}</p> : (
            <ul className="feed">
              {data.activity.map((a) => (
                <li key={a.id}>
                  <span className="feed-who">{memberName(byUser.get(a.actor_id ?? '')) || t('act.someone')}</span>{' '}
                  {t(`act.${a.kind}` as MessageKey)}
                  {a.kind === 'status' && a.to_value ? <> → <em>{t(`status.${a.to_value}` as MessageKey)}</em></> : null}
                  {a.job && <> on <Link to={`/jobs/${a.job.id}`}>{a.job.reference}</Link></>}
                  <time>{relativeFromNow(a.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, to, tone }: { label: string; value: number; to?: string; tone?: 'warn' }) {
  const inner = <><span className="metric-value">{value.toLocaleString()}</span><span className="metric-label">{label}</span></>;
  return to ? <Link to={to} className={`metric ${tone ? `metric-${tone}` : ''}`}>{inner}</Link>
    : <div className={`metric ${tone ? `metric-${tone}` : ''}`}>{inner}</div>;
}
