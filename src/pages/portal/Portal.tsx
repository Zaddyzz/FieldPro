import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Phone, Printer } from 'lucide-react';
import { useBusiness } from '../../lib/session';
import { supabase, errorMessage } from '../../lib/supabase';
import { useAsync } from '../../lib/data';
import { formatDate, formatDateTime } from '../../lib/format';
import { money } from '../../lib/money';
import { t, type MessageKey } from '../../lib/i18n';
import type { DateFormat } from '../../lib/countries';
import type { JobStatus } from '../../lib/types';
import { isInvoiceOverdue, todayIn } from '../../lib/types';
import { Button, ErrorBox, Field, Notice, Spinner, StatusBadge, useToast } from '../../components/ui';
import { DocStatus } from '../Docs';

interface Overview {
  customer: { id: string; name: string; phone: string; email: string | null; address: string };
  business: { name: string; phone: string | null; email: string | null; currency: string; time_zone: string; date_format: DateFormat; tax_label: string; payment_instructions: string | null };
  jobs: { id: string; reference: string; title: string; status: JobStatus; scheduled_at: string | null; completed_at: string | null; work_done: string | null }[];
  quotes: { id: string; reference: string; status: string; issue_date: string; valid_until: string | null; total_minor: number; currency: string }[];
  invoices: { id: string; reference: string; status: string; issue_date: string; due_date: string | null; total_minor: number; balance_minor: number; currency: string }[];
  payments: { id: string; amount_minor: number; paid_on: string; method: string; invoice: string; currency: string }[];
  equipment: { id: string; name: string; category: string | null; model: string | null; serial_number: string | null; installed_on: string | null; warranty_expires_on: string | null; location: string | null }[];
  contracts: { id: string; title: string; frequency: string; next_service_on: string }[];
}

const day = (v: string | null, fmt: DateFormat) => formatDate(v ? v + 'T12:00:00Z' : null, 'UTC', fmt);

