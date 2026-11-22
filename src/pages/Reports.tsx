import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useBusiness } from '../lib/session';
import { supabase } from '../lib/supabase';
import { must, useAsync } from '../lib/data';
import { digits, money } from '../lib/money';
import { todayIn } from '../lib/types';
import { t, type MessageKey } from '../lib/i18n';
import { Button, ErrorBox, Field, PageHeader, Spinner } from '../components/ui';

interface Report {
  jobs_created: number; jobs_completed: number; jobs_cancelled: number; avg_hours_to_complete: number | null; portal_requests: number;
  jobs_by_status: Record<string, number>; jobs_by_category: Record<string, number>;
  technicians: { user_id: string; name: string; completed: number; avg_hours: number | null; open: number }[];
  invoiced_minor: number; invoice_count: number; collected_minor: number;
  collected_by_month: { month: string; amount_minor: number }[];
  outstanding_minor: number;
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number };
  top_customers: { customer_id: string; name: string; billed_minor: number; invoices: number }[];
}

type Preset = 'thisMonth' | 'lastMonth' | 'last90' | 'thisYear' | 'custom';
const STATUS_ORDER = ['new', 'scheduled', 'assigned', 'in_progress', 'awaiting_parts', 'completed', 'cancelled'];
const AGING: (keyof Report['aging'])[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];

