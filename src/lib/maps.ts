/** Google Maps links. A directions link opens turn-by-turn navigation in the Google Maps app on phones. */
export const directionsTo = (place: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;

/** A pin link for coordinates, saved as a job's map link. */
export const pinLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Best link for a job: its saved map link, else directions to the job address, else to the customer's address. */
export function jobMapsHref(j: { map_link?: string | null; address?: string | null; customer?: { address_line1?: string | null; city?: string | null } | null }): string | null {
  if (j.map_link) return j.map_link;
  if (j.address?.trim()) return directionsTo(j.address.trim());
  const c = [j.customer?.address_line1, j.customer?.city].filter(Boolean).join(', ');
  return c ? directionsTo(c) : null;
}