export function Portal() {
  const { business } = useBusiness();
  const toast = useToast();
  const [tab, setTab] = useState<'jobs' | 'quotes' | 'invoices' | 'equipment'>('jobs');
  const { data, error, loading, reload } = useAsync(async () => {
    const { data, error } = await supabase.rpc('portal_overview', { p_business: business.id });
    if (error) throw new Error(error.message);
    return data as Overview;
  }, [business.id]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? t('error.generic')} onRetry={reload} />;
  const b = data.business;
  const today = todayIn(b.time_zone);
  const due = data.invoices.filter((i) => ['sent', 'partially_paid'].includes(i.status)).reduce((s, i) => s + i.balance_minor, 0);
  const tabs = [['jobs', t('portal.jobs')], ['quotes', t('nav.quotes')], ['invoices', t('nav.invoices')], ['equipment', t('nav.equipment')]] as const;

  return (
    <div className="page portal">
      <header className="page-head">
        <div><h1>{t('portal.hello', { name: data.customer.name })}</h1><div className="page-sub">{b.name}</div></div>
        {b.phone && <a className="btn btn-secondary" href={`tel:${b.phone}`}><Phone size={16} />{t('portal.contact', { business: b.name })}</a>}
      </header>

      <section className="figures">
        <div className="metric"><span className="metric-value">{money(due, b.currency)}</span><span className="metric-label">{t('doc.balance')}</span></div>
        <div className="metric"><span className="metric-value">{data.jobs.filter((j) => !['completed', 'cancelled'].includes(j.status)).length}</span><span className="metric-label">{t('dash.openJobs')}</span></div>
        <div className="metric"><span className="metric-value">{data.contracts[0] ? day(data.contracts[0].next_service_on, b.date_format) : '—'}</span><span className="metric-label">{t('mt.next')}</span></div>
        <div className="metric"><span className="metric-value">{data.equipment.length}</span><span className="metric-label">{t('nav.equipment')}</span></div>
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="segmented portal-tabs" role="tablist">
            {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
          </div>
          {tab === 'jobs' && (data.jobs.length === 0 ? <p className="muted pad">{t('portal.noItems')}</p> : (
            <ul className="rows">{data.jobs.map((j) => (
              <li key={j.id} className="row-plain portal-row">
                <span className="row-main"><strong>{j.title}</strong><span className="meta"><span className="ref">{j.reference}</span>
                  <span>{formatDateTime(j.completed_at ?? j.scheduled_at, b.time_zone, b.date_format)}</span></span>
                  {j.work_done && <span className="muted small pre">{j.work_done}</span>}</span>
                <StatusBadge status={j.status} />
              </li>))}</ul>))}
          {tab === 'quotes' && (data.quotes.length === 0 ? <p className="muted pad">{t('portal.noItems')}</p> : (
            <ul className="rows">{data.quotes.map((q) => (
              <li key={q.id}><Link to={`/portal/quote/${q.id}`} className="row-link">
                <span className="row-main"><strong>{money(q.total_minor, q.currency)}</strong><span className="meta"><span className="ref">{q.reference}</span><span>{t('doc.valid')} {day(q.valid_until, b.date_format)}</span></span></span>
                <DocStatus doc={{ status: q.status, due_date: null, balance_minor: 0 }} kind="quote" today={today} />
              </Link></li>))}</ul>))}
          {tab === 'invoices' && (data.invoices.length === 0 ? <p className="muted pad">{t('portal.noItems')}</p> : (
            <ul className="rows">{data.invoices.map((i) => (
              <li key={i.id}><Link to={`/portal/invoice/${i.id}`} className="row-link">
                <span className="row-main"><strong>{money(i.balance_minor, i.currency)}</strong><span className="meta"><span className="ref">{i.reference}</span><span>{t('doc.due')} {day(i.due_date, b.date_format)}</span></span></span>
                <DocStatus doc={i} kind="invoice" today={today} />
              </Link></li>))}</ul>))}
          {tab === 'equipment' && (data.equipment.length === 0 ? <p className="muted pad">{t('portal.noItems')}</p> : (
            <ul className="rows">{data.equipment.map((e) => (
              <li key={e.id} className="row-plain portal-row">
                <span className="row-main"><strong>{e.name}</strong><span className="meta">{e.category && <span>{e.category}</span>}{e.serial_number && <span>{e.serial_number}</span>}{e.location && <span>{e.location}</span>}</span></span>
                <span className="small muted">{t('eq.warranty')} {day(e.warranty_expires_on, b.date_format)}</span>
              </li>))}</ul>))}
        </section>

        <div className="stack">
          <RequestForm contracts={data.contracts} businessName={b.name} onSent={() => { toast.show(t('portal.sent', { business: b.name })); reload(); }} />
          {data.payments.length > 0 && (
            <section className="panel">
              <h2 className="panel-title">{t('pay.title')}</h2>
              <ul className="rows">{data.payments.slice(0, 8).map((p) => (
                <li key={p.id} className="row-plain"><span className="row-main"><strong className={p.amount_minor < 0 ? 'neg' : ''}>{money(p.amount_minor, p.currency)}</strong>
                  <span className="meta"><span className="ref">{p.invoice}</span><span>{day(p.paid_on, b.date_format)}</span><span>{p.method}</span></span></span></li>))}</ul>
            </section>
          )}
        </div>
      </div>
      {toast.node}
    </div>
  );
}

function RequestForm({ contracts, businessName, onSent }: { contracts: Overview['contracts']; businessName: string; onSent: () => void }) {
  const { business } = useBusiness();
  const [f, setF] = useState({ title: '', description: '', preferred: '', contract: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('portal_request_service', { p_business: business.id, p_title: f.title, p_description: f.description, p_preferred: f.preferred, p_contract: f.contract || null });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setF({ title: '', description: '', preferred: '', contract: '' }); onSent();
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="card-title">{t('portal.request')}</h2>
      {error && <ErrorBox message={error} />}
      <Field label={t('portal.requestTitle')}><input value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="e.g. Camera at the gate is offline" required minLength={3} maxLength={160} /></Field>
      <Field label={t('portal.requestDetail')} optional><textarea rows={3} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} /></Field>
      <Field label={t('portal.preferred')} optional><input value={f.preferred} onChange={(e) => setF((x) => ({ ...x, preferred: e.target.value }))} placeholder="e.g. Weekday mornings" /></Field>
      {contracts.length > 0 && (
        <Field label={t('nav.maintenance')} optional>
          <select value={f.contract} onChange={(e) => setF((x) => ({ ...x, contract: e.target.value }))}>
            <option value="">—</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
      )}
      <Button type="submit" busy={busy} disabled={f.title.trim().length < 3}>{t('portal.send')}</Button>
      <span className="sr-only">{businessName}</span>
    </form>
  );
}

interface PortalDoc {
  id: string; reference: string; status: string; issue_date: string; due_date?: string | null; valid_until?: string | null; currency: string;
  subtotal_minor: number; discount_minor: number; tax_minor: number; total_minor: number; tax_rate: number; tax_inclusive: boolean;
  amount_paid_minor?: number; balance_minor?: number; notes: string | null;
  items: { kind: string; description: string; quantity: number; unit_price_minor: number; line_total_minor: number }[];
}

export function PortalDocument({ kind }: { kind: 'quote' | 'invoice' }) {
  const { id = '' } = useParams();
  const { business } = useBusiness();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [doc, ov] = await Promise.all([
      supabase.rpc('portal_document', { p_business: business.id, p_kind: kind, p_id: id }),
      supabase.rpc('portal_overview', { p_business: business.id }),
    ]);
    if (doc.error) throw new Error(doc.error.message);
    return { doc: doc.data as PortalDoc, ov: ov.data as Overview };
  }, [id, kind, business.id]);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? t('error.generic')} />;
  const d = data.doc; const b = data.ov.business; const c = data.ov.customer;
  const today = todayIn(b.time_zone);
  const respond = async (accept: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc('portal_respond_quote', { p_business: business.id, p_quote: d.id, p_accept: accept });
    setBusy(false);
    if (error) toast.show(errorMessage(error)); else reload();
  };
  return (
    <div className="page">
      <div className="no-print">
        <header className="page-head">
          <div><Link to="/" className="back-link">← {t('common.back')}</Link><h1>{d.reference}</h1>
            <div className="page-sub"><DocStatus doc={{ status: d.status, due_date: d.due_date ?? null, balance_minor: d.balance_minor ?? 0 }} kind={kind} today={today} /></div></div>
          <div className="page-actions"><Button variant="secondary" onClick={() => window.print()}><Printer size={16} />{t('doc.print')}</Button></div>
        </header>
        {kind === 'quote' && d.status === 'sent' && (
          <div className="doc-actions"><Button onClick={() => respond(true)} busy={busy}>{t('portal.acceptQuote')}</Button><Button variant="ghost" onClick={() => respond(false)} disabled={busy}>{t('portal.rejectQuote')}</Button></div>
        )}
        {kind === 'invoice' && isInvoiceOverdue({ status: d.status, due_date: d.due_date ?? null, balance_minor: d.balance_minor ?? 0 }, today) && <Notice tone="warn">{t('doc.status.overdue')}</Notice>}
      </div>
      <article className="paper">
        <header className="paper-head">
          <div><h2 className="paper-biz">{b.name}</h2><p className="muted">{[b.phone, b.email].filter(Boolean).join(' · ')}</p></div>
          <div className="paper-meta"><h1>{t(kind === 'quote' ? 'doc.quote' : 'doc.invoice')}</h1>
            <dl><dt>No.</dt><dd>{d.reference}</dd><dt>{t('doc.issue')}</dt><dd>{day(d.issue_date, b.date_format)}</dd>
              {kind === 'quote' ? <><dt>{t('doc.valid')}</dt><dd>{day(d.valid_until ?? null, b.date_format)}</dd></> : <><dt>{t('doc.due')}</dt><dd>{day(d.due_date ?? null, b.date_format)}</dd></>}</dl>
          </div>
        </header>
        <section className="paper-to"><span className="eyebrow">{t('doc.billTo')}</span><strong>{c.name}</strong><span>{c.address}</span></section>
        <table className="paper-items">
          <thead><tr><th>{t('doc.description')}</th><th className="num">{t('doc.qty')}</th><th className="num">{t('doc.unit')}</th><th className="num">{t('doc.amount')}</th></tr></thead>
          <tbody>{d.items.map((i, n) => <tr key={n}><td>{i.description}<small>{t(`doc.kind.${i.kind}` as MessageKey)}</small></td><td className="num">{Number(i.quantity)}</td><td className="num">{money(i.unit_price_minor, d.currency)}</td><td className="num">{money(i.line_total_minor, d.currency)}</td></tr>)}</tbody>
        </table>
        <div className="paper-foot">
          <div className="paper-notes">
            {d.notes && <><span className="eyebrow">{t('doc.notes')}</span><p className="pre">{d.notes}</p></>}
            {kind === 'invoice' && b.payment_instructions && <><span className="eyebrow">{t('doc.payTo')}</span><p className="pre">{b.payment_instructions}</p></>}
          </div>
          <dl className="totals">
            <dt>{t('doc.subtotal')}</dt><dd>{money(d.subtotal_minor, d.currency)}</dd>
            {d.discount_minor > 0 && <><dt>{t('doc.discount')}</dt><dd>−{money(d.discount_minor, d.currency)}</dd></>}
            {Number(d.tax_rate) > 0 && <><dt>{b.tax_label} {Number(d.tax_rate)}%</dt><dd>{money(d.tax_minor, d.currency)}</dd></>}
            <dt className="total-row">{t('doc.total')}</dt><dd className="total-row">{money(d.total_minor, d.currency)}</dd>
            {kind === 'invoice' && <><dt>{t('doc.paid')}</dt><dd>{money(d.amount_paid_minor ?? 0, d.currency)}</dd><dt className="total-row">{t('doc.balance')}</dt><dd className="total-row">{money(d.balance_minor ?? 0, d.currency)}</dd></>}
          </dl>
        </div>
      </article>
      {toast.node}
    </div>
  );
}
