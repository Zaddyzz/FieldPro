import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Member } from './types';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await run()); } catch (e) { setError((e as Error).message || 'Something went wrong'); }
    finally { setLoading(false); }
  }, [run]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Throws on Supabase errors so useAsync can show them. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function loadMembers(businessId: string): Promise<Member[]> {
  const rows = must(await supabase.from('business_members')
    .select('id, user_id, role, status, created_at').eq('business_id', businessId).order('created_at')) as Omit<Member, 'profile'>[];
  const ids = rows.map((r) => r.user_id);
  const profiles = ids.length
    ? (must(await supabase.from('profiles').select('id, full_name, phone, email').in('id', ids)) as { id: string; full_name: string; phone: string | null; email: string | null }[])
    : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));
}

export const memberName = (m: Member | undefined) => m?.profile?.full_name || m?.profile?.email || '—';
