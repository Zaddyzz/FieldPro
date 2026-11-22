import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { loadMembers, memberName, must, useAsync } from '../lib/data';
import { formatDate } from '../lib/format';
import { t, type MessageKey } from '../lib/i18n';
import type { Customer, Equipment } from '../lib/types';
import { todayIn } from '../lib/types';
import { Button, EmptyState, ErrorBox, Field, LinkButton, PageHeader, Pager, Spinner, usePaged, useToast } from '../components/ui';

const SELECT = '*, customer:customers(id, name), category:equipment_categories(id, name)';
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function WarrantyTag({ date, today }: { date: string | null; today: string }) {
  if (!date) return null;
  if (date < today) return <span className="badge st-cancelled">{t('eq.expired')}</span>;
  if (date <= addDays(today, 30)) return <span className="badge st-awaiting_parts">{t('eq.expiring')}</span>;
  return null;
}

export function EquipmentList() {
  const { business } = useBusiness();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? ''; const cat = params.get('cat') ?? ''; const filter = params.get('f') ?? 'active';
  const today = todayIn(business.time_zone);
  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, cats] = await Promise.all([
      supabase.from('equipment').select(SELECT).eq('business_id', business.id).order('created_at', { ascending: false }).limit(1000).then(must),
      supabase.from('equipment_categories').select('id, name').eq('business_id', business.id).eq('archived', false).order('name').then(must),
    ]);
    return { rows: rows as Equipment[], cats: cats as { id: string; name: string }[] };
  }, [business.id]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((e) =>
      (filter === 'expiring' ? e.status === 'active' && !!e.warranty_expires_on && e.warranty_expires_on >= today && e.warranty_expires_on <= addDays(today, 30) : e.status === filter)
      && (!cat || e.category_id === cat)
      && (!n || `${e.name} ${e.serial_number ?? ''} ${e.model ?? ''} ${e.customer?.name ?? ''}`.toLowerCase().includes(n)));
  }, [data, q, cat, filter, today]);
  const paged = usePaged(rows);
  const update = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  return (
    <div className="page">
      <PageHeader title={t('eq.title')} actions={<LinkButton to="/equipment/new"><Plus size={16} />{t('eq.new')}</LinkButton>} />
      <div className="filters">
        <input type="search" placeholder={t('common.search')} value={q} onChange={(e) => update('q', e.target.value)} aria-label={t('common.search')} />
        <select value={cat} onChange={(e) => update('cat', e.target.value)} aria-label={t('eq.category')}>
          <option value="">{t('eq.category')}: {t('common.all')}</option>
          {(data?.cats ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filter} onChange={(e) => update('f', e.target.value === 'active' ? '' : e.target.value)} aria-label="Status">
          <option value="active">{t('common.active')}</option>
          <option value="expiring">{t('eq.expiring')}</option>
          <option value="archived">{t('common.archived')}</option>
        </select>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> :
        (data?.rows.length ?? 0) === 0 ? <EmptyState title={t('eq.empty')} body={t('eq.emptyBody')} action={<LinkButton to="/equipment/new">{t('eq.new')}</LinkButton>} /> :
        rows.length === 0 ? <p className="muted pad">{t('jobs.noMatch')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('eq.name')}</th><th className="hide-sm">{t('jobs.customer')}</th><th className="hide-sm">{t('eq.serial')}</th><th>{t('eq.warranty')}</th></tr></thead>
              <tbody>
                {paged.items.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/equipment/${e.id}`} className="cell-link"><strong>{e.name}</strong><small>{e.category?.name ?? '—'}<span className="show-sm"> · {e.customer?.name}</span></small></Link></td>
                    <td className="hide-sm">{e.customer?.name}</td>
                    <td className="hide-sm num">{e.serial_number ?? '—'}</td>
                    <td><span className="badges"><span className="num">{formatDate(e.warranty_expires_on ? e.warranty_expires_on + 'T12:00:00Z' : null, 'UTC', business.date_format)}</span><WarrantyTag date={e.warranty_expires_on} today={today} /></span></td>
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

export function EquipmentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { business, isAdmin } = useBusiness();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [customers, cats, members, eq] = await Promise.all([
      supabase.from('customers').select('id, name').eq('business_id', business.id).eq('status', 'active').order('name').then(must),
      supabase.from('equipment_categories').select('id, name').eq('business_id', business.id).eq('archived', false).order('name').then(must),
      loadMembers(business.id),
      id ? supabase.from('equipment').select('*').eq('id', id).maybeSingle().then(must) : Promise.resolve(null),
    ]);
    return { customers: customers as Pick<Customer, 'id' | 'name'>[], cats: cats as { id: string; name: string }[], members, eq: eq as Equipment | null };
  }, [business.id, id]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? t('error.generic')} />;
  return <EqForm key={data.eq?.id ?? 'new'} data={data} preset={params.get('customer')} canAddCategory={isAdmin} onCategoryAdded={reload}
    onDone={(eid) => navigate(`/equipment/${eid}`, { replace: true })} />;
}

function EqForm({ data, preset, onDone, canAddCategory, onCategoryAdded }: {
  data: { customers: Pick<Customer, 'id' | 'name'>[]; cats: { id: string; name: string }[]; members: Awaited<ReturnType<typeof loadMembers>>; eq: Equipment | null };
  preset: string | null; onDone: (id: string) => void; canAddCategory: boolean; onCategoryAdded: () => void;
}) {
  const { business } = useBusiness();
  const e0 = data.eq;
  const [f, setF] = useState({
    customer_id: e0?.customer_id ?? preset ?? '', category_id: e0?.category_id ?? '', name: e0?.name ?? '', manufacturer: e0?.manufacturer ?? '',
    model: e0?.model ?? '', serial_number: e0?.serial_number ?? '', installed_on: e0?.installed_on ?? '', warranty_expires_on: e0?.warranty_expires_on ?? '',
    location: e0?.location ?? '', installed_by: e0?.installed_by ?? '', condition: e0?.condition ?? 'good', notes: e0?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const addCategory = async () => {
    if (!newCat.trim()) return;
    const { data: row, error } = await supabase.from('equipment_categories').insert({ business_id: business.id, name: newCat.trim() }).select('id').single();
    if (error) return setError(errorMessage(error));
    setNewCat(''); onCategoryAdded(); setF((x) => ({ ...x, category_id: row.id }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.customer_id || !f.name.trim()) return setError(t('common.required'));
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v])) as Record<string, string | null>;
    row.condition = f.condition;
    setBusy(true); setError(null);
    const res = e0
      ? await supabase.from('equipment').update(row).eq('id', e0.id).select('id').single()
      : await supabase.from('equipment').insert({ ...row, business_id: business.id }).select('id').single();
    setBusy(false);
    if (res.error) return setError(errorMessage(res.error));
    onDone(res.data.id);
  };

  return (
    <div className="page page-narrow">
      <PageHeader title={e0 ? e0.name : t('eq.new')} back={e0 ? `/equipment/${e0.id}` : '/equipment'} />
      <form className="card stack" onSubmit={submit} noValidate>
        {error && <ErrorBox message={error} />}
        <div className="grid-2">
          <Field label={t('jobs.customer')}>
            <select value={f.customer_id} onChange={set('customer_id')} required>
              <option value="">{t('jobs.pickCustomer')}</option>
              {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('eq.category')} optional>
            <select value={f.category_id} onChange={set('category_id')}>
              <option value="">—</option>
              {data.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        {canAddCategory && (
          <div className="inline-add">
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={t('eq.addCategory')} aria-label={t('eq.addCategory')} maxLength={60} />
            <Button type="button" variant="secondary" onClick={addCategory} disabled={!newCat.trim()}>{t('eq.newCategory')}</Button>
          </div>
        )}
        <Field label={t('eq.name')}><input value={f.name} onChange={set('name')} placeholder="e.g. 5 kVA hybrid inverter" required /></Field>
        <div className="grid-3">
          <Field label={t('eq.manufacturer')} optional><input value={f.manufacturer} onChange={set('manufacturer')} /></Field>
          <Field label={t('eq.model')} optional><input value={f.model} onChange={set('model')} /></Field>
          <Field label={t('eq.serial')} optional><input value={f.serial_number} onChange={set('serial_number')} /></Field>
        </div>
        <div className="grid-3">
          <Field label={t('eq.installed')} optional><input type="date" value={f.installed_on} onChange={set('installed_on')} /></Field>
          <Field label={t('eq.warranty')} optional><input type="date" value={f.warranty_expires_on} onChange={set('warranty_expires_on')} /></Field>
          <Field label={t('eq.condition')}>
            <select value={f.condition} onChange={set('condition')}>
              {(['good', 'fair', 'faulty', 'replaced'] as const).map((c) => <option key={c} value={c}>{t(`eq.cond.${c}` as MessageKey)}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid-2">
          <Field label={t('eq.location')} optional><input value={f.location} onChange={set('location')} placeholder="e.g. Roof, gate, server room" /></Field>
          <Field label={t('eq.installedBy')} optional>
            <select value={f.installed_by} onChange={set('installed_by')}>
              <option value="">—</option>
              {data.members.filter((m) => m.role !== 'customer').map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('eq.notes')} optional><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
        <div className="form-actions"><Button type="submit" busy={busy}>{t('eq.save')}</Button></div>
      </form>
    </div>
  );
}

export function EquipmentDetail() {
  const { id = '' } = useParams();
  const { business } = useBusiness();
  const toast = useToast();
  const today = todayIn(business.time_zone);
  const { data, error, loading, reload } = useAsync(async () => {
    const eq = must(await supabase.from('equipment').select(SELECT).eq('id', id).maybeSingle()) as Equipment | null;
    if (!eq) return null;
    const [links, members] = await Promise.all([
      supabase.from('contract_equipment').select('contract_id').eq('equipment_id', id).then(must),
      loadMembers(business.id),
    ]);
    const contractIds = (links as { contract_id: string }[]).map((l) => l.contract_id);
    const records = contractIds.length
      ? must(await supabase.from('maintenance_records').select('id, serviced_on, job_id, contract_id').in('contract_id', contractIds).order('serviced_on', { ascending: false })) as { id: string; serviced_on: string; job_id: string }[]
      : [];
    return { eq, records, members };
  }, [id, business.id]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <ErrorBox message={t('error.forbidden')} />;
  const e = data.eq;
  const d = (v: string | null) => formatDate(v ? v + 'T12:00:00Z' : null, 'UTC', business.date_format);
  const toggle = async () => {
    const { error } = await supabase.from('equipment').update({ status: e.status === 'active' ? 'archived' : 'active' }).eq('id', e.id);
    if (error) toast.show(errorMessage(error)); else reload();
  };
  return (
    <div className="page">
      <PageHeader title={e.name} back="/equipment" sub={<>{e.category?.name}<WarrantyTag date={e.warranty_expires_on} today={today} />{e.status === 'archived' && <span className="badge st-cancelled">{t('common.archived')}</span>}</>}
        actions={<><LinkButton to={`/equipment/${e.id}/edit`} variant="secondary">{t('common.edit')}</LinkButton>
          <Button variant="ghost" onClick={toggle}>{e.status === 'active' ? t('common.archive') : t('common.restore')}</Button></>} />
      <div className="two-col">
        <section className="panel">
          <dl className="facts">
            <dt>{t('jobs.customer')}</dt><dd><Link to={`/customers/${e.customer_id}`}>{e.customer?.name}</Link></dd>
            <dt>{t('eq.manufacturer')}</dt><dd>{e.manufacturer || '—'}</dd>
            <dt>{t('eq.model')}</dt><dd>{e.model || '—'}</dd>
            <dt>{t('eq.serial')}</dt><dd className="num">{e.serial_number || '—'}</dd>
            <dt>{t('eq.installed')}</dt><dd>{d(e.installed_on)}</dd>
            <dt>{t('eq.warranty')}</dt><dd>{d(e.warranty_expires_on)}</dd>
            <dt>{t('eq.location')}</dt><dd>{e.location || '—'}</dd>
            <dt>{t('eq.installedBy')}</dt><dd>{e.installed_by ? memberName(data.members.find((m) => m.user_id === e.installed_by)) : '—'}</dd>
            <dt>{t('eq.condition')}</dt><dd>{t(`eq.cond.${e.condition}` as MessageKey)}</dd>
            {e.notes && <><dt>{t('eq.notes')}</dt><dd className="pre">{e.notes}</dd></>}
          </dl>
        </section>
        <section className="panel">
          <h2 className="panel-title">{t('eq.history')}</h2>
          {data.records.length === 0 ? <p className="muted pad">{t('eq.noHistory')}</p> : (
            <ul className="rows">{data.records.map((r) => (
              <li key={r.id}><Link to={`/jobs/${r.job_id}`} className="row-link"><span className="row-main"><strong>{d(r.serviced_on)}</strong></span></Link></li>
            ))}</ul>
          )}
        </section>
      </div>
      {toast.node}
    </div>
  );
}
