import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Phone, Plus } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { must, useAsync } from '../lib/data';
import { countryByCode, toE164 } from '../lib/countries';
import { formatDate, formatDateTime } from '../lib/format';
import { money } from '../lib/money';
import { t } from '../lib/i18n';
import type { Customer, Doc, Equipment, Job } from '../lib/types';
import { isOverdue, todayIn } from '../lib/types';
import { DocStatus } from './Docs';
import { Button, EmptyState, ErrorBox, Field, LinkButton, PageHeader, Pager, PhoneInput, RefTag, Spinner, StatusBadge, usePaged, useToast } from '../components/ui';

export function CustomerList() {
  const { business } = useBusiness();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'active';
  const city = params.get('city') ?? '';

  const { data, error, loading, reload } = useAsync(async () =>
    must(await supabase.from('customers').select('*').eq('business_id', business.id).order('name')) as Customer[], [business.id]);

  const cities = useMemo(() => Array.from(new Set((data ?? []).map((c) => c.city).filter(Boolean) as string[])).sort(), [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return (data ?? []).filter((c) =>
      c.status === status && (!city || c.city === city) &&
      (!needle || c.name.toLowerCase().includes(needle) || (digits.length >= 3 && c.phone.includes(digits))));
  }, [data, q, status, city]);

  const paged = usePaged(rows);
  const update = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  return (
    <div className="page">
      <PageHeader title={t('cust.title')} actions={<LinkButton to="/customers/new"><Plus size={16} />{t('cust.new')}</LinkButton>} />
      <div className="filters">
        <input type="search" placeholder={t('cust.searchHint')} value={q} onChange={(e) => update('q', e.target.value)} aria-label={t('common.search')} />
        <select value={city} onChange={(e) => update('city', e.target.value)} aria-label={t('cust.area')}>
          <option value="">{t('cust.area')}: {t('common.all')}</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => update('status', e.target.value)} aria-label="Status">
          <option value="active">{t('common.active')}</option>
          <option value="archived">{t('common.archived')}</option>
        </select>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> :
        (data ?? []).length === 0 ? <EmptyState title={t('cust.empty')} body={t('cust.emptyBody')} action={<LinkButton to="/customers/new">{t('cust.new')}</LinkButton>} /> :
        rows.length === 0 ? <p className="muted pad">{t('cust.noMatch')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('cust.name')}</th><th>{t('cust.phone')}</th><th className="hide-sm">{t('cust.city')}</th><th className="hide-sm">{t('cust.email')}</th></tr></thead>
              <tbody>
                {paged.items.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/customers/${c.id}`} className="cell-link"><strong>{c.name}</strong>{c.kind === 'company' && <small>{t('cust.company')}</small>}</Link></td>
                    <td className="num">{c.phone}</td>
                    <td className="hide-sm">{c.city ?? '—'}</td>
                    <td className="hide-sm">{c.email ?? '—'}</td>
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

export function CustomerForm() {
  const { id } = useParams();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const dialDefault = countryByCode(business.country)?.dial ?? '1';

  const { data: existing, loading } = useAsync(async () =>
    id ? must(await supabase.from('customers').select('*').eq('id', id).single()) as Customer : null, [id]);

  return loading ? <Spinner /> : <CustomerFormInner key={existing?.id ?? 'new'} existing={existing ?? null} dialDefault={dialDefault}
    onDone={(cid) => navigate(`/customers/${cid}`, { replace: true })} editing={editing} businessId={business.id} country={business.country} />;
}

function CustomerFormInner({ existing, dialDefault, onDone, editing, businessId, country }:
  { existing: Customer | null; dialDefault: string; onDone: (id: string) => void; editing: boolean; businessId: string; country: string }) {
  const [f, setF] = useState({
    kind: existing?.kind ?? 'individual', name: existing?.name ?? '', contact_person: existing?.contact_person ?? '',
    phone: existing?.phone ?? '', email: existing?.email ?? '', address_line1: existing?.address_line1 ?? '',
    address_line2: existing?.address_line2 ?? '', city: existing?.city ?? '', region: existing?.region ?? '',
    postal_code: existing?.postal_code ?? '', notes: existing?.notes ?? '',
  });
  const [dial, setDial] = useState(dialDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const phone = toE164(f.phone, dial);
    const v: Record<string, string> = {};
    if (!f.name.trim()) v.name = t('common.required');
    if (!phone) v.phone = t('auth.badPhone');
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) v.email = 'Invalid email';
    setErrs(v);
    if (Object.keys(v).length) return;
    const row = {
      kind: f.kind, name: f.name.trim(), contact_person: f.contact_person.trim() || null, phone,
      email: f.email.trim() || null, address_line1: f.address_line1.trim() || null, address_line2: f.address_line2.trim() || null,
      city: f.city.trim() || null, region: f.region.trim() || null, postal_code: f.postal_code.trim() || null,
      notes: f.notes.trim() || null, country,
    };
    setBusy(true); setError(null);
    const res = editing
      ? await supabase.from('customers').update(row).eq('id', existing!.id).select('id').single()
      : await supabase.from('customers').insert({ ...row, business_id: businessId }).select('id').single();
    setBusy(false);
    if (res.error) return setError(errorMessage(res.error));
    onDone(res.data.id);
  };

  return (
    <div className="page page-narrow">
      <PageHeader title={editing ? existing!.name : t('cust.new')} back={editing ? `/customers/${existing!.id}` : '/customers'} />
      <form className="card stack" onSubmit={submit} noValidate>
        {error && <ErrorBox message={error} />}
        <div className="segmented" role="radiogroup" aria-label={t('cust.kind')}>
          {(['individual', 'company'] as const).map((k) => (
            <button type="button" key={k} role="radio" aria-checked={f.kind === k} className={f.kind === k ? 'on' : ''}
              onClick={() => setF((x) => ({ ...x, kind: k }))}>{t(k === 'individual' ? 'cust.individual' : 'cust.company')}</button>
          ))}
        </div>
        <Field label={f.kind === 'company' ? t('cust.companyName') : t('cust.name')} error={errs.name}><input value={f.name} onChange={set('name')} required /></Field>
        {f.kind === 'company' && <Field label={t('cust.contact')} optional><input value={f.contact_person} onChange={set('contact_person')} /></Field>}
        <div className="grid-2">
          <Field label={t('cust.phone')} error={errs.phone}><PhoneInput dial={dial} onDial={setDial} value={f.phone} onChange={(v) => setF((x) => ({ ...x, phone: v }))} required /></Field>
          <Field label={t('cust.email')} optional error={errs.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
        </div>
        <Field label={t('cust.address1')} optional><input value={f.address_line1} onChange={set('address_line1')} autoComplete="address-line1" /></Field>
        <Field label={t('cust.address2')} optional><input value={f.address_line2} onChange={set('address_line2')} autoComplete="address-line2" /></Field>
        <div className="grid-3">
          <Field label={t('cust.city')} optional><input value={f.city} onChange={set('city')} /></Field>
          <Field label={t('cust.region')} optional><input value={f.region} onChange={set('region')} /></Field>
          <Field label={t('cust.postal')} optional><input value={f.postal_code} onChange={set('postal_code')} /></Field>
        </div>
        <Field label={t('cust.notes')} optional><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
        <div className="form-actions"><Button type="submit" busy={busy}>{busy ? t('common.saving') : t('cust.create')}</Button></div>
      </form>
    </div>
  );
}

export function CustomerDetail() {
  const { id = '' } = useParams();
  const { business } = useBusiness();
  const toast = useToast();
  const { session, isAdmin } = useBusiness();
  const today = todayIn(business.time_zone);
  const { data, error, loading, reload } = useAsync(async () => {
    const [c, jobs, equipment, quotes, invoices, contacts, invites] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle().then(must),
      supabase.from('jobs').select('*').eq('customer_id', id).order('created_at', { ascending: false }).then(must),
      supabase.from('equipment').select('id, name, serial_number, warranty_expires_on, status').eq('customer_id', id).eq('status', 'active').order('name').then(must),
      supabase.from('quotations').select('id, reference, status, total_minor, currency, valid_until').eq('customer_id', id).order('created_at', { ascending: false }).then(must),
      supabase.from('invoices').select('id, reference, status, total_minor, balance_minor, due_date, currency').eq('customer_id', id).order('created_at', { ascending: false }).then(must),
      supabase.from('customer_contacts').select('user_id').eq('customer_id', id).then(must),
      supabase.from('invitations').select('id, email, token, accepted_at, revoked_at, expires_at').eq('customer_id', id).is('accepted_at', null).is('revoked_at', null).then(must),
    ]);
    return { customer: c as Customer | null, jobs: jobs as Job[], equipment: equipment as Pick<Equipment, 'id' | 'name' | 'serial_number' | 'warranty_expires_on'>[],
             quotes: quotes as Doc[], invoices: invoices as Doc[], contacts: (contacts as unknown[]).length, invites: invites as { id: string; email: string; token: string }[] };
  }, [id]);
  const [portalEmail, setPortalEmail] = useState('');

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data?.customer) return <ErrorBox message={t('error.forbidden')} />;
  const c = data.customer;

  const toggleArchive = async () => {
    if (c.status === 'active' && !window.confirm(t('cust.archiveConfirm'))) return;
    const { error } = await supabase.from('customers').update({ status: c.status === 'active' ? 'archived' : 'active' }).eq('id', c.id);
    if (error) return toast.show(errorMessage(error));
    reload();
  };

  const addr = [c.address_line1, c.address_line2, c.city, c.region, c.postal_code].filter(Boolean).join(', ');
  return (
    <div className="page">
      <PageHeader title={c.name} back="/customers"
        sub={<>{c.kind === 'company' ? t('cust.company') : t('cust.individual')}{c.status === 'archived' && <span className="badge st-cancelled">{t('common.archived')}</span>}</>}
        actions={<>
          <LinkButton to={`/customers/${c.id}/edit`} variant="secondary">{t('common.edit')}</LinkButton>
          <Button variant="ghost" onClick={toggleArchive}>{c.status === 'active' ? t('common.archive') : t('common.restore')}</Button>
        </>} />
      {c.status === 'active' && (
        <div className="doc-actions">
          <LinkButton to={`/jobs/new?customer=${c.id}`} variant="secondary"><Plus size={16} />{t('jobs.new')}</LinkButton>
          <LinkButton to={`/quotes/new?customer=${c.id}`} variant="secondary"><Plus size={16} />{t('doc.newQuote')}</LinkButton>
          <LinkButton to={`/invoices/new?customer=${c.id}`} variant="secondary"><Plus size={16} />{t('doc.newInvoice')}</LinkButton>
          <LinkButton to={`/equipment/new?customer=${c.id}`} variant="secondary"><Plus size={16} />{t('eq.new')}</LinkButton>
          <LinkButton to={`/maintenance/new?customer=${c.id}`} variant="secondary"><Plus size={16} />{t('mt.new')}</LinkButton>
        </div>
      )}
      <div className="two-col">
        <section className="panel">
          <dl className="facts">
            <dt>{t('cust.phone')}</dt><dd><a href={`tel:${c.phone}`} className="tel"><Phone size={14} />{c.phone}</a></dd>
            {c.contact_person && <><dt>{t('cust.contact')}</dt><dd>{c.contact_person}</dd></>}
            <dt>{t('cust.email')}</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
            <dt>{t('cust.address1')}</dt><dd>{addr || '—'}</dd>
            <dt>{t('cust.notes')}</dt><dd className="pre">{c.notes || '—'}</dd>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-title-row">
            <h2 className="panel-title">{t('cust.jobs')}</h2>
            {c.status === 'active' && <Link to={`/jobs/new?customer=${c.id}`} className="small-link"><Plus size={14} />{t('cust.newJob')}</Link>}
          </div>
          {data.jobs.length === 0 ? <p className="muted pad">{t('cust.noJobs')}</p> : (
            <ul className="rows">
              {data.jobs.map((j) => (
                <li key={j.id}><Link to={`/jobs/${j.id}`} className="row-link">
                  <span className="row-main"><strong>{j.title}</strong><span className="meta"><RefTag value={j.reference} /><span>{formatDateTime(j.scheduled_at ?? j.created_at, business.time_zone, business.date_format)}</span></span></span>
                  <StatusBadge status={j.status} overdue={isOverdue(j)} />
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="two-col section-gap">
        <section className="panel">
          <h2 className="panel-title">{t('nav.invoices')} / {t('nav.quotes')}</h2>
          {data.invoices.length + data.quotes.length === 0 ? <p className="muted pad">{t('portal.noItems')}</p> : (
            <ul className="rows">
              {data.invoices.map((d) => (
                <li key={d.id}><Link to={`/invoices/${d.id}`} className="row-link"><span className="row-main"><strong>{money(d.balance_minor, d.currency)}</strong>
                  <span className="meta"><span className="ref">{d.reference}</span><span>{t('doc.due')} {formatDate(d.due_date ? d.due_date + 'T12:00:00Z' : null, 'UTC', business.date_format)}</span></span></span>
                  <DocStatus doc={d} kind="invoice" today={today} /></Link></li>))}
              {data.quotes.map((d) => (
                <li key={d.id}><Link to={`/quotes/${d.id}`} className="row-link"><span className="row-main"><strong>{money(d.total_minor, d.currency)}</strong>
                  <span className="meta"><span className="ref">{d.reference}</span><span>{t('doc.quote')}</span></span></span>
                  <DocStatus doc={d} kind="quote" today={today} /></Link></li>))}
            </ul>
          )}
        </section>
        <div className="stack">
          <section className="panel">
            <h2 className="panel-title">{t('nav.equipment')}</h2>
            {data.equipment.length === 0 ? <p className="muted pad">{t('mt.noEquipment')}</p> : (
              <ul className="rows">{data.equipment.map((e) => (
                <li key={e.id}><Link to={`/equipment/${e.id}`} className="row-link"><span className="row-main"><strong>{e.name}</strong><small>{e.serial_number ?? ''}</small></span></Link></li>))}</ul>
            )}
          </section>
          {isAdmin && (
            <section className="panel">
              <h2 className="panel-title">{t('portal.access')}</h2>
              <div className="pad stack">
                {data.contacts > 0 && <p>{t('common.active')}: {data.contacts}</p>}
                {data.invites.map((iv) => (
                  <div key={iv.id} className="invite-line">
                    <span>{iv.email}</span>
                    <button className="link" onClick={async () => { const link = `${window.location.origin}/invite/${iv.token}`; try { await navigator.clipboard.writeText(link); toast.show(t('common.copied')); } catch { window.prompt(t('common.copy'), link); } }}>{t('common.copy')}</button>
                  </div>
                ))}
                <p className="fine">{t('portal.inviteHint')}</p>
                <form className="inline-add" onSubmit={async (e) => {
                  e.preventDefault();
                  const email = portalEmail.trim().toLowerCase() || c.email || '';
                  if (!email) return;
                  const { error } = await supabase.from('invitations').insert({ business_id: business.id, email, role: 'customer', customer_id: c.id, invited_by: session!.user.id });
                  if (error) return toast.show(errorMessage(error));
                  setPortalEmail(''); reload();
                }}>
                  <input type="email" value={portalEmail} onChange={(e) => setPortalEmail(e.target.value)} placeholder={c.email ?? t('auth.email')} aria-label={t('auth.email')} />
                  <Button type="submit" variant="secondary">{t('portal.invite')}</Button>
                </form>
              </div>
            </section>
          )}
        </div>
      </div>
      {toast.node}
    </div>
  );
}
