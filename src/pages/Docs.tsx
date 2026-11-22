import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Mail, MessageCircle, Plus, Printer, Trash2 } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase, errorMessage } from '../lib/supabase';
import { must, useAsync } from '../lib/data';
import { formatDate } from '../lib/format';
import { computeTotals, digits, money, minorToInput, toMinor } from '../lib/money';
import { t, type MessageKey } from '../lib/i18n';
import type { Customer, Doc, DocItem, DocKind, Payment } from '../lib/types';
import { isInvoiceOverdue, todayIn } from '../lib/types';
import { Button, EmptyState, ErrorBox, Field, LinkButton, PageHeader, Pager, Spinner, usePaged, useToast } from '../components/ui';

const TABLE = (k: DocKind) => (k === 'quote' ? 'quotations' : 'invoices');
const ITEMS = (k: DocKind) => (k === 'quote' ? 'quotation_items' : 'invoice_items');
const FK = (k: DocKind) => (k === 'quote' ? 'quotation_id' : 'invoice_id');
const PATH = (k: DocKind) => (k === 'quote' ? '/quotes' : '/invoices');
const CUST = 'customer:customers(id, name, phone, email, address_line1, city)';
const day = (v: string | null | undefined, fmt: Parameters<typeof formatDate>[2]) => formatDate(v ? v + 'T12:00:00Z' : null, 'UTC', fmt);

export function DocStatus({ doc, kind, today }: { doc: Pick<Doc, 'status' | 'due_date' | 'balance_minor'>; kind: DocKind; today: string }) {
  const overdue = kind === 'invoice' && isInvoiceOverdue(doc, today);
  const cls: Record<string, string> = { draft: 'st-new', sent: 'st-scheduled', accepted: 'st-completed', rejected: 'st-cancelled', expired: 'st-cancelled',
    partially_paid: 'st-awaiting_parts', paid: 'st-completed', cancelled: 'st-cancelled' };
  return (
    <span className="badges">
      <span className={`badge ${cls[doc.status] ?? 'st-new'}`}>{t(`doc.status.${doc.status}` as MessageKey)}</span>
      {overdue && <span className="badge st-overdue">{t('doc.status.overdue')}</span>}
    </span>
  );
}

