import { Routes, Route, Navigate } from 'react-router-dom';
import { usePWA } from './hooks/usePWA';
import { MobileLayout } from './components/MobileLayout';
import DashboardPage from './pages/DashboardPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import SchedulePage from './pages/SchedulePage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  // Initialize PWA hooks (offline detection, install prompt)
  usePWA();

  return (
    <MobileLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/incidents" replace />} />
        <Route path="/incidents" element={<DashboardPage />} />
        <Route path="/incidents/:id" element={<IncidentDetailPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </MobileLayout>
  );
}
