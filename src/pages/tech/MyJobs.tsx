import { Link } from 'react-router-dom';
import { MapPin, Phone } from 'lucide-react';
import { useBusiness } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { must, useAsync } from '../../lib/data';
import { dayKey, formatDateTime, formatTime } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { Job } from '../../lib/types';
import { isOverdue } from '../../lib/types';
import { EmptyState, ErrorBox, PriorityTag, Spinner, StatusBadge } from '../../components/ui';

export default function MyJobs() {
  const { business, profile } = useBusiness();
  const tz = business.time_zone;
  // RLS returns only jobs assigned to this technician.
  const { data, error, loading, reload } = useAsync(async () =>
    must(await supabase.from('jobs').select('*, customer:customers(id, name, phone, address_line1, city)')
      .eq('business_id', business.id).eq('archived', false).order('scheduled_at', { ascending: true, nullsFirst: false }).limit(200)) as Job[],
  [business.id]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const jobs = data ?? [];
  const today = dayKey(new Date(), tz);
  const open = jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled');
  const overdue = open.filter(isOverdue);
  const todays = open.filter((j) => !isOverdue(j) && j.scheduled_at && dayKey(j.scheduled_at, tz) === today);
  const upcoming = open.filter((j) => !isOverdue(j) && !todays.includes(j));
  const done = jobs.filter((j) => j.status === 'completed').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, 5);

  return (
    <div className="page">
      <header className="page-head"><div><h1>{t('nav.myJobs')}</h1><div className="page-sub">{profile?.full_name}</div></div></header>
      {jobs.length === 0 ? <EmptyState title={t('tech.empty')} /> : (
        <>
          <Group title={t('tech.overdue')} jobs={overdue} tz={tz} fmt={business.date_format} tone="warn" />
          <Group title={t('tech.today')} jobs={todays} tz={tz} fmt={business.date_format} timeOnly />
          <Group title={t('tech.upcoming')} jobs={upcoming} tz={tz} fmt={business.date_format} />
          <Group title={t('tech.done')} jobs={done} tz={tz} fmt={business.date_format} />
        </>
      )}
    </div>
  );
}

function Group({ title, jobs, tz, fmt, timeOnly, tone }: { title: string; jobs: Job[]; tz: string; fmt: Parameters<typeof formatTime>[2]; timeOnly?: boolean; tone?: 'warn' }) {
  if (!jobs.length) return null;
  return (
    <section className="job-group">
      <h2 className={tone === 'warn' ? 'warn-text' : ''}>{title} <span className="count">{jobs.length}</span></h2>
      <div className="job-cards">
        {jobs.map((j) => {
          const maps = j.map_link || (j.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}` : null);
          return (
            <article key={j.id} className={`job-card prio-edge-${j.priority}`}>
              <Link to={`/jobs/${j.id}`} className="job-card-main">
                <div className="job-card-top">
                  <span className="job-card-time">{j.scheduled_at ? (timeOnly ? formatTime(j.scheduled_at, tz, fmt) : formatDateTime(j.scheduled_at, tz, fmt)) : '—'}</span>
                  <StatusBadge status={j.status} overdue={isOverdue(j)} />
                </div>
                <strong>{j.title}</strong>
                <span className="muted">{j.reference} · {j.customer?.name}</span>
                {j.address && <span className="muted small">{j.address}</span>}
                <PriorityTag priority={j.priority} />
              </Link>
              <div className="job-card-actions">
                {j.customer?.phone && <a href={`tel:${j.customer.phone}`} aria-label={t('common.call')}><Phone size={18} />{t('common.call')}</a>}
                {maps && <a href={maps} target="_blank" rel="noreferrer" aria-label={t('jobs.openMaps')}><MapPin size={18} />{t('jobs.openMaps')}</a>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