export function DocList({ kind }: { kind: DocKind }) {
  const { business } = useBusiness();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const today = todayIn(business.time_zone);
  const { data, error, loading, reload } = useAsync(async () =>
    must(await supabase.from(TABLE(kind)).select(`*, ${CUST}`).eq('business_id', business.id).order('created_at', { ascending: false }).limit(1000)) as Doc[],
  [business.id, kind]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data ?? []).filter((d) =>
      (!status || (status === 'overdue' ? isInvoiceOverdue(d, today) : status === 'unpaid' ? ['sent', 'partially_paid'].includes(d.status) : d.status === status))
      && (!n || `${d.reference} ${d.customer?.name ?? ''}`.toLowerCase().includes(n)));
  }, [data, status, q, today]);
  const paged = usePaged(rows);
  const update = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const statuses = kind === 'quote' ? ['draft', 'sent', 'accepted', 'rejected', 'expired'] : ['draft', 'sent', 'partially_paid', 'paid', 'cancelled'];
  const outstanding = kind === 'invoice' ? (data ?? []).filter((d) => ['sent', 'partially_paid'].includes(d.status)).reduce((s, d) => s + (d.balance_minor ?? 0), 0) : 0;

  return (
    <div className="page">
      <PageHeader title={t(kind === 'quote' ? 'doc.quotes' : 'doc.invoices')}
        sub={kind === 'invoice' && data ? <>{t('dash.outstanding')}: <strong>{money(outstanding, business.currency)}</strong></> : undefined}
        actions={<LinkButton to={`${PATH(kind)}/new`}><Plus size={16} />{t(kind === 'quote' ? 'doc.newQuote' : 'doc.newInvoice')}</LinkButton>} />
      <div className="filters">
        <input type="search" placeholder={t('common.search')} value={q} onChange={(e) => update('q', e.target.value)} aria-label={t('common.search')} />
        <select value={status} onChange={(e) => update('status', e.target.value)} aria-label={t('jobs.status')}>
          <option value="">{t('jobs.status')}: {t('common.all')}</option>
          {kind === 'invoice' && <><option value="unpaid">{t('doc.balance')}</option><option value="overdue">{t('doc.status.overdue')}</option></>}
          {statuses.map((s) => <option key={s} value={s}>{t(`doc.status.${s}` as MessageKey)}</option>)}
        </select>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> :
        (data ?? []).length === 0 ? <EmptyState title={t(kind === 'quote' ? 'doc.emptyQuotes' : 'doc.emptyInvoices')} body={t('doc.emptyBody')}
          action={<LinkButton to={`${PATH(kind)}/new`}>{t(kind === 'quote' ? 'doc.newQuote' : 'doc.newInvoice')}</LinkButton>} /> :
        rows.length === 0 ? <p className="muted pad">{t('jobs.noMatch')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t(kind === 'quote' ? 'doc.quote' : 'doc.invoice')}</th><th className="hide-sm">{kind === 'quote' ? t('doc.valid') : t('doc.due')}</th>
                <th className="num">{kind === 'quote' ? t('doc.total') : t('doc.balance')}</th><th>{t('jobs.status')}</th></tr></thead>
              <tbody>
                {paged.items.map((d) => (
                  <tr key={d.id}>
                    <td><Link to={`${PATH(kind)}/${d.id}`} className="cell-link"><span className="ref">{d.reference}</span><strong>{d.customer?.name}</strong></Link></td>
                    <td className="hide-sm num">{day(kind === 'quote' ? d.valid_until : d.due_date, business.date_format)}</td>
                    <td className="num"><strong>{money(kind === 'quote' ? d.total_minor : d.balance_minor, d.currency)}</strong></td>
                    <td><DocStatus doc={d} kind={kind} today={today} /></td>
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

interface Line { key: string; kind: DocItem['kind']; description: string; qty: string; unit: string; id?: string }
let lineSeq = 0;
const newLine = (kind: DocItem['kind'] = 'material'): Line => ({ key: `l${++lineSeq}`, kind, description: '', qty: '1', unit: '' });

export function DocEditor({ kind }: { kind: DocKind }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { business, settings } = useBusiness();
  const navigate = useNavigate();
  const { data, error, loading } = useAsync(async () => {
    const [customers, doc, items, jobs] = await Promise.all([
      supabase.from('customers').select('id, name').eq('business_id', business.id).eq('status', 'active').order('name').then(must),
      id ? supabase.from(TABLE(kind)).select('*').eq('id', id).maybeSingle().then(must) : Promise.resolve(null),
      id ? supabase.from(ITEMS(kind)).select('*').eq(FK(kind), id).order('position').then(must) : Promise.resolve([]),
      supabase.from('jobs').select('id, reference, title, customer_id').eq('business_id', business.id).eq('archived', false).order('created_at', { ascending: false }).limit(200).then(must),
    ]);
    return { customers: customers as Pick<Customer, 'id' | 'name'>[], doc: doc as Doc | null, items: items as DocItem[], jobs: jobs as { id: string; reference: string; title: string; customer_id: string }[] };
  }, [business.id, id, kind]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? t('error.generic')} />;
  if (id && !data.doc) return <ErrorBox message={t('error.forbidden')} />;
  return <Editor key={data.doc?.id ?? 'new'} kind={kind} data={data} presetCustomer={params.get('customer')} presetJob={params.get('job')}
    defaultRate={Number(settings?.default_tax_rate ?? 0)}
    defaultInclusive={settings?.tax_inclusive ?? false} currency={business.currency} businessId={business.id}
    onDone={(did) => navigate(`${PATH(kind)}/${did}`, { replace: true })} />;
}

function Editor({ kind, data, presetCustomer, presetJob, defaultRate, defaultInclusive, currency, businessId, onDone }: {
  kind: DocKind; data: { customers: Pick<Customer, 'id' | 'name'>[]; doc: Doc | null; items: DocItem[]; jobs: { id: string; reference: string; title: string; customer_id: string }[] };
  presetCustomer: string | null; presetJob: string | null; defaultRate: number; defaultInclusive: boolean; currency: string; businessId: string; onDone: (id: string) => void;
}) {
  const { business } = useBusiness();
  const d0 = data.doc;
  const cur = d0?.currency ?? currency;
  const presetJobRow = data.jobs.find((j) => j.id === presetJob);
  const [h, setH] = useState({
    customer_id: d0?.customer_id ?? presetCustomer ?? presetJobRow?.customer_id ?? '', job_id: d0?.job_id ?? presetJob ?? '',
    issue_date: d0?.issue_date ?? todayIn(business.time_zone),
    end_date: (kind === 'quote' ? d0?.valid_until : d0?.due_date) ?? '',
    discount_type: d0?.discount_type ?? 'none', discount_value: d0 ? String(d0.discount_value) : '0',
    tax_rate: d0 ? String(d0.tax_rate) : String(defaultRate), tax_inclusive: d0?.tax_inclusive ?? defaultInclusive, notes: d0?.notes ?? '',
  });
  const [lines, setLines] = useState<Line[]>(data.items.length
    ? data.items.map((i) => ({ key: `l${++lineSeq}`, id: i.id, kind: i.kind, description: i.description, qty: String(Number(i.quantity)), unit: minorToInput(i.unit_price_minor, cur) }))
    : [newLine('labour'), newLine('material')]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const parsed = lines.map((l) => ({ ...l, q: Number(l.qty.replace(/,/g, '')), u: toMinor(l.unit || '0', cur) }));
  const filled = parsed.filter((l) => l.description.trim() || l.unit.trim());
  const totals = computeTotals(filled.map((l) => ({ quantity: l.q || 0, unit: l.u ?? 0 })), h.discount_type, Number(h.discount_value) || 0, Number(h.tax_rate) || 0, h.tax_inclusive, cur);
  const jobs = data.jobs.filter((j) => !h.customer_id || j.customer_id === h.customer_id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!h.customer_id) return setError(t('jobs.pickCustomer'));
    if (filled.length === 0 || filled.some((l) => !l.description.trim() || !(l.q > 0) || l.u === null)) return setError(t('doc.needItem'));
    const rate = Number(h.tax_rate); const dv = Number(h.discount_value);
    if (!(rate >= 0 && rate <= 100) || !(dv >= 0)) return setError(t('doc.taxRate'));
    const header: Record<string, unknown> = {
      customer_id: h.customer_id, job_id: h.job_id || null, issue_date: h.issue_date, discount_type: h.discount_type,
      discount_value: h.discount_type === 'none' ? 0 : dv, tax_rate: rate, tax_inclusive: h.tax_inclusive, notes: h.notes.trim() || null,
    };
    header[kind === 'quote' ? 'valid_until' : 'due_date'] = h.end_date || null;
    setBusy(true); setError(null);
    try {
      let did = d0?.id;
      if (d0) must(await supabase.from(TABLE(kind)).update(header).eq('id', d0.id).select('id').single());
      else did = (must(await supabase.from(TABLE(kind)).insert({ ...header, business_id: businessId }).select('id').single()) as { id: string }).id;
      // replace items: delete removed, update existing, insert new
      const keep = new Set(filled.filter((l) => l.id).map((l) => l.id));
      for (const old of data.items) if (old.id && !keep.has(old.id)) must(await supabase.from(ITEMS(kind)).delete().eq('id', old.id).select('id'));
      for (const [i, l] of filled.entries()) {
        const row = { kind: l.kind, description: l.description.trim(), quantity: l.q, unit_price_minor: l.u!, position: i };
        if (l.id) must(await supabase.from(ITEMS(kind)).update(row).eq('id', l.id).select('id'));
        else must(await supabase.from(ITEMS(kind)).insert({ ...row, business_id: businessId, [FK(kind)]: did }).select('id'));
      }
      onDone(did!);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  const step = digits(cur) === 0 ? '1' : `0.${'0'.repeat(digits(cur) - 1)}1`;
  return (
    <div className="page">
      <PageHeader title={d0 ? d0.reference : t(kind === 'quote' ? 'doc.newQuote' : 'doc.newInvoice')} back={d0 ? `${PATH(kind)}/${d0.id}` : PATH(kind)} />
      <form className="doc-editor" onSubmit={submit} noValidate>
        {error && <ErrorBox message={error} />}
        <section className="card stack">
          <div className="grid-2">
            <Field label={t('jobs.customer')}>
              <select value={h.customer_id} onChange={(e) => setH((x) => ({ ...x, customer_id: e.target.value, job_id: '' }))} required>
                <option value="">{t('jobs.pickCustomer')}</option>
                {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={t('doc.job')} optional>
              <select value={h.job_id} onChange={(e) => setH((x) => ({ ...x, job_id: e.target.value }))}>
                <option value="">{t('doc.none')}</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.reference} · {j.title}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label={t('doc.issue')}><input type="date" value={h.issue_date} onChange={(e) => setH((x) => ({ ...x, issue_date: e.target.value }))} required /></Field>
            <Field label={kind === 'quote' ? t('doc.valid') : t('doc.due')} optional>
              <input type="date" value={h.end_date} onChange={(e) => setH((x) => ({ ...x, end_date: e.target.value }))} />
            </Field>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">{t('doc.items')}</h2>
          <div className="lines">
            <div className="line line-head" aria-hidden>
              <span>{t('doc.description')}</span><span>{t('doc.kind')}</span><span>{t('doc.qty')}</span><span>{t('doc.unit')}</span><span className="num">{t('doc.amount')}</span><span />
            </div>
            {parsed.map((l) => (
              <div className="line" key={l.key}>
                <input className="line-desc" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder={t('doc.description')} aria-label={t('doc.description')} maxLength={300} />
                <select value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value as Line['kind'] })} aria-label={t('doc.kind')}>
                  {(['labour', 'material', 'other'] as const).map((k) => <option key={k} value={k}>{t(`doc.kind.${k}` as MessageKey)}</option>)}
                </select>
                <input type="number" inputMode="decimal" min="0.01" step="0.01" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label={t('doc.qty')} />
                <input inputMode="decimal" step={step} value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} placeholder="0.00" aria-label={t('doc.unit')} />
                <span className="num line-amt">{money(Math.round((l.q || 0) * (l.u ?? 0)), cur)}</span>
                <button type="button" className="icon-btn" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls)} aria-label="Remove line"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus size={16} />{t('doc.addItem')}</Button>
        </section>

        <div className="two-col">
          <section className="card stack">
            <div className="grid-2">
              <Field label={t('doc.discount')}>
                <select value={h.discount_type} onChange={(e) => setH((x) => ({ ...x, discount_type: e.target.value as Doc['discount_type'] }))}>
                  {(['none', 'percent', 'amount'] as const).map((k) => <option key={k} value={k}>{t(`doc.discount.${k}` as MessageKey)}</option>)}
                </select>
              </Field>
              {h.discount_type !== 'none' && (
                <Field label={h.discount_type === 'percent' ? '%' : cur}><input inputMode="decimal" value={h.discount_value} onChange={(e) => setH((x) => ({ ...x, discount_value: e.target.value }))} /></Field>
              )}
            </div>
            <Field label={`${business.tax_label} · ${t('doc.taxRate')}`}><input inputMode="decimal" value={h.tax_rate} onChange={(e) => setH((x) => ({ ...x, tax_rate: e.target.value }))} /></Field>
            <label className="check"><input type="checkbox" checked={h.tax_inclusive} onChange={(e) => setH((x) => ({ ...x, tax_inclusive: e.target.checked }))} />{t('doc.taxInclusive')}</label>
            <Field label={t('doc.notes')} optional><textarea rows={3} value={h.notes} onChange={(e) => setH((x) => ({ ...x, notes: e.target.value }))} /></Field>
          </section>
          <section className="card totals-card">
            <Totals totals={totals} currency={cur} taxLabel={business.tax_label} rate={Number(h.tax_rate) || 0} inclusive={h.tax_inclusive} />
            <Button type="submit" busy={busy} block>{d0 ? t('doc.save') : t('doc.saveDraft')}</Button>
          </section>
        </div>
      </form>
    </div>
  );
}

function Totals({ totals, currency, taxLabel, rate, inclusive, paid, balance }: { totals: { subtotal: number; discount: number; tax: number; total: number }; currency: string; taxLabel: string; rate: number; inclusive: boolean; paid?: number; balance?: number }) {
  return (
    <dl className="totals">
      <dt>{t('doc.subtotal')}</dt><dd>{money(totals.subtotal, currency)}</dd>
      {totals.discount > 0 && <><dt>{t('doc.discount')}</dt><dd>−{money(totals.discount, currency)}</dd></>}
      {rate > 0 && <><dt>{taxLabel} {rate}%{inclusive ? ' (incl.)' : ''}</dt><dd>{money(totals.tax, currency)}</dd></>}
      <dt className="total-row">{t('doc.total')}</dt><dd className="total-row">{money(totals.total, currency)}</dd>
      {paid !== undefined && paid !== 0 && <><dt>{t('doc.paid')}</dt><dd>−{money(paid, currency)}</dd></>}
      {balance !== undefined && <><dt className="total-row">{t('doc.balance')}</dt><dd className="total-row">{money(balance, currency)}</dd></>}
    </dl>
  );
}

export function DocView({ kind }: { kind: DocKind }) {
  const { id = '' } = useParams();
  const { business, settings, isAdmin } = useBusiness();
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayIn(business.time_zone);
  const { data, error, loading, reload } = useAsync(async () => {
    const doc = must(await supabase.from(TABLE(kind)).select(`*, ${CUST}`).eq('id', id).maybeSingle()) as Doc | null;
    if (!doc) return null;
    const [items, payments, extra] = await Promise.all([
      supabase.from(ITEMS(kind)).select('*').eq(FK(kind), id).order('position').then(must),
      kind === 'invoice' ? supabase.from('payments').select('*').eq('invoice_id', id).order('paid_on').order('created_at').then(must) : Promise.resolve([]),
      supabase.from('business_settings').select('payment_instructions, tax_number, payment_methods').eq('business_id', doc.business_id).maybeSingle().then(must),
    ]);
    return { doc, items: items as DocItem[], payments: payments as Payment[], extra: extra as { payment_instructions: string | null; tax_number: string | null; payment_methods: string[] } };
  }, [id, kind]);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <ErrorBox message={t('error.forbidden')} />;
  const d = data.doc;
  const cur = d.currency;
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>, after?: (data: unknown) => void) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) return toast.show(errorMessage(res.error));
    if (after) after(res.data); else reload();
  };
  const setStatus = (status: string) => run(() => supabase.from(TABLE(kind)).update({ status }).eq('id', d.id));
  const editable = kind === 'quote' ? !['accepted', 'rejected'].includes(d.status) && !d.invoice_id : d.status !== 'cancelled' && (d.amount_paid_minor ?? 0) === 0 && data.payments.length === 0;
  const amountText = money(kind === 'invoice' ? (d.balance_minor ?? d.total_minor) : d.total_minor, cur);
  const msg = t('doc.sentMessage', { business: business.name, kind: t(kind === 'quote' ? 'doc.quote' : 'doc.invoice').toLowerCase(), ref: d.reference, amount: amountText, link: window.location.origin });
  const markSentThen = async (open: () => void) => { open(); if (d.status === 'draft') await setStatus('sent'); };
  const phone = d.customer?.phone?.replace('+', '');

  return (
    <div className="page">
      <div className="no-print">
        <PageHeader title={d.reference} back={PATH(kind)}
          sub={<><Link to={`/customers/${d.customer_id}`}>{d.customer?.name}</Link><DocStatus doc={d} kind={kind} today={today} />
            {d.quotation_id && <span>{t('doc.fromQuote')}</span>}
            {d.invoice_id && <Link to={`/invoices/${d.invoice_id}`}>{t('doc.toInvoice')}</Link>}</>}
          actions={<>
            {editable && <LinkButton to={`${PATH(kind)}/${d.id}/edit`} variant="secondary">{t('common.edit')}</LinkButton>}
            <Button variant="secondary" onClick={() => window.print()}><Printer size={16} />{t('doc.print')}</Button>
          </>} />
        <div className="doc-actions">
          {d.status === 'draft' && <Button onClick={() => setStatus('sent')} busy={busy}>{t('doc.markSent')}</Button>}
          {d.customer?.email && d.status !== 'cancelled' && <a className="btn btn-secondary" href={`mailto:${d.customer.email}?subject=${encodeURIComponent(`${d.reference} · ${business.name}`)}&body=${encodeURIComponent(msg)}`}
            onClick={() => markSentThen(() => undefined)}><Mail size={16} />{t('doc.email')}</a>}
          {settings?.whatsapp_enabled && phone && d.status !== 'cancelled' && <a className="btn btn-secondary" href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
            onClick={() => markSentThen(() => undefined)}><MessageCircle size={16} />{t('doc.whatsapp')}</a>}
          {kind === 'quote' && !d.invoice_id && !['rejected', 'expired'].includes(d.status) && <Button onClick={() => run(() => supabase.rpc('convert_quote_to_invoice', { p_quote: d.id }), (iid) => navigate(`/invoices/${iid}`))} busy={busy}>{t('doc.convert')}</Button>}
          {kind === 'quote' && d.status === 'sent' && <><Button variant="ghost" onClick={() => setStatus('accepted')}>{t('doc.accept')}</Button><Button variant="ghost" onClick={() => setStatus('rejected')}>{t('doc.reject')}</Button></>}
          {kind === 'invoice' && ['sent', 'partially_paid', 'draft'].includes(d.status) && (d.balance_minor ?? 0) > 0 && <Button onClick={() => setPaying(true)}>{t('pay.record')}</Button>}
          {kind === 'invoice' && d.status !== 'cancelled' && (d.amount_paid_minor ?? 0) === 0 && isAdmin && <Button variant="ghost" onClick={() => window.confirm(t('doc.cancelConfirm')) && setStatus('cancelled')}>{t('doc.cancelInvoice')}</Button>}
        </div>
        {paying && <PaymentForm invoice={d} methods={data.extra?.payment_methods ?? []} onDone={() => { setPaying(false); toast.show(t('pay.recorded')); reload(); }} onCancel={() => setPaying(false)} />}
        {!editable && kind === 'invoice' && d.status !== 'draft' && <p className="fine">{t('doc.locked')}</p>}
      </div>

      <article className="paper">
        <header className="paper-head">
          <div>
            <h2 className="paper-biz">{business.name}</h2>
            <p className="muted">{[business.address_line1, business.city, business.region].filter(Boolean).join(', ')}</p>
            <p className="muted">{[business.phone, business.email].filter(Boolean).join(' · ')}</p>
            {data.extra?.tax_number && <p className="muted">{t('doc.taxNo')}: {data.extra.tax_number}</p>}
          </div>
          <div className="paper-meta">
            <h1>{t(kind === 'quote' ? 'doc.quote' : 'doc.invoice')}</h1>
            <dl>
              <dt>No.</dt><dd>{d.reference}</dd>
              <dt>{t('doc.issue')}</dt><dd>{day(d.issue_date, business.date_format)}</dd>
              {kind === 'quote' ? <><dt>{t('doc.valid')}</dt><dd>{day(d.valid_until, business.date_format)}</dd></> : <><dt>{t('doc.due')}</dt><dd>{day(d.due_date, business.date_format)}</dd></>}
            </dl>
          </div>
        </header>
        <section className="paper-to">
          <span className="eyebrow">{t('doc.billTo')}</span>
          <strong>{d.customer?.name}</strong>
          <span>{[d.customer?.address_line1, d.customer?.city].filter(Boolean).join(', ')}</span>
          <span>{[d.customer?.phone, d.customer?.email].filter(Boolean).join(' · ')}</span>
        </section>
        <table className="paper-items">
          <thead><tr><th>{t('doc.description')}</th><th className="num">{t('doc.qty')}</th><th className="num">{t('doc.unit')}</th><th className="num">{t('doc.amount')}</th></tr></thead>
          <tbody>{data.items.map((i) => (
            <tr key={i.id}><td>{i.description}<small>{t(`doc.kind.${i.kind}` as MessageKey)}</small></td><td className="num">{Number(i.quantity)}</td>
              <td className="num">{money(i.unit_price_minor, cur)}</td><td className="num">{money(i.line_total_minor ?? 0, cur)}</td></tr>
          ))}</tbody>
        </table>
        <div className="paper-foot">
          <div className="paper-notes">
            {d.notes && <><span className="eyebrow">{t('doc.notes')}</span><p className="pre">{d.notes}</p></>}
            {kind === 'invoice' && data.extra?.payment_instructions && <><span className="eyebrow">{t('doc.payTo')}</span><p className="pre">{data.extra.payment_instructions}</p></>}
          </div>
          <Totals totals={{ subtotal: d.subtotal_minor, discount: d.discount_minor, tax: d.tax_minor, total: d.total_minor }} currency={cur}
            taxLabel={business.tax_label} rate={Number(d.tax_rate)} inclusive={d.tax_inclusive}
            paid={kind === 'invoice' ? d.amount_paid_minor : undefined} balance={kind === 'invoice' ? d.balance_minor : undefined} />
        </div>
      </article>

      {kind === 'invoice' && data.payments.length > 0 && (
        <section className="panel no-print">
          <h2 className="panel-title">{t('pay.title')}</h2>
          <ul className="rows">{data.payments.map((p) => {
            const reversed = data.payments.some((x) => x.reverses_payment_id === p.id);
            return (
              <li key={p.id} className="row-plain pay-row">
                <span className="row-main"><strong className={p.amount_minor < 0 ? 'neg' : ''}>{money(p.amount_minor, cur)}</strong>
                  <span className="meta"><span>{day(p.paid_on, business.date_format)}</span><span>{p.method}</span>{p.reference && <span>{p.reference}</span>}{p.notes && <span>{p.notes}</span>}</span></span>
                {isAdmin && p.amount_minor > 0 && !reversed && <button className="link danger" onClick={() => {
                  const reason = window.prompt(t('pay.reversePrompt'));
                  if (reason && reason.trim()) run(() => supabase.rpc('reverse_payment', { p_payment: p.id, p_reason: reason.trim() }));
                }}>{t('pay.reverse')}</button>}
                {reversed && <span className="badge st-cancelled">{t('pay.reversal')}</span>}
              </li>
            );
          })}</ul>
        </section>
      )}
      {toast.node}
    </div>
  );
}

