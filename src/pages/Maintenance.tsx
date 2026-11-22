import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { must, useAsync } from '../lib/data';
import { formatDate } from '../lib/format';
import { money, minorToInput, toMinor } from '../lib/money';
import { t, type MessageKey } from '../lib/i18n';
import type { Contract, Customer, Equipment } from '../lib/types';
import { todayIn } from '../lib/types';
import { Button, EmptyState, ErrorBox, Field, LinkButton, PageHeader, Spinner, useToast } from '../components/ui';

const FREQS = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function ContractList() {
  const { business } = useBusiness();
  const today = todayIn(business.time_zone);
  const fmt = (v: string) => formatDate(v + 'T12:00:00Z', 'UTC', business.date_format);
  const { data, error, loading, reload } = useAsync(async () =>
    must(await supabase.from('maintenance_contracts').select('*, customer:customers(id, name)').eq('business_id', business.id).order('next_service_on')) as Contract[], [business.id]);
  const groups = useMemo(() => {
    const active = (data ?? []).filter((c) => c.status === 'active');
    return {
      overdue: active.filter((c) => c.next_service_on < today),
      due: active.filter((c) => c.next_service_on >= today && c.next_service_on <= addDays(today, 14)),
      later: active.filter((c) => c.next_service_on > addDays(today, 14)),
      cancelled: (data ?? []).filter((c) => c.status === 'cancelled'),
    };
  }, [data, today]);

  const Group = ({ title, rows, warn }: { title: string; rows: Contract[]; warn?: boolean }) => rows.length === 0 ? null : (
    <section className="panel group-panel">
      <h2 className={`panel-title ${warn ? 'warn-text' : ''}`}>{title} <span className="count">{rows.length}</span></h2>
      <ul className="rows">{rows.map((c) => (
        <li key={c.id}><Link to={`/maintenance/${c.id}`} className="row-link">
          <span className="row-main"><strong>{c.title}</strong><span className="meta"><span>{c.customer?.name}</span><span>{t(`mt.freq.${c.frequency}` as MessageKey)}</span></span></span>
          <span className="num">{fmt(c.next_service_on)}</span>
        </Link></li>
      ))}</ul>
    </section>
  );

  return (
    <div className="page">
      <PageHeader title={t('mt.title')} actions={<LinkButton to="/maintenance/new"><Plus size={16} />{t('mt.new')}</LinkButton>} />
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> :
        (data ?? []).length === 0 ? <EmptyState title={t('mt.empty')} body={t('mt.emptyBody')} action={<LinkButton to="/maintenance/new">{t('mt.new')}</LinkButton>} /> : (
          <div className="stack">
            <Group title={t('mt.overdue')} rows={groups.overdue} warn />
            <Group title={t('mt.due')} rows={groups.due} />
            <Group title={t('mt.later')} rows={groups.later} />
            <Group title={t('mt.cancelled')} rows={groups.cancelled} />
          </div>
        )}
    </div>
  );
}

export function ContractForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const { data, error, loading } = useAsync(async () => {
    const [customers, contract, links] = await Promise.all([
      supabase.from('customers').select('id, name').eq('business_id', business.id).eq('status', 'active').order('name').then(must),
      id ? supabase.from('maintenance_contracts').select('*').eq('id', id).maybeSingle().then(must) : Promise.resolve(null),
      id ? supabase.from('contract_equipment').select('equipment_id').eq('contract_id', id).then(must) : Promise.resolve([]),
    ]);
    return { customers: customers as Pick<Customer, 'id' | 'name'>[], contract: contract as Contract | null, covered: (links as { equipment_id: string }[]).map((l) => l.equipment_id) };
  }, [business.id, id]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? t('error.generic')} />;
  return <CForm key={data.contract?.id ?? 'new'} data={data} preset={params.get('customer')} onDone={(cid) => navigate(`/maintenance/${cid}`, { replace: true })} />;
}

