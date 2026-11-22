import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Business, Membership, Role } from './types';

interface Settings { job_prefix: string; whatsapp_enabled: boolean; tax_inclusive: boolean; setup_completed_at: string | null; default_tax_rate: number }
interface Subscription { plan: string; status: string; trial_ends_at: string | null }
export interface Usage {
  plan: string; plan_name: string; status: string; trial_ends_at: string | null; current_period_end: string | null;
  writable: boolean; blocked_reason: 'trial_ended' | 'suspended' | 'cancelled' | null;
  max_staff: number | null; max_jobs_month: number | null; max_customers: number | null;
  staff: number; customers: number; jobs_this_month: number;
  support: { email: string | null; whatsapp: string | null; note: string | null };
  plans: { code: string; name: string; max_staff: number | null; max_jobs_month: number | null; max_customers: number | null; prices: Record<string, number> }[];
}
interface Profile { id: string; full_name: string; phone: string | null; email: string | null }

interface Ctx {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  current: Membership | null;
  business: Business | null;
  role: Role | null;
  settings: Settings | null;
  subscription: Subscription | null;
  usage: Usage | null;
  isPlatformAdmin: boolean;
  refreshUsage: () => Promise<void>;
  isManager: boolean;
  isAdmin: boolean;
  switchBusiness: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);
const STORE_KEY = 'fieldpro.business';

function readStore(): string | null { try { return localStorage.getItem(STORE_KEY); } catch { return null; } }
function writeStore(v: string) { try { localStorage.setItem(STORE_KEY, v); } catch { /* storage unavailable */ } }

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(readStore());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [isPlatformAdmin, setPlatformAdmin] = useState(false);

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setMemberships([]); setPlatformAdmin(false); setReady(true); return; }
    const [p, m, pa] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, email').eq('id', s.user.id).maybeSingle(),
      supabase.from('business_members').select('id, business_id, role, status, business:businesses(*)')
        .eq('user_id', s.user.id).eq('status', 'active'),
      supabase.rpc('is_platform_admin'),
    ]);
    setPlatformAdmin(pa.data === true);
    setProfile((p.data as Profile) ?? null);
    const list = ((m.data ?? []) as unknown as Membership[]).filter((x) => x.business);
    setMemberships(list);
    setReady(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') { setReady(false); load(s); }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const current = useMemo(
    () => memberships.find((m) => m.business_id === currentId) ?? memberships[0] ?? null,
    [memberships, currentId],
  );

  const loadUsage = useCallback(async () => {
    if (!current || current.role === 'customer') { setUsage(null); return; }
    const { data } = await supabase.rpc('business_usage', { p_business: current.business_id });
    setUsage((data as Usage) ?? null);
  }, [current]);
  useEffect(() => { loadUsage(); }, [loadUsage]);

  useEffect(() => {
    if (!current) { setSettings(null); setSubscription(null); return; }
    let live = true;
    Promise.all([
      supabase.from('business_settings').select('job_prefix, whatsapp_enabled, tax_inclusive, setup_completed_at, default_tax_rate').eq('business_id', current.business_id).maybeSingle(),
      supabase.from('business_subscriptions').select('plan, status, trial_ends_at').eq('business_id', current.business_id).maybeSingle(),
    ]).then(([st, sub]) => {
      if (!live) return;
      setSettings((st.data as Settings) ?? null);
      setSubscription((sub.data as Subscription) ?? null);
    });
    return () => { live = false; };
  }, [current]);

  const value: Ctx = {
    ready, session, profile, memberships, current,
    business: current?.business ?? null,
    role: current?.role ?? null,
    settings, subscription, usage, isPlatformAdmin, refreshUsage: loadUsage,
    isManager: !!current && ['owner', 'admin', 'dispatcher'].includes(current.role),
    isAdmin: !!current && ['owner', 'admin'].includes(current.role),
    switchBusiness: (id) => { writeStore(id); setCurrentId(id); },
    refresh: () => load(session),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside provider');
  return ctx;
}

/** Business that is guaranteed to exist inside the authenticated app shell. */
export function useBusiness() {
  const s = useSession();
  if (!s.business || !s.current) throw new Error('No business selected');
  return { ...s, business: s.business, current: s.current };
}