function PaymentForm({ invoice, methods, onDone, onCancel }: { invoice: Doc; methods: string[]; onDone: () => void; onCancel: () => void }) {
  const { business } = useBusiness();
  const [f, setF] = useState({ amount: minorToInput(invoice.balance_minor ?? 0, invoice.currency), date: todayIn(business.time_zone), method: methods[0] ?? 'Cash', reference: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = toMinor(f.amount, invoice.currency);
    if (!amt || amt <= 0) return setError(t('pay.amount'));
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('record_payment', { p_invoice: invoice.id, p_amount_minor: amt, p_paid_on: f.date, p_method: f.method, p_reference: f.reference, p_notes: f.notes });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onDone();
  };
  return (
    <form className="card stack pay-form" onSubmit={submit}>
      <h2 className="card-title">{t('pay.record')} · {invoice.reference}</h2>
      <p className="fine">{t('pay.onlyRecorded')}</p>
      {error && <ErrorBox message={error} />}
      <div className="grid-3">
        <Field label={`${t('pay.amount')} (${invoice.currency})`}><input inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} required /></Field>
        <Field label={t('pay.date')}><input type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} required /></Field>
        <Field label={t('pay.method')}><select value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value }))}>{(methods.length ? methods : ['Cash']).map((m) => <option key={m}>{m}</option>)}</select></Field>
      </div>
      <div className="grid-2">
        <Field label={t('pay.reference')} optional><input value={f.reference} onChange={(e) => setF((x) => ({ ...x, reference: e.target.value }))} maxLength={120} /></Field>
        <Field label={t('pay.notes')} optional><input value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} maxLength={500} /></Field>
      </div>
      <div className="form-actions"><Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button><Button type="submit" busy={busy}>{t('pay.save')}</Button></div>
    </form>
  );
}

