import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, MapPin, MessageCircle, Phone } from 'lucide-react';
import { jobMapsHref } from '../lib/maps';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage, PHOTO_BUCKET } from '../lib/supabase';
import { loadMembers, memberName, must, useAsync } from '../lib/data';
import { compressImage } from '../lib/image';
import { formatDateTime, relativeFromNow } from '../lib/format';
import { t, type MessageKey } from '../lib/i18n';
import type { Activity, Job, JobStatus } from '../lib/types';
import { isOverdue } from '../lib/types';
import { Button, ErrorBox, Field, LinkButton, PageHeader, PriorityTag, RefTag, Spinner, StatusBadge, useToast } from '../components/ui';
import { STATUSES } from './Jobs';

interface Material { id: string; item: string; quantity: number; added_by: string | null; created_at: string }
interface Photo { id: string; storage_path: string; caption: string | null; created_at: string; url?: string }

export default function JobDetail() {
  const { id = '' } = useParams();
  const { business, isManager, settings } = useBusiness();
  const tz = business.time_zone;
  const toast = useToast();

  const { data, error, loading, reload } = useAsync(async () => {
    const job = must(await supabase.from('jobs').select('*, customer:customers(id, name, phone, address_line1, city), job_assignments(user_id)').eq('id', id).maybeSingle()) as Job | null;
    if (!job) return null;
    const [activity, materials, photos, members] = await Promise.all([
      supabase.from('job_activities').select('*').eq('job_id', id).order('created_at', { ascending: false }).then(must),
      supabase.from('job_materials').select('*').eq('job_id', id).order('created_at').then(must),
      supabase.from('attachments').select('*').eq('job_id', id).order('created_at').then(must),
      loadMembers(business.id),
    ]);
    const list = photos as Photo[];
    if (list.length) {
      const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list.map((p) => p.storage_path), 3600);
      signed?.forEach((s, i) => { list[i].url = s.signedUrl ?? undefined; });
    }
    return { job, activity: activity as Activity[], materials: materials as Material[], photos: list, members };
  }, [id, business.id]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <ErrorBox message={t('jobs.notFound')} />;

  const { job } = data;
  const byUser = new Map(data.members.map((m) => [m.user_id, m]));
  const closed = job.status === 'completed' || job.status === 'cancelled';
  const canWork = isManager || !closed;
  const mapsHref = jobMapsHref(job);

  const setStatus = async (s: JobStatus, workDone?: string) => {
    const res = isManager && !workDone
      ? await supabase.from('jobs').update({ status: s }).eq('id', job.id).select('id').single()
      : await supabase.rpc('tech_update_job', { p_job: job.id, p_status: s, p_work_done: workDone ?? null });
    if (res.error) return toast.show(errorMessage(res.error));
    reload();
  };

  const toggleArchive = async () => {
    if (!job.archived && !window.confirm(t('jobs.archiveConfirm'))) return;
    const { error } = await supabase.from('jobs').update({ archived: !job.archived }).eq('id', job.id);
    if (error) return toast.show(errorMessage(error));
    reload();
  };

  const waText = encodeURIComponent(`${business.name}: ${job.reference} – ${job.title}. ${t(`status.${job.status}` as MessageKey)}.`);
  const waHref = job.customer?.phone ? `https://wa.me/${job.customer.phone.replace('+', '')}?text=${waText}` : null;

  return (
    <div className="page">
      <PageHeader back={isManager ? '/jobs' : '/'} title={job.title}
        sub={<><RefTag value={job.reference} /> <span>{t(`category.${job.category}` as MessageKey)}</span> <StatusBadge status={job.status} overdue={isOverdue(job)} /> <PriorityTag priority={job.priority} />
          {job.archived && <span className="badge st-cancelled">{t('common.archived')}</span>}</>}
        actions={isManager ? <>
          <LinkButton to={`/jobs/${job.id}/edit`} variant="secondary">{t('common.edit')}</LinkButton>
          <Button variant="ghost" onClick={toggleArchive}>{job.archived ? t('common.restore') : t('common.archive')}</Button>
        </> : undefined} />

      <div className="job-grid">
        <div className="stack">
          <section className="panel">
            <div className="contact-strip">
              <div>
                <span className="eyebrow">{t('jobs.customer')}</span>
                {isManager ? <Link to={`/customers/${job.customer?.id}`} className="strong-link">{job.customer?.name}</Link> : <strong>{job.customer?.name}</strong>}
              </div>
              <div className="contact-actions">
                {job.customer?.phone && <a className="btn btn-secondary" href={`tel:${job.customer.phone}`}><Phone size={16} />{t('common.call')}</a>}
                {settings?.whatsapp_enabled && waHref && <a className="btn btn-secondary" href={waHref} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
                {mapsHref && <a className="btn btn-secondary" href={mapsHref} target="_blank" rel="noreferrer"><MapPin size={16} />{t('jobs.openMaps')}</a>}
              </div>
            </div>
            <dl className="facts">
              <dt>{t('jobs.when')}</dt><dd>{formatDateTime(job.scheduled_at, tz, business.date_format)}</dd>
              <dt>{t('jobs.address')}</dt><dd>{mapsHref ? <a href={mapsHref} target="_blank" rel="noreferrer" className="map-inline"><MapPin size={14} />{job.address || [job.customer?.address_line1, job.customer?.city].filter(Boolean).join(', ') || t('jobs.openMaps')}</a> : '—'}</dd>
              <dt>{t('jobs.assignedTo')}</dt><dd>{job.job_assignments?.length ? job.job_assignments.map((a) => memberName(byUser.get(a.user_id))).join(', ') : t('jobs.unassigned')}</dd>
              {job.description && <><dt>{t('jobs.description')}</dt><dd className="pre">{job.description}</dd></>}
              {job.internal_notes && <><dt>{t('jobs.internalNotes')}</dt><dd className="pre">{job.internal_notes}</dd></>}
              {job.work_done && <><dt>{t('jobs.workDone')}</dt><dd className="pre">{job.work_done}</dd></>}
              {job.completed_at && <><dt>{t('status.completed')}</dt><dd>{formatDateTime(job.completed_at, tz, business.date_format)}</dd></>}
            </dl>
          </section>

          <StatusControls job={job} isManager={isManager} onSet={setStatus} />

          <Photos job={job} photos={data.photos} canAdd={canWork} onAdded={reload} toast={toast.show} />
          <Materials job={job} materials={data.materials} canAdd={canWork} onAdded={reload} toast={toast.show} />
        </div>

        <section className="panel">
          <h2 className="panel-title">{t('jobs.activity')}</h2>
          {canWork && <NoteForm job={job} onAdded={reload} toast={toast.show} />}
          <ul className="timeline">
            {data.activity.map((a) => (
              <li key={a.id} className={`tl-${a.kind}`}>
                <div><strong>{memberName(byUser.get(a.actor_id ?? '')) || t('act.someone')}</strong> {t(`act.${a.kind}` as MessageKey)}
                  {(a.kind === 'status' || a.kind === 'completion') && a.from_value && <> <em>{t(`status.${a.from_value}` as MessageKey)}</em> → <em>{t(`status.${a.to_value}` as MessageKey)}</em></>}
                  {(a.kind === 'assigned') && a.to_value && <> <em>{memberName(byUser.get(a.to_value))}</em></>}
                  {(a.kind === 'unassigned') && a.from_value && <> <em>{memberName(byUser.get(a.from_value))}</em></>}
                </div>
                {a.note && <p className="pre">{a.note}</p>}
                <time title={formatDateTime(a.created_at, tz, business.date_format)}>{relativeFromNow(a.created_at)}</time>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {toast.node}
    </div>
  );
}

function StatusControls({ job, isManager, onSet }: { job: Job; isManager: boolean; onSet: (s: JobStatus, workDone?: string) => Promise<void> }) {
  const [completing, setCompleting] = useState(false);
  const [workDone, setWorkDone] = useState(job.work_done ?? '');
  const [busy, setBusy] = useState(false);
  const closed = job.status === 'completed' || job.status === 'cancelled';
  const run = async (s: JobStatus, w?: string) => { setBusy(true); await onSet(s, w); setBusy(false); setCompleting(false); };

  if (closed && !isManager) return <section className="panel"><p className="muted pad">{t('jobs.closed')}</p></section>;

  return (
    <section className="panel">
      <h2 className="panel-title">{t('jobs.setStatus')}</h2>
      {isManager && (
        <div className="pad">
          <select value={job.status} disabled={busy} onChange={(e) => run(e.target.value as JobStatus)} aria-label={t('jobs.status')}>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>)}
          </select>
        </div>
      )}
      {!closed && (
        <div className="big-actions">
          {job.status !== 'in_progress' && <Button busy={busy} onClick={() => run('in_progress')}>{job.status === 'awaiting_parts' ? t('tech.resume') : t('tech.start')}</Button>}
          {job.status !== 'awaiting_parts' && <Button variant="secondary" busy={busy} onClick={() => run('awaiting_parts')}>{t('tech.parts')}</Button>}
          <Button variant="secondary" onClick={() => setCompleting(true)}>{t('jobs.submitCompletion')}</Button>
        </div>
      )}
      {completing && (
        <form className="pad stack" onSubmit={(e) => { e.preventDefault(); run('completed', workDone.trim() || ' '); }}>
          <Field label={t('jobs.workDone')} hint={t('jobs.workDoneHint')}>
            <textarea rows={4} value={workDone} onChange={(e) => setWorkDone(e.target.value)} required autoFocus />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setCompleting(false)}>{t('common.cancel')}</Button>
            <Button type="submit" busy={busy} disabled={!workDone.trim()}>{t('jobs.completeTitle')}</Button>
          </div>
        </form>
      )}
    </section>
  );
}

function NoteForm({ job, onAdded, toast }: { job: Job; onAdded: () => void; toast: (m: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('job_activities').insert({ business_id: job.business_id, job_id: job.id, kind: 'note', note: note.trim() });
    setBusy(false);
    if (error) return toast(errorMessage(error));
    setNote(''); toast(t('jobs.noteSaved')); onAdded();
  };
  return (
    <form className="note-form" onSubmit={submit}>
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('jobs.addNote')} aria-label={t('jobs.addNote')} />
      <Button type="submit" busy={busy} disabled={!note.trim()}>{t('common.add')}</Button>
    </form>
  );
}

function Materials({ job, materials, canAdd, onAdded, toast }: { job: Job; materials: Material[]; canAdd: boolean; onAdded: () => void; toast: (m: string) => void }) {
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = Number(qty);
    if (!item.trim() || !(q > 0)) return;
    setBusy(true);
    const { error } = await supabase.from('job_materials').insert({ business_id: job.business_id, job_id: job.id, item: item.trim(), quantity: q });
    setBusy(false);
    if (error) return toast(errorMessage(error));
    setItem(''); setQty('1'); onAdded();
  };
  return (
    <section className="panel">
      <h2 className="panel-title">{t('jobs.materials')}</h2>
      {materials.length === 0 ? <p className="muted pad">{t('jobs.noMaterials')}</p> : (
        <ul className="rows">{materials.map((m) => <li key={m.id} className="row-plain"><span>{m.item}</span><span className="num">× {Number(m.quantity)}</span></li>)}</ul>
      )}
      {canAdd && (
        <form className="inline-form" onSubmit={submit}>
          <input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t('jobs.item')} aria-label={t('jobs.item')} />
          <input type="number" min="0.01" step="0.01" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label={t('jobs.qty')} className="qty" />
          <Button type="submit" variant="secondary" busy={busy} disabled={!item.trim()}>{t('common.add')}</Button>
        </form>
      )}
    </section>
  );
}

