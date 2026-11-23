export interface PickedPlace { lat: number; lng: number }

/** Coordinates inside a saved map link (…query=6.52,3.37 or …@6.52,3.37), if any. */
export function coordsFromLink(link: string | null | undefined): PickedPlace | null {
  const m = link?.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

