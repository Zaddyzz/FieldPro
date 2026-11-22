import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { relativeFromNow } from '../lib/format';
import { t } from '../lib/i18n';

interface Note { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; business_id: string }

const POLL_MS = 60_000;

/** Bell with unread count. Polls quietly; refreshes when the tab regains focus. */
export function NotificationBell({ businessId, tone }: { businessId: string; tone?: 'chrome' }) {
  const [items, setItems] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications')
      .select('id, kind, title, body, link, read_at, created_at, business_id')
      .eq('business_id', businessId).order('created_at', { ascending: false }).limit(30);
    if (data) setItems(data as Note[]);
  }, [businessId]);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (ids: string[] | null) => {
    const now = new Date().toISOString();
    setItems((xs) => xs.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    await supabase.rpc('mark_notifications_read', { p_ids: ids });
  };

  const openItem = (n: Note) => {
    if (!n.read_at) markRead([n.id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className={`notif ${tone === 'chrome' ? 'notif-chrome' : ''}`} ref={ref}>
      <button className="icon-btn notif-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        aria-label={unread ? `${t('notif.open')} (${unread})` : t('notif.open')} title={t('notif.title')}>
        <Bell size={18} />
        {unread > 0 && <span className="notif-count" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label={t('notif.title')}>
          <div className="notif-head">
            <strong>{t('notif.title')}</strong>
            {unread > 0 && <button className="link" onClick={() => markRead(null)}>{t('notif.markAll')}</button>}
          </div>
          {items.length === 0 ? <p className="muted pad">{t('notif.empty')}</p> : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button className={n.read_at ? '' : 'unread'} onClick={() => openItem(n)}>
                    <span className="notif-title">{n.title}</span>
                    {n.body && <span className="notif-body">{n.body}</span>}
                    <time className="notif-time" dateTime={n.created_at}>{relativeFromNow(n.created_at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
