import { useState } from 'react';
import { allTimeZones, zoneLabel, zonesForCountry } from '../lib/countries';

const OTHER = '__other__';

/** Short list: the zones of the chosen country. "Other time zone" opens a search over every zone. */
export function TimeZoneSelect({ country, value, onChange }: { country: string; value: string; onChange: (z: string) => void }) {
  const local = zonesForCountry(country);
  const [searching, setSearching] = useState(!local.includes(value));
  const [query, setQuery] = useState(local.includes(value) ? '' : value);
  const all = allTimeZones();

  if (searching) {
    const valid = all.includes(query);
    return (
      <div className="tz-search">
        <input list="tz-all" value={query} placeholder="Type a city, e.g. London"
          onChange={(e) => { setQuery(e.target.value); if (all.includes(e.target.value)) onChange(e.target.value); }}
          aria-invalid={query !== '' && !valid} />
        <datalist id="tz-all">{all.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}</datalist>
        <button type="button" className="link" onClick={() => { setSearching(false); onChange(local[0]); }}>Back to the short list</button>
      </div>
    );
  }
  return (
    <select value={local.includes(value) ? value : local[0]} onChange={(e) => {
      if (e.target.value === OTHER) { setSearching(true); setQuery(''); } else onChange(e.target.value);
    }}>
      {local.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
      <option value={OTHER}>Other time zone…</option>
    </select>
  );
}