function Photos({ job, photos, canAdd, onAdded, toast }: { job: Job; photos: Photo[]; canAdd: boolean; onAdded: () => void; toast: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await compressImage(file);
        const path = `${job.business_id}/${job.id}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        must(await supabase.from('attachments').insert({ business_id: job.business_id, job_id: job.id, storage_path: path }).select('id'));
      }
      onAdded();
    } catch (e) { toast(errorMessage(e)); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2 className="panel-title">{t('jobs.photos')}</h2>
        {canAdd && <>
          <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => upload(e.target.files)} />
          <Button variant="secondary" busy={busy} onClick={() => input.current?.click()}><Camera size={16} />{busy ? t('jobs.uploading') : t('jobs.addPhoto')}</Button>
        </>}
      </div>
      {photos.length === 0 ? <p className="muted pad">{t('jobs.noPhotos')}</p> : (
        <div className="photo-grid">
          {photos.map((p) => <button key={p.id} className="photo" onClick={() => setOpen(p)}>{p.url ? <img src={p.url} alt={p.caption ?? ''} loading="lazy" /> : null}</button>)}
        </div>
      )}
      {open?.url && <div className="lightbox" onClick={() => setOpen(null)}><img src={open.url} alt={open.caption ?? ''} /></div>}
    </section>
  );
}
