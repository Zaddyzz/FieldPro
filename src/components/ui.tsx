import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { t, type MessageKey } from '../lib/i18n';
import type { JobStatus, Priority } from '../lib/types';
import { COUNTRIES } from '../lib/countries';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean; block?: boolean };
export function Button({ variant = 'primary', busy, block, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button className={`btn btn-${variant} ${block ? 'btn-block' : ''} ${className}`} disabled={disabled || busy} {...rest}>
      {busy && <span className="spinner spinner-sm" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ to, children, variant = 'primary' }: { to: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  return <Link to={to} className={`btn btn-${variant}`}>{children}</Link>;
}

export function Field({ label, hint, error, optional, children }: { label: string; hint?: string; error?: string | null; optional?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}{optional && <em> · {t('common.optional')}</em>}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function PhoneInput({ dial, onDial, value, onChange, required }: { dial: string; onDial: (d: string) => void; value: string; onChange: (v: string) => void; required?: boolean }) {
  const dials = Array.from(new Set(COUNTRIES.map((c) => c.dial))).sort((a, b) => +a - +b);
  return (
    <div className="phone-input">
      <select value={dial} onChange={(e) => onDial(e.target.value)} aria-label="Country code">
        {dials.map((d) => <option key={d} value={d}>+{d}</option>)}
      </select>
      <input type="tel" inputMode="tel" autoComplete="tel-national" value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="center-state"><span className="spinner" aria-hidden /><span className="muted">{label ?? t('common.loading')}</span></div>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden />
      <h3>{title}</h3>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>{message}</span>
      {onRetry && <button className="link" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warn' }) {
  return <div className={`alert alert-${tone}`}>{children}</div>;
}

export function StatusBadge({ status, overdue }: { status: JobStatus; overdue?: boolean }) {
  return (
    <span className="badges">
      <span className={`badge st-${status}`}>{t(`status.${status}` as MessageKey)}</span>
      {overdue && <span className="badge st-overdue">{t('status.overdue')}</span>}
    </span>
  );
}

export function RefTag({ value }: { value: string }) {
  return <span className="ref">{value}</span>;
}

export function PriorityTag({ priority }: { priority: Priority }) {
  if (priority === 'normal') return null;
  return <span className={`prio prio-${priority}`}>{t(`priority.${priority}` as MessageKey)}</span>;
}

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <header className="page-head">
      <div>
        {back && <Link to={back} className="back-link">← {t('common.back')}</Link>}
        <h1>{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(id);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return { show: setMsg, node };
}

export const initials = (name: string | null | undefined) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export function Avatar({ name }: { name: string | null | undefined }) {
  return <span className="avatar" aria-hidden>{initials(name)}</span>;
}
