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
  const { isManager } = useSession();
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
