import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, LocateFixed, Search, X } from 'lucide-react';
import { t } from '../lib/i18n';

import type { PickedPlace } from '../lib/mapcoords';

/**
 * Full-screen map. The person moves the map under a fixed pin in the centre, then taps "Use this spot".
 * Map tiles and address search come from OpenStreetMap (free, no key). The saved link still opens Google Maps.
 */
export default function MapPicker({ start, address, country, onPick, onClose }: {
  start: PickedPlace | null; address: string; country: string | null; onPick: (p: PickedPlace) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [query, setQuery] = useState(address);
  const [busy, setBusy] = useState<'search' | 'gps' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const fallback: PickedPlace = country === 'NG' || !country ? { lat: 6.5244, lng: 3.3792 } : { lat: 20, lng: 0 };
    const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView(start ?? fallback, start ? 17 : country === 'NG' || !country ? 11 : 3);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 50);
    if (!start && address.trim()) void search(address);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(q: string) {
    if (!q.trim()) return;
    setBusy('search'); setNote(null);
    try {
      const params = new URLSearchParams({ format: 'json', limit: '1', q: q.trim() });
      if (country) params.set('countrycodes', country.toLowerCase());
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' } });
      const rows = (await res.json()) as { lat: string; lon: string }[];
      if (rows[0]) map.current?.setView([Number(rows[0].lat), Number(rows[0].lon)], 17);
      else setNote(t('map.notFound'));
    } catch {
      setNote(t('map.searchFailed'));
    } finally { setBusy(null); }
  }

  const locate = () => {
    if (!('geolocation' in navigator)) { setNote(t('jobs.locationFailed')); return; }
    setBusy('gps'); setNote(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(null); map.current?.setView([p.coords.latitude, p.coords.longitude], 18); },
      () => { setBusy(null); setNote(t('jobs.locationFailed')); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const confirm = () => {
    const c = map.current?.getCenter();
    if (c) onPick({ lat: c.lat, lng: c.lng });
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void search(query); };

  // Portal: keeps the search form out of the job form (forms cannot be nested).
  return createPortal(
    <div className="mp" role="dialog" aria-modal="true" aria-label={t('map.title')}>
      <div className="mp-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.cancel')}><X size={20} /></button>
        <form className="mp-search" onSubmit={submit} role="search">
          <label className="sr-only" htmlFor="mp-q">{t('map.searchLabel')}</label>
          <input id="mp-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('map.searchPlaceholder')} enterKeyHint="search" />
          <button type="submit" className="icon-btn" aria-label={t('map.searchLabel')} disabled={busy === 'search'}><Search size={18} /></button>
        </form>
      </div>
      <div className="mp-map" ref={box} />
      <div className="mp-pin" aria-hidden><Crosshair size={18} /></div>
      <div className="mp-bottom">
        <p className="mp-hint">{note ?? t('map.hint')}</p>
        <div className="mp-actions">
          <button type="button" className="btn btn-secondary" onClick={locate} disabled={busy === 'gps'}><LocateFixed size={16} />{t('map.myLocation')}</button>
          <button type="button" className="btn btn-primary" onClick={confirm}>{t('map.useSpot')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
