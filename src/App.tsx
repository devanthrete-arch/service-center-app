import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { StoreProvider, useStore } from './domain/store';
import { getAccessToken, SIGNED_OUT_EVENT } from './lib/session';
import { Bookings } from './screens/Bookings';
import { Dashboard, Jobs } from './screens/Dashboard';
import { JobDetailScreen } from './screens/JobDetail';
import { Login } from './screens/Login';
import { Handover, More } from './screens/More';
import { Shell } from './screens/Shell';
import { WalkIn } from './screens/WalkIn';
import './styles.css';

function Protected() {
  if (!getAccessToken()) return <Navigate to="/login" replace />;
  return (
    <StoreProvider>
      <AuthedShell />
    </StoreProvider>
  );
}

function AuthedShell() {
  useStore();
  return (
    <Shell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetailScreen />} />
        <Route path="new" element={<WalkIn />} />
        <Route path="urgent" element={<WalkIn urgent />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="handover" element={<Handover />} />
        <Route path="more" element={<More />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  const navigate = useNavigate();
  useEffect(() => {
    const onSignedOut = () => navigate('/login', { replace: true });
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  );
}

export function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