function CForm({ data, preset, onDone }: { data: { customers: Pick<Customer, 'id' | 'name'>[]; contract: Contract | null; covered: string[] }; preset: string | null; onDone: (id: string) => void }) {
  const { business } = useBusiness();
  const c0 = data.contract;
  const today = todayIn(business.time_zone);
  const [f, setF] = useState({
    customer_id: c0?.customer_id ?? preset ?? '', title: c0?.title ?? '', starts_on: c0?.starts_on ?? today, ends_on: c0?.ends_on ?? '',
    frequency: c0?.frequency ?? 'quarterly', next_service_on: c0?.next_service_on ?? today,
    price: c0 ? minorToInput(c0.price_minor, business.currency) : '', notes: c0?.notes ?? '',
  });
  const [covered, setCovered] = useState<string[]>(data.covered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { data: equipment } = useAsync(async () => f.customer_id
    ? must(await supabase.from('equipment').select('id, name, serial_number').eq('customer_id', f.customer_id).eq('status', 'active').order('name')) as Pick<Equipment, 'id' | 'name' | 'serial_number'>[]
    : [], [f.customer_id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.customer_id || f.title.trim().length < 2) return setError(t('common.required'));
    const price = f.price.trim() ? toMinor(f.price, business.currency) : 0;
    if (price === null) return setError(t('mt.price') + ': invalid amount');
    const row = { customer_id: f.customer_id, title: f.title.trim(), starts_on: f.starts_on, ends_on: f.ends_on || null, frequency: f.frequency,
      next_service_on: f.next_service_on, price_minor: price, notes: f.notes.trim() || null };
    setBusy(true); setError(null);
    try {
      let cid = c0?.id;
      if (c0) must(await supabase.from('maintenance_contracts').update(row).eq('id', c0.id).select('id').single());
      else cid = (must(await supabase.from('maintenance_contracts').insert({ ...row, business_id: business.id }).select('id').single()) as { id: string }).id;
      const before = new Set(data.covered);
      const add = covered.filter((x) => !before.has(x));
      const remove = data.covered.filter((x) => !covered.includes(x));
      if (add.length) must(await supabase.from('contract_equipment').insert(add.map((equipment_id) => ({ business_id: business.id, contract_id: cid, equipment_id }))).select('contract_id'));
      for (const eqId of remove) must(await supabase.from('contract_equipment').delete().eq('contract_id', cid!).eq('equipment_id', eqId).select('contract_id'));
      onDone(cid!);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return (
    <div className="page page-narrow">
      <PageHeader title={c0 ? c0.title : t('mt.new')} back={c0 ? `/maintenance/${c0.id}` : '/maintenance'} />
      <form className="card stack" onSubmit={submit} noValidate>
        {error && <ErrorBox message={error} />}
        <Field label={t('jobs.customer')}>
          <select value={f.customer_id} onChange={(e) => { set('customer_id')(e); setCovered([]); }} required disabled={!!c0}>
            <option value="">{t('jobs.pickCustomer')}</option>
            {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t('mt.contract')}><input value={f.title} onChange={set('title')} placeholder="e.g. Quarterly solar service" required /></Field>
        <div className="grid-3">
          <Field label={t('mt.frequency')}>
            <select value={f.frequency} onChange={set('frequency')}>{FREQS.map((x) => <option key={x} value={x}>{t(`mt.freq.${x}` as MessageKey)}</option>)}</select>
          </Field>
          <Field label={t('mt.next')}><input type="date" value={f.next_service_on} onChange={set('next_service_on')} required /></Field>
          <Field label={`${t('mt.price')} (${business.currency})`} optional><input inputMode="decimal" value={f.price} onChange={set('price')} placeholder="0.00" /></Field>
        </div>
        <div className="grid-2">
          <Field label={t('mt.starts')}><input type="date" value={f.starts_on} onChange={set('starts_on')} required /></Field>
          <Field label={t('mt.ends')} optional><input type="date" value={f.ends_on} onChange={set('ends_on')} /></Field>
        </div>
        {f.customer_id && (
          <Field label={t('mt.covered')} optional>
            {(equipment ?? []).length === 0 ? <span className="muted">{t('mt.noEquipment')} <Link to={`/equipment/new?customer=${f.customer_id}`}>{t('eq.new')}</Link></span> : (
              <div className="chips">{(equipment ?? []).map((eq) => (
                <label key={eq.id} className={`chip ${covered.includes(eq.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={covered.includes(eq.id)} onChange={(e) => setCovered((x) => e.target.checked ? [...x, eq.id] : x.filter((y) => y !== eq.id))} />
                  {eq.name}{eq.serial_number && <small>{eq.serial_number}</small>}
                </label>))}
              </div>
            )}
          </Field>
        )}
        <Field label={t('eq.notes')} optional><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
        <div className="form-actions"><Button type="submit" busy={busy}>{t('mt.save')}</Button></div>
      </form>
    </div>
  );
}

export function ContractDetail() {
  const { id = '' } = useParams();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayIn(business.time_zone);
  const fmt = (v: string | null) => formatDate(v ? v + 'T12:00:00Z' : null, 'UTC', business.date_format);
  const { data, error, loading, reload } = useAsync(async () => {
    const c = must(await supabase.from('maintenance_contracts').select('*, customer:customers(id, name)').eq('id', id).maybeSingle()) as Contract | null;
    if (!c) return null;
    const [links, records, openJobs] = await Promise.all([
      supabase.from('contract_equipment').select('equipment:equipment(id, name, serial_number)').eq('contract_id', id).then(must),
      supabase.from('maintenance_records').select('id, serviced_on, job_id').eq('contract_id', id).order('serviced_on', { ascending: false }).then(must),
      supabase.from('jobs').select('id, reference, status, scheduled_at').eq('contract_id', id).not('status', 'in', '(completed,cancelled)').then(must),
    ]);
    return { c, equipment: (links as unknown as { equipment: Pick<Equipment, 'id' | 'name' | 'serial_number'> }[]).map((l) => l.equipment),
             records: records as { id: string; serviced_on: string; job_id: string }[], openJobs: openJobs as { id: string; reference: string; status: string }[] };
  }, [id]);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <ErrorBox message={t('error.forbidden')} />;
  const c = data.c;
  const createJob = async () => {
    setBusy(true);
    const { data: jid, error } = await supabase.rpc('create_job_from_contract', { p_contract: c.id });
    setBusy(false);
    if (error) return toast.show(errorMessage(error));
    navigate(`/jobs/${jid}`);
  };
  const cancel = async () => {
    if (!window.confirm(t('mt.cancelConfirm'))) return;
    const { error } = await supabase.from('maintenance_contracts').update({ status: 'cancelled' }).eq('id', c.id);
    if (error) toast.show(errorMessage(error)); else reload();
  };
  const overdue = c.status === 'active' && c.next_service_on < today;
  return (
    <div className="page">
      <PageHeader title={c.title} back="/maintenance"
        sub={<><Link to={`/customers/${c.customer_id}`}>{c.customer?.name}</Link><span>{t(`mt.freq.${c.frequency}` as MessageKey)}</span>
          {c.status === 'cancelled' && <span className="badge st-cancelled">{t('mt.cancelled')}</span>}{overdue && <span className="badge st-overdue">{t('mt.overdue')}</span>}</>}
        actions={c.status === 'active' ? <>
          {data.openJobs.length === 0 && <Button onClick={createJob} busy={busy}>{t('mt.createJob')}</Button>}
          <LinkButton to={`/maintenance/${c.id}/edit`} variant="secondary">{t('common.edit')}</LinkButton>
          <Button variant="ghost" onClick={cancel}>{t('mt.cancel')}</Button>
        </> : undefined} />
      <div className="two-col">
        <section className="panel">
          <dl className="facts">
            <dt>{t('mt.next')}</dt><dd><strong>{fmt(c.next_service_on)}</strong></dd>
            <dt>{t('mt.price')}</dt><dd>{money(c.price_minor, business.currency)}</dd>
            <dt>{t('mt.starts')}</dt><dd>{fmt(c.starts_on)}</dd>
            <dt>{t('mt.ends')}</dt><dd>{fmt(c.ends_on)}</dd>
            <dt>{t('mt.covered')}</dt><dd>{data.equipment.length ? data.equipment.map((e) => <div key={e.id}><Link to={`/equipment/${e.id}`}>{e.name}</Link>{e.serial_number ? ` (${e.serial_number})` : ''}</div>) : '—'}</dd>
            {data.openJobs.length > 0 && <><dt>{t('nav.jobs')}</dt><dd>{data.openJobs.map((j) => <div key={j.id}><Link to={`/jobs/${j.id}`}>{j.reference}</Link> · {t(`status.${j.status}` as MessageKey)}</div>)}</dd></>}
            {c.notes && <><dt>{t('eq.notes')}</dt><dd className="pre">{c.notes}</dd></>}
          </dl>
        </section>
        <section className="panel">
          <h2 className="panel-title">{t('mt.records')}</h2>
          {data.records.length === 0 ? <p className="muted pad">{t('mt.noRecords')}</p> : (
            <ul className="rows">{data.records.map((r) => <li key={r.id}><Link to={`/jobs/${r.job_id}`} className="row-link"><span className="row-main"><strong>{fmt(r.serviced_on)}</strong></span></Link></li>)}</ul>
          )}
        </section>
      </div>
      {toast.node}
    </div>
  );
}