function shift(d: string, days: number) { return new Date(new Date(d + 'T00:00:00Z').getTime() + days * 86_400_000).toISOString().slice(0, 10); }
function rangeFor(p: Preset, today: string): [string, string] {
  const [y, m] = today.split('-').map(Number);
  if (p === 'lastMonth') {
    const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    return [first, last];
  }
  if (p === 'last90') return [shift(today, -89), today];
  if (p === 'thisYear') return [`${y}-01-01`, today];
  return [today.slice(0, 8) + '01', today];
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function csvCell(v: string | number | null) {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Reports() {
  const { business } = useBusiness();
  const today = todayIn(business.time_zone);
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [custom, setCustom] = useState<[string, string]>(rangeFor('thisMonth', today));
  const [from, to] = preset === 'custom' ? custom : rangeFor(preset, today);
  const cur = business.currency;

  const { data, error, loading, reload } = useAsync(async () =>
    must(await supabase.rpc('report_summary', { p_business: business.id, p_from: from, p_to: to })) as Report,
  [business.id, from, to]);

  const maxMonth = useMemo(() => Math.max(1, ...(data?.collected_by_month ?? []).map((m) => m.amount_minor)), [data]);
  const maxAging = useMemo(() => Math.max(1, ...AGING.map((k) => data?.aging[k] ?? 0)), [data]);

  const exportCsv = () => {
    if (!data) return;
    const dg = digits(cur);
    const amt = (n: number) => (n / 10 ** dg).toFixed(dg);
    const rows: (string | number | null)[][] = [
      [business.name, `${from} to ${to}`, cur], [],
      ['Measure', 'Value'],
      [t('rep.jobsCreated'), data.jobs_created], [t('rep.jobsCompleted'), data.jobs_completed],
      [t('rep.avgHours'), data.avg_hours_to_complete], [t('rep.portalRequests'), data.portal_requests],
      [t('rep.invoiced'), amt(data.invoiced_minor)], [t('rep.collected'), amt(data.collected_minor)], [t('rep.outstanding'), amt(data.outstanding_minor)],
      [], [t('rep.tech'), t('rep.completed'), t('rep.avg') + ' (h)', t('rep.open')],
      ...data.technicians.map((x) => [x.name, x.completed, x.avg_hours, x.open]),
      [], ['Month', t('rep.collected')], ...data.collected_by_month.map((m) => [m.month, amt(m.amount_minor)]),
      [], [t('rep.aging')], ...AGING.map((k) => [t(`rep.aging.${k}` as MessageKey), amt(data.aging[k])]),
      [], ['Customer', t('rep.invoiced'), t('rep.invoices')], ...data.top_customers.map((c) => [c.name, amt(c.billed_minor), c.invoices]),
    ];
    const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `covaro-report-${from}-to-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const presets: Preset[] = ['thisMonth', 'lastMonth', 'last90', 'thisYear'];
  const statusTotal = data ? Object.values(data.jobs_by_status).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="page">
      <PageHeader title={t('rep.title')} actions={<Button variant="secondary" onClick={exportCsv} disabled={!data}><Download size={16} />{t('rep.export')}</Button>} />

      <div className="rep-controls">
        <div className="segmented" role="radiogroup" aria-label={t('rep.range')}>
          {presets.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={preset === p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>
              {t(`rep.${p}` as MessageKey)}
            </button>
          ))}
        </div>
        <div className="rep-dates">
          <Field label={t('rep.from')}><input type="date" value={from} max={to} onChange={(e) => { setPreset('custom'); setCustom([e.target.value, to]); }} /></Field>
          <Field label={t('rep.to')}><input type="date" value={to} min={from} onChange={(e) => { setPreset('custom'); setCustom([from, e.target.value]); }} /></Field>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className={loading ? 'is-reloading' : ''}>
          <section className="rep-money">
            <div><span>{t('rep.collected')}</span><strong>{money(data.collected_minor, cur)}</strong></div>
            <div><span>{t('rep.invoiced')}</span><strong>{money(data.invoiced_minor, cur)}</strong><small>{data.invoice_count} {t('rep.invoices').toLowerCase()}</small></div>
            <div><span>{t('rep.outstanding')}</span><strong>{money(data.outstanding_minor, cur)}</strong></div>
          </section>

          <section className="figures">
            <Fig label={t('rep.jobsCreated')} text={data.jobs_created.toLocaleString()} />
            <Fig label={t('rep.jobsCompleted')} text={data.jobs_completed.toLocaleString()} />
            <Fig label={t('rep.avgHours')} text={data.avg_hours_to_complete === null ? '—' : t('rep.hours', { n: data.avg_hours_to_complete })} />
            <Fig label={t('rep.portalRequests')} text={data.portal_requests.toLocaleString()} />
          </section>

          <div className="two-col">
            <section className="panel">
              <h2 className="panel-title">{t('rep.collectedByMonth')}</h2>
              {data.collected_minor === 0 ? <p className="muted pad">{t('rep.nothing')}</p> : (
                <ul className="hbars">
                  {data.collected_by_month.map((m) => (
                    <li key={m.month}>
                      <span className="hbar-label">{monthLabel(m.month)}</span>
                      <span className="hbar-track"><span style={{ width: `${(m.amount_minor / maxMonth) * 100}%` }} /></span>
                      <span className="hbar-value">{money(m.amount_minor, cur)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2 className="panel-title">{t('rep.aging')}</h2>
              {data.outstanding_minor === 0 ? <p className="muted pad">{t('rep.nothing')}</p> : (
                <ul className="hbars">
                  {AGING.map((k, i) => (
                    <li key={k} className={i >= 2 && data.aging[k] > 0 ? 'late' : ''}>
                      <span className="hbar-label">{t(`rep.aging.${k}` as MessageKey)}</span>
                      <span className="hbar-track"><span style={{ width: `${(data.aging[k] / maxAging) * 100}%` }} /></span>
                      <span className="hbar-value">{money(data.aging[k], cur)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="panel rep-gap">
            <h2 className="panel-title">{t('rep.technicians')}</h2>
            {data.technicians.length === 0 ? <p className="muted pad">{t('rep.noTechs')}</p> : (
              <div className="table-scroll">
                <table className="table rep-tech">
                  <thead><tr><th>{t('rep.tech')}</th><th className="num">{t('rep.completed')}</th><th className="num">{t('rep.avg')}</th><th className="num">{t('rep.open')}</th></tr></thead>
                  <tbody>
                    {data.technicians.map((x) => (
                      <tr key={x.user_id}>
                        <td>{x.name}</td><td className="num" data-label={t('rep.completed')}>{x.completed}</td>
                        <td className="num" data-label={t('rep.avg')}>{x.avg_hours === null ? '—' : t('rep.hours', { n: x.avg_hours })}</td>
                        <td className="num" data-label={t('rep.open')}>{x.open}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="two-col rep-gap">
            <section className="panel">
              <h2 className="panel-title">{t('rep.byStatus')}</h2>
              {statusTotal === 0 ? <p className="muted pad">{t('rep.nothing')}</p> : (
                <ul className="rows">
                  {STATUS_ORDER.filter((s) => data.jobs_by_status[s]).map((s) => (
                    <li key={s} className="row-plain"><span className="lane-name"><i className={`fill-${s}`} />{t(`status.${s}` as MessageKey)}</span><strong>{data.jobs_by_status[s]}</strong></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2 className="panel-title">{t('rep.topCustomers')}</h2>
              {data.top_customers.length === 0 ? <p className="muted pad">{t('rep.nothing')}</p> : (
                <ul className="rows">
                  {data.top_customers.map((c) => (
                    <li key={c.customer_id} className="row-plain">
                      <Link to={`/customers/${c.customer_id}`}>{c.name}</Link>
                      <strong>{money(c.billed_minor, cur)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Fig({ label, text }: { label: string; text: string }) {
  return <div className="metric"><span className="metric-value">{text}</span><span className="metric-label">{label}</span></div>;
}
