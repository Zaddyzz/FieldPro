import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { loadMembers, memberName, must, useAsync } from '../lib/data';
import { dayKey, formatDateTime, formatTime, formatWeekday, utcToZonedLocal, zonedLocalToUtc } from '../lib/format';
import { t, type MessageKey } from '../lib/i18n';
import type { Category, Customer, Job, JobStatus, Member, Priority } from '../lib/types';
import { isOverdue } from '../lib/types';
import { Button, EmptyState, ErrorBox, Field, LinkButton, PageHeader, Pager, PriorityTag, RefTag, Spinner, StatusBadge, usePaged } from '../components/ui';

export const STATUSES: JobStatus[] = ['new', 'scheduled', 'assigned', 'in_progress', 'awaiting_parts', 'completed', 'cancelled'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];
const CATEGORIES: Category[] = ['installation', 'repair', 'maintenance', 'survey', 'other'];
const SELECT = '*, customer:customers(id, name, phone, address_line1, city), job_assignments(user_id)';

function useJobsData(businessId: string) {
  return useAsync(async () => {
    const [jobs, members] = await Promise.all([
      supabase.from('jobs').select(SELECT).eq('business_id', businessId).order('created_at', { ascending: false }).limit(500).then(must),
      loadMembers(businessId),
    ]);
    return { jobs: jobs as Job[], members };
  }, [businessId]);
}

const techOptions = (members: Member[]) => members.filter((m) => m.status === 'active' && m.role !== 'customer');

