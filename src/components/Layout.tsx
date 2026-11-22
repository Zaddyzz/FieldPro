import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Banknote, Briefcase, ShieldCheck, CalendarDays, ChevronDown, Cpu, FileText, Home, LayoutGrid, LogOut, Menu, Moon, Receipt, RefreshCcw, Settings, Sun, Users, UserSquare2, Wrench, X } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { LogoFull, LogoMark } from './Logo';
import { useBusiness } from '../lib/session';
import { t, type MessageKey } from '../lib/i18n';
import { Avatar } from './ui';
import { NotificationBell } from './Notifications';
import { PlanBanner } from './Plan';

interface NavItem { to: string; label: MessageKey; icon: typeof LayoutGrid; end?: boolean }

export function Layout() {
  const { business, role, memberships, switchBusiness, signOut, profile, isManager, isAdmin, isPlatformAdmin } = useBusiness();
  const isCustomer = role === 'customer';
  const [moreOpen, setMoreOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const ThemeIcon = theme.resolved() === 'dark' ? Sun : Moon;

  const items: NavItem[] = isManager
    ? [
        { to: '/', label: 'nav.overview', icon: LayoutGrid, end: true },
        { to: '/jobs', label: 'nav.jobs', icon: Briefcase },
        { to: '/invoices', label: 'nav.invoices', icon: Receipt },
        { to: '/customers', label: 'nav.customers', icon: UserSquare2 },
        { to: '/schedule', label: 'nav.schedule', icon: CalendarDays },
        { to: '/quotes', label: 'nav.quotes', icon: FileText },
        { to: '/payments', label: 'nav.payments', icon: Banknote },
        { to: '/reports', label: 'nav.reports', icon: BarChart3 },
        { to: '/equipment', label: 'nav.equipment', icon: Cpu },
        { to: '/maintenance', label: 'nav.maintenance', icon: RefreshCcw },
        ...(isAdmin ? [{ to: '/team', label: 'nav.team' as MessageKey, icon: Users }] : []),
        { to: '/settings', label: 'nav.settings', icon: Settings },
      ]
    : isCustomer ? [
        { to: '/', label: 'nav.portal', icon: Home, end: true },
        { to: '/settings', label: 'nav.settings', icon: Settings },
      ]
    : [
        { to: '/', label: 'nav.myJobs', icon: Wrench, end: true },
        { to: '/settings', label: 'nav.settings', icon: Settings },
      ];

  if (isPlatformAdmin) items.push({ to: '/admin', label: 'nav.admin', icon: ShieldCheck });
  const primary = items.slice(0, 4);
  const overflow = items.slice(4);

  const doSignOut = async () => { await signOut(); navigate('/login'); };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-logo"><LogoFull width={isCustomer ? 196 : 168} />{!isCustomer && <NotificationBell businessId={business.id} tone="chrome" />}</div>
        <div className="biz-block">
          <button className="biz-switch" onClick={() => memberships.length > 1 && setSwitcher((v) => !v)} aria-expanded={switcher}>
            <span className="biz-name">{business.name}</span>
            <span className="biz-role">{t(`role.${role}` as MessageKey)}</span>
            {memberships.length > 1 && <ChevronDown size={16} />}
          </button>
          {switcher && (
            <ul className="biz-menu">
              {memberships.map((m) => (
                <li key={m.id}><button onClick={() => { switchBusiness(m.business_id); setSwitcher(false); navigate('/'); }}>
                  {m.business.name}<small>{t(`role.${m.role}` as MessageKey)}</small></button></li>
              ))}
            </ul>
          )}
        </div>
        <nav className="side-nav">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <i.icon size={18} strokeWidth={1.8} />{t(i.label)}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <Avatar name={profile?.full_name} />
          <div className="side-user"><strong>{profile?.full_name || profile?.email}</strong><small>{profile?.email}</small></div>
          <button className="icon-btn" onClick={theme.toggle} aria-label={t('theme.toggle')} title={t('theme.toggle')}><ThemeIcon size={18} /></button>
          <button className="icon-btn" onClick={doSignOut} aria-label={t('nav.signOut')} title={t('nav.signOut')}><LogOut size={18} /></button>
        </div>
      </aside>

      <div className="topbar">
        <LogoMark size={26} />
        <button className="topbar-biz" onClick={() => memberships.length > 1 && setSwitcher((v) => !v)}>
          {business.name}{memberships.length > 1 && <ChevronDown size={14} />}
        </button>
        {!isCustomer && <NotificationBell businessId={business.id} />}
        <button className="icon-btn" onClick={theme.toggle} aria-label={t('theme.toggle')}><ThemeIcon size={18} /></button>
        {switcher && (
          <ul className="biz-menu biz-menu-mobile">
            {memberships.map((m) => (
              <li key={m.id}><button onClick={() => { switchBusiness(m.business_id); setSwitcher(false); navigate('/'); }}>
                {m.business.name}<small>{t(`role.${m.role}` as MessageKey)}</small></button></li>
            ))}
          </ul>
        )}
      </div>

      <main className="main"><PlanBanner /><Outlet /></main>

      <nav className="bottom-nav">
        {primary.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMoreOpen(false)}>
            <i.icon size={20} strokeWidth={1.8} /><span>{t(i.label)}</span>
          </NavLink>
        ))}
        <button className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen((v) => !v)}>
          {moreOpen ? <X size={20} /> : <Menu size={20} />}<span>{t('nav.more')}</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="more-sheet" onClick={() => setMoreOpen(false)}>
          <div className="more-panel" onClick={(e) => e.stopPropagation()}>
            {overflow.map((i) => (
              <NavLink key={i.to} to={i.to} onClick={() => setMoreOpen(false)}><i.icon size={18} />{t(i.label)}</NavLink>
            ))}
            <button onClick={doSignOut}><LogOut size={18} />{t('nav.signOut')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
