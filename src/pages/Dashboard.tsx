import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase } from '../lib/supabase';
import { loadMembers, memberName, must, useAsync } from '../lib/data';
import { dayKey, formatDate, relativeFromNow, utcToZonedLocal, zonedLocalToUtc } from '../lib/format';
import { t, type MessageKey } from '../lib/i18n';
import type { Activity, Job, JobStatus, Member } from '../lib/types';
import { money } from '../lib/money';
import { todayIn } from '../lib/types';
import { isOverdue } from '../lib/types';
import { ErrorBox, PageHeader, Spinner } from '../components/ui';

const OPEN = ['new', 'scheduled', 'assigned', 'in_progress', 'awaiting_parts'] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type OpenRow = { id: string; status: (typeof OPEN)[number]; job_assignments: { user_id: string }[] };
type LiveJob = { id: string; reference: string; title: string; customer: { name: string } | null; job_assignments: { user_id: string }[] };

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

    const todayD = todayIn(tz); const monthD = todayD.slice(0, 8) + '01';
    const dayMs = 86400000;
    const weekStartD = new Date(new Date(todayD + 'T00:00:00Z').getTime() - 6 * dayMs).toISOString().slice(0, 10);
    const in14 = new Date(new Date(todayD + 'T00:00:00Z').getTime() + 14 * dayMs).toISOString().slice(0, 10);
    const [techs, openRows, overdue, todayJobs, activity, members, pays, weekPays, unpaid, maintDue, doneMonth, live] = await Promise.all([
      count(supabase.from('business_members').select('id', { count: 'exact', head: true }).eq('business_id', b).eq('role', 'technician').eq('status', 'active')),
      supabase.from('jobs').select('id, status, job_assignments(user_id)').eq('business_id', b).eq('archived', false).in('status', [...OPEN]).limit(5000).then(must),
      count(supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('business_id', b).eq('archived', false).in('status', [...OPEN]).lt('scheduled_at', new Date().toISOString())),
      supabase.from('jobs').select('*, customer:customers(id, name, phone, address_line1, city), job_assignments(user_id)')
        .eq('business_id', b).eq('archived', false).gte('scheduled_at', startToday).lt('scheduled_at', endToday).order('scheduled_at').then(must),
      supabase.from('job_activities').select('id, kind, from_value, to_value, note, created_at, actor_id, job:jobs(id, reference, title)')
        .eq('business_id', b).order('created_at', { ascending: false }).limit(6).then(must),
      loadMembers(b),
      supabase.from('payments').select('amount_minor').eq('business_id', b).gte('paid_on', monthD).then(must),
      supabase.from('payments').select('amount_minor, paid_on').eq('business_id', b).gte('paid_on', weekStartD).gt('amount_minor', 0).then(must),
      supabase.from('invoices').select('balance_minor, due_date').eq('business_id', b).in('status', ['sent', 'partially_paid']).then(must),
      count(supabase.from('maintenance_contracts').select('id', { count: 'exact', head: true }).eq('business_id', b).eq('status', 'active').lte('next_service_on', in14)),
      supabase.from('jobs').select('id').eq('business_id', b).eq('status', 'completed').gte('completed_at', monthStart).limit(2000).then(must),
      supabase.from('jobs').select('id, reference, title, customer:customers(name), job_assignments(user_id)')
        .eq('business_id', b).eq('archived', false).eq('status', 'in_progress').limit(20).then(must),
    ]);

    // Jobs finished this month that have no invoice yet.
    const doneIds = (doneMonth as { id: string }[]).map((j) => j.id);
    let notInvoiced = 0;
    if (doneIds.length) {
      const billed = must(await supabase.from('invoices').select('job_id').eq('business_id', b).in('job_id', doneIds).neq('status', 'cancelled')) as { job_id: string }[];
      const billedSet = new Set(billed.map((r) => r.job_id));
      notInvoiced = doneIds.filter((id) => !billedSet.has(id)).length;
    }

    // The job that has been running longest, with the time it went in progress.
    const liveJobs = live as unknown as LiveJob[];
    let liveJob: (LiveJob & { startedAt: string }) | null = null;
    if (liveJobs.length) {
      const starts = must(await supabase.from('job_activities').select('job_id, created_at').eq('business_id', b).eq('kind', 'status')
        .eq('to_value', 'in_progress').in('job_id', liveJobs.map((j) => j.id)).order('created_at', { ascending: false })) as { job_id: string; created_at: string }[];
      const latestStart = new Map<string, string>();
      for (const s of starts) if (!latestStart.has(s.job_id)) latestStart.set(s.job_id, s.created_at);
      for (const j of liveJobs) {
        const at = latestStart.get(j.id);
        if (at && (!liveJob || at < liveJob.startedAt)) liveJob = { ...j, startedAt: at };
      }
    }

    const rows = openRows as unknown as OpenRow[];
    const unassigned = rows.filter((r) => (r.job_assignments?.length ?? 0) === 0 && r.status !== 'in_progress').length;
    const onSiteTechs = new Set(rows.filter((r) => r.status === 'in_progress').flatMap((r) => r.job_assignments.map((a) => a.user_id))).size;
    const revenue = (pays as { amount_minor: number }[]).reduce((s, p) => s + p.amount_minor, 0);
    const unpaidRows = unpaid as { balance_minor: number; due_date: string | null }[];
    const outstanding = unpaidRows.reduce((s, i) => s + i.balance_minor, 0);
    const overdueInvoices = unpaidRows.filter((i) => i.due_date && i.due_date < todayD && i.balance_minor > 0).length;

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(new Date(weekStartD + 'T00:00:00Z').getTime() + i * dayMs).toISOString().slice(0, 10);
      return { day: d, label: DAYS[new Date(d + 'T00:00:00Z').getUTCDay()], amounts: [] as number[] };
    });
    for (const p of weekPays as { amount_minor: number; paid_on: string }[]) week.find((w) => w.day === p.paid_on)?.amounts.push(p.amount_minor);

    return { techs, unassigned, onSiteTechs, notInvoiced, overdue, revenue, outstanding, overdueInvoices, maintDue, week, liveJob,
             todayJobs: todayJobs as Job[], members,
             activity: activity as unknown as (Activity & { job: { id: string; reference: string; title: string } | null })[] };
  }, [business.id, tz]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const byUser = new Map(data.members.map((m) => [m.user_id, m]));
  const trial = subscription?.status === 'trial' && subscription.trial_ends_at;
  const weekTotal = data.week.reduce((s, d) => s + d.amounts.reduce((a, b) => a + b, 0), 0);
  const maxPay = Math.max(1, ...data.week.flatMap((d) => d.amounts));
  const todayKey = todayIn(tz);

  return (
    <div className="page page-wide">
      <PageHeader title={t('dash.title')}
        sub={trial ? t('dash.trialEnds', { date: formatDate(subscription!.trial_ends_at, tz, business.date_format) }) : undefined} />

      <section className="kpis">
        <Link to="/jobs?status=new" className="kpi kpi-rose">
          <Chevron />
          <span className="kpi-label">{t('dash.needTech')}</span>
          <span className="kpi-value">{data.unassigned.toLocaleString()}</span>
          <span className="kpi-sub">{data.unassigned ? t('dash.needTechSub') : t('dash.needTechNone')}</span>
          <span className="kpi-go" aria-hidden><ArrowRight size={18} /></span>
        </Link>
        <Link to="/jobs?status=in_progress" className="kpi kpi-wine">
          <Chevron />
          <span className="kpi-label">{t('dash.onSite')}</span>
          <span className="kpi-value">{data.onSiteTechs.toLocaleString()}</span>
          <span className="kpi-sub">{t('dash.onSiteSub', { n: data.techs })}</span>
          <span className="kpi-go" aria-hidden><ArrowRight size={18} /></span>
        </Link>
        <Link to="/jobs?status=completed" className="kpi kpi-ivory">
          <Chevron />
          <span className="kpi-label">{t('dash.notInvoiced')}</span>
          <span className="kpi-value">{data.notInvoiced.toLocaleString()}</span>
          <span className="kpi-sub">{t('dash.notInvoicedSub')}</span>
          <span className="kpi-go" aria-hidden><ArrowRight size={18} /></span>
        </Link>
      </section>

      <div className="dash-grid">
        <div className="dash-main">
          <DispatchBoard jobs={data.todayJobs} members={data.members} tz={tz} />
          <section className="figures figures-tight">
            <Metric label={t('dash.revenue')} text={money(data.revenue, business.currency)} to="/payments" />
            <Metric label={t('dash.outstanding')} text={money(data.outstanding, business.currency)} to="/invoices?status=unpaid" />
            <Metric label={t('dash.overdueInvoices')} value={data.overdueInvoices} to="/invoices?status=overdue" tone={data.overdueInvoices ? 'warn' : undefined} />
            <Metric label={t('dash.overdue')} value={data.overdue} to="/jobs?status=overdue" tone={data.overdue ? 'warn' : undefined} />
          </section>
        </div>

        <aside className="dash-side">
          <LiveCard job={data.liveJob} byUser={byUser} />

          <section className="glass-card">
            <div className="glass-head">
              <h2>{t('dash.cashWeek')}</h2>
              <span className="muted small">{t('dash.cashIn', { amount: money(weekTotal, business.currency) })}</span>
            </div>
            <div className="cash-cols">
              {data.week.map((d) => (
                <div key={d.day} className={`cash-col${d.day === todayKey ? ' today' : ''}`}>
                  <div className="cash-pill" style={{ height: `${Math.min(100, 28 + d.amounts.length * 18)}%` }}>
                    {d.amounts.slice(0, 5).map((a, i) => {
                      const size = Math.round(8 + 14 * Math.sqrt(a / maxPay));
                      return <span key={i} className={`cash-dot c${i % 3}`} style={{ width: size, height: size }} />;
                    })}
                  </div>
                  <span className="cash-day">{d.label}</span>
                </div>
              ))}
            </div>
            <p className="fine">{t('dash.cashHint')}</p>
          </section>

          <section className="glass-card">
            <div className="glass-head"><h2>{t('dash.latest')}</h2></div>
            {data.activity.length === 0 ? <p className="muted small">{t('dash.noActivity')}</p> : (
              <ul className="stagger">
                {data.activity.map((a, i) => {
                  const who = memberName(byUser.get(a.actor_id ?? '')) || t('act.someone');
                  return (
                    <li key={a.id} style={{ marginLeft: Math.min(i, 3) * 8 }}>
                      <span className="avatar" aria-hidden>{initials(who)}</span>
                      <span className="stagger-main">
                        <strong>{who} {t(`act.${a.kind}` as MessageKey)}</strong>
                        <span className="stagger-meta">
                          {a.job ? <Link to={`/jobs/${a.job.id}`}>{a.job.reference}</Link> : null}
                          {a.kind === 'status' && a.to_value ? <> · {t(`status.${a.to_value}` as MessageKey)}</> : null}
                        </span>
                      </span>
                      <time>{relativeFromNow(a.created_at)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link to="/jobs" className="small-link">{t('dash.viewAll')} →</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

/** The arrowhead from the COVARO mark, used as a soft background shape on the summary cards. */
function Chevron() {
  return (
    <svg className="kpi-shape" viewBox="0 0 170 150" aria-hidden>
      <path d="M10 40 L150 75 L10 110 L52 75 Z" />
    </svg>
  );
}

function LiveCard({ job, byUser }: { job: (LiveJob & { startedAt: string }) | null; byUser: Map<string, Member> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!job) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [job]);

  if (!job) {
    return (
      <section className="glass-card">
        <div className="glass-head"><h2>{t('dash.liveJob')}</h2></div>
        <p className="muted small">{t('dash.noLive')}</p>
      </section>
    );
  }
  const tech = byUser.get(job.job_assignments[0]?.user_id ?? '');
  const secs = Math.max(0, Math.floor((now - new Date(job.startedAt).getTime()) / 1000));
  const clock = [Math.floor(secs / 3600), Math.floor(secs / 60) % 60, secs % 60].map((n) => String(n).padStart(2, '0')).join(':');
  const phone = tech?.profile?.phone?.replace(/\D/g, '');
  return (
    <section className="glass-card live-card">
      <div className="glass-head"><h2>{t('dash.liveJob')}</h2><span className="live-pill">{t('dash.live')}</span></div>
      <p className="live-who">{[memberName(tech), job.title, job.customer?.name].filter(Boolean).join(' · ')}</p>
      <p className="live-clock" aria-live="off">{clock}</p>
      <div className="live-actions">
        {phone ? <a className="btn btn-rose" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">{t('dash.whatsapp')}</a> : null}
        <Link className="btn btn-ghost-glass" to={`/jobs/${job.id}`}>{t('dash.openJob')}</Link>
      </div>
    </section>
  );
}

function DispatchBoard({ jobs, members, tz }: { jobs: Job[]; members: Member[]; tz: string }) {
  const hourOf = (iso: string) => { const [h, m] = utcToZonedLocal(iso, tz).slice(11).split(':').map(Number); return h + m / 60; };
  const starts = jobs.filter((j) => j.scheduled_at).map((j) => hourOf(j.scheduled_at!));
  const from = Math.min(8, Math.floor(Math.min(...starts, 8)));
  const to = Math.max(18, Math.ceil(Math.max(...starts.map((s) => s + 2), 18)));
  const span = to - from;
  const nowH = hourOf(new Date().toISOString());
  const pos = (h: number) => `${((Math.min(Math.max(h, from), to) - from) / span) * 100}%`;

  const techs = members.filter((m) => m.status === 'active' && (m.role === 'technician' || jobs.some((j) => j.job_assignments?.some((a) => a.user_id === m.user_id))));
  const lanes: { key: string; name: string; sub?: string; jobs: Job[]; open?: boolean }[] = [
    { key: 'none', name: t('dash.unassigned'), jobs: jobs.filter((j) => !j.job_assignments?.length), open: true },
    ...techs.map((m) => ({ key: m.user_id, name: memberName(m), jobs: jobs.filter((j) => j.job_assignments?.some((a) => a.user_id === m.user_id)) })),
  ];

  return (
    <section className="glass-card dispatch">
      <div className="glass-head">
        <h2>{t('dash.dispatch')}</h2>
        <Link to="/schedule" className="small-link">{t('nav.schedule')}</Link>
      </div>
      {jobs.length === 0 && techs.length === 0 ? <p className="muted small">{t('dash.boardEmpty')}</p> : (
        <div className="db-scroll">
          <div className="db">
            <div className="db-hours" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>
              {Array.from({ length: span }, (_, i) => <span key={i}>{fmtHour(from + i)}</span>)}
            </div>
            {lanes.map((l) => (
              <div key={l.key} className={`db-row${l.open ? ' db-open' : ''}`}>
                <div className="db-who">
                  <span className={`avatar${l.open ? ' avatar-dashed' : ''}`} aria-hidden>{l.open ? '?' : initials(l.name)}</span>
                  <span className="db-name">{l.open ? l.name : <><span>{l.name.split(' ')[0]}</span><span className="db-rest">{l.name.includes(' ') ? ' ' + l.name.split(' ').slice(1).join(' ') : ''}</span></>}</span>
                </div>
                <div className="db-lane" style={{ backgroundSize: `${100 / span}% 100%` }}>
                  {l.jobs.filter((j) => j.scheduled_at).map((j) => {
                    const s = hourOf(j.scheduled_at!);
                    const e = j.completed_at ? Math.max(hourOf(j.completed_at), s + 0.5) : s + 2;
                    const status: JobStatus | 'overdue' = isOverdue(j) && j.status !== 'in_progress' ? 'overdue' : j.status;
                    return (
                      <Link key={j.id} to={`/jobs/${j.id}`} className={`db-bar bar-${status}${l.open ? ' bar-open' : ''}`}
                        style={{ left: pos(s), width: `calc(${pos(e)} - ${pos(s)})` }} title={`${j.title} · ${j.customer?.name ?? ''}`}>
                        {j.title}{j.customer?.name ? ` · ${j.customer.name}` : ''}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {techs.length === 0 && <p className="muted small db-note">{t('dash.noTechs')}</p>}
            {nowH >= from && nowH <= to && <span className="db-now" style={{ left: `calc(var(--db-who) + (100% - var(--db-who)) * ${(nowH - from) / span})` }} aria-label={t('dash.nowLine')} />}
          </div>
        </div>
      )}
    </section>
  );
}

function fmtHour(h: number) {
  const hh = ((h + 11) % 12) + 1;
  return h === 12 ? '12 PM' : h === 0 ? '12 AM' : h < 12 ? `${hh} AM` : `${hh}`;
}

function Metric({ label, value, text, to, tone }: { label: string; value?: number; text?: string; to?: string; tone?: 'warn' }) {
  const inner = <><span className="metric-value">{text ?? (value ?? 0).toLocaleString()}</span><span className="metric-label">{label}</span></>;
  return to ? <Link to={to} className={`metric ${tone ? `metric-${tone}` : ''}`}>{inner}</Link>
    : <div className={`metric ${tone ? `metric-${tone}` : ''}`}>{inner}</div>;
}