export function PaymentList() {
  const { business } = useBusiness();
  const { data, error, loading, reload } = useAsync(async () =>
    must(await supabase.from('payments').select('*, invoice:invoices(id, reference, currency, customer:customers(name))').eq('business_id', business.id)
      .order('paid_on', { ascending: false }).order('created_at', { ascending: false }).limit(1000)) as Payment[], [business.id]);
  const paged = usePaged(data ?? []);
  const total = (data ?? []).reduce((s, p) => s + p.amount_minor, 0);
  return (
    <div className="page">
      <PageHeader title={t('pay.title')} sub={data ? <>{t('doc.total')}: <strong>{money(total, business.currency)}</strong></> : undefined} />
      <p className="fine">{t('pay.onlyRecorded')}</p><br />
      {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> :
        (data ?? []).length === 0 ? <EmptyState title={t('pay.empty')} action={<LinkButton to="/invoices">{t('nav.invoices')}</LinkButton>} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('pay.invoice')}</th><th className="hide-sm">{t('pay.method')}</th><th>{t('pay.date')}</th><th className="num">{t('pay.amount')}</th></tr></thead>
              <tbody>{paged.items.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/invoices/${p.invoice_id}`} className="cell-link"><span className="ref">{p.invoice?.reference}</span><strong>{p.invoice?.customer?.name}</strong>{p.notes && <small>{p.notes}</small>}</Link></td>
                  <td className="hide-sm">{p.method}{p.reference ? ` · ${p.reference}` : ''}</td>
                  <td className="num">{day(p.paid_on, business.date_format)}</td>
                  <td className={`num ${p.amount_minor < 0 ? 'neg' : ''}`}><strong>{money(p.amount_minor, p.invoice?.currency ?? business.currency)}</strong></td>
                </tr>
              ))}</tbody>
            </table>
            <Pager {...paged} />
          </div>
        )}
    </div>
  );
}