export function JobList() {
  const { business } = useBusiness();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const tech = params.get('tech') ?? '';
  const priority = params.get('priority') ?? '';
  const date = params.get('date') ?? '';
  const archived = params.get('archived') === '1';
  const q = params.get('q') ?? '';
  const { data, error, loading, reload } = useJobsData(business.id);
  const tz = business.time_zone;

  const byUser = useMemo(() => new Map((data?.members ?? []).map((m) => [m.user_id, m])), [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.jobs ?? []).filter((j) => {
      if (j.archived !== archived) return false;
      if (status === 'open' && (j.status === 'completed' || j.status === 'cancelled')) return false;
      if (status === 'overdue' && !isOverdue(j)) return false;
      if (STATUSES.includes(status as JobStatus) && j.status !== status) return false;
      if (tech === 'none' && j.job_assignments?.length) return false;
      if (tech && tech !== 'none' && !j.job_assignments?.some((a) => a.user_id === tech)) return false;
      if (priority && j.priority !== priority) return false;
      if (date && (!j.scheduled_at || dayKey(j.scheduled_at, tz) !== date)) return false;
      if (needle && !(`${j.title} ${j.reference} ${j.customer?.name ?? ''}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [data, status, tech, priority, date, archived, q, tz]);

  const paged = usePaged(rows);
  const update = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  return (
    <div className="page">
      <PageHeader title={t('jobs.title')} actions={<LinkButton to="/jobs/new"><Plus size={16} />{t('jobs.new')}</LinkButton>} />
      <div className="filters">
        <input type="search" placeholder={t('common.search')} value={q} onChange={(e) => update('q', e.target.value)} aria-label={t('common.search')} />
        <select value={status} onChange={(e) => update('status', e.target.value)} aria-label={t('jobs.status')}>
          <option value="open">Open</option>
          <option value="all">{t('common.all')}</option>
          <option value="overdue">{t('status.overdue')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>)}
        </select>
        <select value={tech} onChange={(e) => update('tech', e.target.value)} aria-label={t('jobs.technicians')}>
          <option value="">{t('jobs.anyTech')}</option>
          <option value="none">{t('jobs.unassigned')}</option>
          {techOptions(data?.members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
        </select>
        <select value={priority} onChange={(e) => update('priority', e.target.value)} aria-label={t('jobs.priority')}>
          <option value="">{t('jobs.priority')}: {t('common.all')}</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}` as MessageKey)}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => update('date', e.target.value)} aria-label={t('jobs.when')} />
        <label className="check"><input type="checkbox" checked={archived} onChange={(e) => update('archived', e.target.checked ? '1' : '')} />{t('common.archived')}</label>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> :
        (data?.jobs.length ?? 0) === 0 ? <EmptyState title={t('jobs.empty')} body={t('jobs.emptyBody')} action={<LinkButton to="/jobs/new">{t('jobs.new')}</LinkButton>} /> :
        rows.length === 0 ? <p className="muted pad">{t('jobs.noMatch')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('jobs.titleField')}</th><th className="hide-sm">{t('jobs.customer')}</th><th>{t('jobs.when')}</th><th className="hide-sm">{t('jobs.assignedTo')}</th><th>{t('jobs.status')}</th></tr></thead>
              <tbody>
                {paged.items.map((j) => (
                  <tr key={j.id}>
                    <td><Link to={`/jobs/${j.id}`} className="cell-link"><RefTag value={j.reference} /><strong>{j.title}</strong><small className="show-sm">{j.customer?.name}</small></Link></td>
                    <td className="hide-sm">{j.customer?.name}</td>
                    <td className="num">{j.scheduled_at ? formatDateTime(j.scheduled_at, tz, business.date_format) : '—'}</td>
                    <td className="hide-sm">{j.job_assignments?.length ? j.job_assignments.map((a) => memberName(byUser.get(a.user_id))).join(', ') : <span className="muted">{t('jobs.unassigned')}</span>}</td>
                    <td><StatusBadge status={j.status} overdue={isOverdue(j)} /> <PriorityTag priority={j.priority} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...paged} />
          </div>
        )}
    </div>
  );
}

export function Schedule() {
  const { business } = useBusiness();
  const tz = business.time_zone;
  const [mode, setMode] = useState<'day' | 'week'>('week');
  const [anchor, setAnchor] = useState(() => dayKey(new Date(), tz));
  const { data, error, loading, reload } = useJobsData(business.id);

  const days = useMemo(() => {
    const [y, m, d] = anchor.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    if (mode === 'day') return [anchor];
    const dow = (base.getUTCDay() + 6) % 7; // Monday start
    return Array.from({ length: 7 }, (_, i) => new Date(base.getTime() + (i - dow) * 86400000).toISOString().slice(0, 10));
  }, [anchor, mode]);

  const shift = (n: number) => {
    const [y, m, d] = anchor.split('-').map(Number);
    setAnchor(new Date(Date.UTC(y, m - 1, d) + n * (mode === 'day' ? 1 : 7) * 86400000).toISOString().slice(0, 10));
  };

  const byUser = new Map((data?.members ?? []).map((m) => [m.user_id, m]));
  const grouped = new Map<string, Job[]>(days.map((d) => [d, []]));
  for (const j of data?.jobs ?? []) {
    if (!j.scheduled_at || j.archived || j.status === 'cancelled') continue;
    grouped.get(dayKey(j.scheduled_at, tz))?.push(j);
  }
  grouped.forEach((list) => list.sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!)));
  const today = dayKey(new Date(), tz);

  return (
    <div className="page">
      <PageHeader title={t('nav.schedule')} sub={t('jobs.timesIn', { tz })} actions={<LinkButton to="/jobs/new"><Plus size={16} />{t('jobs.new')}</LinkButton>} />
      <div className="sched-bar">
        <div className="segmented">
          <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>{t('jobs.day')}</button>
          <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>{t('jobs.week')}</button>
        </div>
        <div className="sched-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>
          <button className="btn btn-ghost" onClick={() => setAnchor(today)}>{t('tech.today')}</button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Next"><ChevronRight size={18} /></button>
        </div>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className={`sched sched-${mode}`}>
          {days.map((d) => (
            <section key={d} className={`sched-day ${d === today ? 'is-today' : ''}`}>
              <h3>{formatWeekday(d)}</h3>
              {grouped.get(d)!.length === 0 ? <p className="sched-empty">—</p> : grouped.get(d)!.map((j) => (
                <Link key={j.id} to={`/jobs/${j.id}`} className={`sched-item prio-edge-${j.priority} ${isOverdue(j) ? 'is-overdue' : ''}`}>
                  <span className="sched-time">{formatTime(j.scheduled_at, tz, business.date_format)}</span>
                  <strong>{j.title}</strong>
                  <small>{j.customer?.name}{j.job_assignments?.length ? ` · ${j.job_assignments.map((a) => memberName(byUser.get(a.user_id))).join(', ')}` : ` · ${t('jobs.unassigned')}`}</small>
                  <StatusBadge status={j.status} />
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function JobForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { business } = useBusiness();
  const navigate = useNavigate();

  const { data, error, loading } = useAsync(async () => {
    const [customers, members, job] = await Promise.all([
      supabase.from('customers').select('id, name, address_line1, city').eq('business_id', business.id).eq('status', 'active').order('name').then(must),
      loadMembers(business.id),
      id ? supabase.from('jobs').select(SELECT).eq('id', id).maybeSingle().then(must) : Promise.resolve(null),
    ]);
    return { customers: customers as Pick<Customer, 'id' | 'name' | 'address_line1' | 'city'>[], members, job: job as Job | null };
  }, [business.id, id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? t('error.generic')} />;
  if (id && !data.job) return <ErrorBox message={t('jobs.notFound')} />;
  return <JobFormInner data={data} presetCustomer={params.get('customer')} onDone={(jid) => navigate(`/jobs/${jid}`, { replace: true })} />;
}

function JobFormInner({ data, presetCustomer, onDone }: {
  data: { customers: Pick<Customer, 'id' | 'name' | 'address_line1' | 'city'>[]; members: Member[]; job: Job | null };
  presetCustomer: string | null; onDone: (id: string) => void;
}) {
  const { business } = useBusiness();
  const tz = business.time_zone;
  const j = data.job;
  const [f, setF] = useState({
    customer_id: j?.customer_id ?? presetCustomer ?? '', title: j?.title ?? '', description: j?.description ?? '',
    category: j?.category ?? (business.industry === 'other' ? 'repair' : 'installation'), priority: j?.priority ?? 'normal',
    status: j?.status ?? 'new', when: j?.scheduled_at ? utcToZonedLocal(j.scheduled_at, tz) : '',
    address: j?.address ?? '', map_link: j?.map_link ?? '', internal_notes: j?.internal_notes ?? '',
  });
  const [assignees, setAssignees] = useState<string[]>(j?.job_assignments?.map((a) => a.user_id) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const pickCustomer = (cid: string) => {
    const c = data.customers.find((x) => x.id === cid);
    setF((x) => ({ ...x, customer_id: cid, address: x.address || [c?.address_line1, c?.city].filter(Boolean).join(', ') }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!f.customer_id) v.customer_id = t('common.required');
    if (f.title.trim().length < 2) v.title = t('common.required');
    if (f.map_link && !/^https:\/\//i.test(f.map_link)) v.map_link = t('jobs.mapLinkHint');
    setErrs(v);
    if (Object.keys(v).length) return;
    let status = f.status;
    if (!j && status === 'new' && f.when) status = 'scheduled';
    const row = {
      customer_id: f.customer_id, title: f.title.trim(), description: f.description.trim() || null,
      category: f.category, priority: f.priority, status,
      scheduled_at: f.when ? zonedLocalToUtc(f.when, tz) : null, address: f.address.trim() || null,
      map_link: f.map_link.trim() || null, internal_notes: f.internal_notes.trim() || null,
    };
    setBusy(true); setError(null);
    try {
      let jobId = j?.id;
      if (j) {
        must(await supabase.from('jobs').update(row).eq('id', j.id).select('id').single());
      } else {
        jobId = (must(await supabase.from('jobs').insert({ ...row, business_id: business.id }).select('id').single()) as { id: string }).id;
      }
      const before = new Set(j?.job_assignments?.map((a) => a.user_id) ?? []);
      const add = assignees.filter((u) => !before.has(u));
      const remove = [...before].filter((u) => !assignees.includes(u));
      if (add.length) must(await supabase.from('job_assignments').insert(add.map((user_id) => ({ job_id: jobId, business_id: business.id, user_id }))).select('job_id'));
      for (const u of remove) must(await supabase.from('job_assignments').delete().eq('job_id', jobId!).eq('user_id', u).select('job_id'));
      onDone(jobId!);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const techs = techOptions(data.members);
  return (
    <div className="page page-narrow">
      <PageHeader title={j ? j.title : t('jobs.new')} sub={j ? <RefTag value={j.reference} /> : undefined} back={j ? `/jobs/${j.id}` : '/jobs'} />
      <form className="card stack" onSubmit={submit} noValidate>
        {error && <ErrorBox message={error} />}
        {data.customers.length === 0 && !j ? (
          <EmptyState title={t('jobs.noCustomers')} action={<LinkButton to="/customers/new">{t('cust.new')}</LinkButton>} />
        ) : (
          <Field label={t('jobs.customer')} error={errs.customer_id}>
            <select value={f.customer_id} onChange={(e) => pickCustomer(e.target.value)} required>
              <option value="">{t('jobs.pickCustomer')}</option>
              {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('jobs.titleField')} error={errs.title}><input value={f.title} onChange={set('title')} placeholder="e.g. Install 4 cameras + NVR" required /></Field>
        <Field label={t('jobs.description')} optional><textarea rows={3} value={f.description} onChange={set('description')} /></Field>
        <div className="grid-3">
          <Field label={t('jobs.category')}>
            <select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${c}` as MessageKey)}</option>)}</select>
          </Field>
          <Field label={t('jobs.priority')}>
            <select value={f.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}` as MessageKey)}</option>)}</select>
          </Field>
          <Field label={t('jobs.status')}>
            <select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>)}</select>
          </Field>
        </div>
        <Field label={t('jobs.when')} hint={t('jobs.timesIn', { tz })} optional>
          <input type="datetime-local" value={f.when} onChange={set('when')} />
        </Field>
        <Field label={t('jobs.technicians')} optional>
          <div className="chips">
            {techs.length === 0 ? <span className="muted">{t('common.none')} — <Link to="/team">{t('team.invite')}</Link></span> : techs.map((m) => (
              <label key={m.user_id} className={`chip ${assignees.includes(m.user_id) ? 'on' : ''}`}>
                <input type="checkbox" checked={assignees.includes(m.user_id)}
                  onChange={(e) => setAssignees((a) => e.target.checked ? [...a, m.user_id] : a.filter((x) => x !== m.user_id))} />
                {memberName(m)}<small>{t(`role.${m.role}` as MessageKey)}</small>
              </label>
            ))}
          </div>
        </Field>
        <Field label={t('jobs.address')} optional><input value={f.address} onChange={set('address')} /></Field>
        <Field label={t('jobs.mapLink')} hint={t('jobs.mapLinkHint')} error={errs.map_link} optional><input type="url" inputMode="url" value={f.map_link} onChange={set('map_link')} placeholder="https://" /></Field>
        <Field label={t('jobs.internalNotes')} hint={t('jobs.internalHint')} optional><textarea rows={3} value={f.internal_notes} onChange={set('internal_notes')} /></Field>
        <div className="form-actions">
          <Button type="submit" busy={busy} disabled={data.customers.length === 0 && !j}>{busy ? t('common.saving') : j ? t('jobs.saveChanges') : t('jobs.create')}</Button>
        </div>
      </form>
    </div>
  );
}
