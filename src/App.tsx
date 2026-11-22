import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './lib/session';
import { configured } from './lib/supabase';
import { t } from './lib/i18n';
import { Layout } from './components/Layout';
import { ErrorBox, Notice, Spinner } from './components/ui';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import { ResetPassword, UpdatePassword } from './pages/auth/Password';
import AcceptInvite from './pages/auth/AcceptInvite';
import { AuthFrame } from './pages/auth/AuthFrame';
import Dashboard from './pages/Dashboard';
import { JobForm, JobList, Schedule } from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import { CustomerDetail, CustomerForm, CustomerList } from './pages/Customers';
import Team from './pages/Team';
import Settings from './pages/Settings';
import MyJobs from './pages/tech/MyJobs';
import Setup from './pages/Setup';
import { EquipmentDetail, EquipmentForm, EquipmentList } from './pages/Equipment';
import { ContractDetail, ContractForm, ContractList } from './pages/Maintenance';
import { DocEditor, DocList, DocView, PaymentList } from './pages/Docs';
import { Portal, PortalDocument } from './pages/portal/Portal';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { ready, session, memberships, signOut } = useSession();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (memberships.length === 0) {
    return (
      <AuthFrame title={t('app.name')}>
        <Notice>{t('auth.noBusiness')}</Notice>
        <button className="btn btn-secondary btn-block" onClick={() => signOut()}>{t('nav.signOut')}</button>
      </AuthFrame>
    );
  }
  return children;
}

function ManagerOnly({ children, adminOnly }: { children: JSX.Element; adminOnly?: boolean }) {
  const { isManager, isAdmin } = useSession();
  if (adminOnly ? !isAdmin : !isManager) return <ErrorBox message={t('error.forbidden')} />;
  return children;
}

function Home() {
  const { isManager, isAdmin, settings, role } = useSession();
  if (role === 'customer') return <Portal />;
  if (isAdmin && settings && !settings.setup_completed_at) return <Navigate to="/setup" replace />;
  return isManager ? <Dashboard /> : <MyJobs />;
}

function PublicOnly({ children }: { children: JSX.Element }) {
  const { ready, session } = useSession();
  if (!ready) return <Spinner />;
  return session ? <Navigate to="/" replace /> : children;
}

export default function App() {
  if (!configured) return <div className="page"><ErrorBox message={t('error.notConfigured')} /></div>;
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/update-password" element={<UpdatePassword />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="jobs" element={<ManagerOnly><JobList /></ManagerOnly>} />
        <Route path="jobs/new" element={<ManagerOnly><JobForm /></ManagerOnly>} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="jobs/:id/edit" element={<ManagerOnly><JobForm /></ManagerOnly>} />
        <Route path="schedule" element={<ManagerOnly><Schedule /></ManagerOnly>} />
        <Route path="customers" element={<ManagerOnly><CustomerList /></ManagerOnly>} />
        <Route path="customers/new" element={<ManagerOnly><CustomerForm /></ManagerOnly>} />
        <Route path="customers/:id" element={<ManagerOnly><CustomerDetail /></ManagerOnly>} />
        <Route path="customers/:id/edit" element={<ManagerOnly><CustomerForm /></ManagerOnly>} />
        <Route path="team" element={<ManagerOnly adminOnly><Team /></ManagerOnly>} />
        <Route path="settings" element={<Settings />} />
        <Route path="setup" element={<ManagerOnly adminOnly><Setup /></ManagerOnly>} />
        <Route path="equipment" element={<ManagerOnly><EquipmentList /></ManagerOnly>} />
        <Route path="equipment/new" element={<ManagerOnly><EquipmentForm /></ManagerOnly>} />
        <Route path="equipment/:id" element={<ManagerOnly><EquipmentDetail /></ManagerOnly>} />
        <Route path="equipment/:id/edit" element={<ManagerOnly><EquipmentForm /></ManagerOnly>} />
        <Route path="maintenance" element={<ManagerOnly><ContractList /></ManagerOnly>} />
        <Route path="maintenance/new" element={<ManagerOnly><ContractForm /></ManagerOnly>} />
        <Route path="maintenance/:id" element={<ManagerOnly><ContractDetail /></ManagerOnly>} />
        <Route path="maintenance/:id/edit" element={<ManagerOnly><ContractForm /></ManagerOnly>} />
        <Route path="quotes" element={<ManagerOnly><DocList kind="quote" key="ql" /></ManagerOnly>} />
        <Route path="quotes/new" element={<ManagerOnly><DocEditor kind="quote" key="qn" /></ManagerOnly>} />
        <Route path="quotes/:id" element={<ManagerOnly><DocView kind="quote" key="qv" /></ManagerOnly>} />
        <Route path="quotes/:id/edit" element={<ManagerOnly><DocEditor kind="quote" key="qe" /></ManagerOnly>} />
        <Route path="invoices" element={<ManagerOnly><DocList kind="invoice" key="il" /></ManagerOnly>} />
        <Route path="invoices/new" element={<ManagerOnly><DocEditor kind="invoice" key="in" /></ManagerOnly>} />
        <Route path="invoices/:id" element={<ManagerOnly><DocView kind="invoice" key="iv" /></ManagerOnly>} />
        <Route path="invoices/:id/edit" element={<ManagerOnly><DocEditor kind="invoice" key="ie" /></ManagerOnly>} />
        <Route path="payments" element={<ManagerOnly><PaymentList /></ManagerOnly>} />
        <Route path="portal/quote/:id" element={<PortalDocument kind="quote" key="pq" />} />
        <Route path="portal/invoice/:id" element={<PortalDocument kind="invoice" key="pi" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
