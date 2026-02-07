import { Routes, Route, Navigate } from 'react-router-dom';
import { usePWA } from './hooks/usePWA';
import { OfflineIndicator } from './components/OfflineIndicator';
import { MobileLayout } from './components/MobileLayout';
import DashboardPage from './pages/DashboardPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import SchedulePage from './pages/SchedulePage';
import ProfilePage from './pages/ProfilePage';
import IntegrationsPage from './pages/IntegrationsPage';
import WorkflowsPage from './pages/WorkflowsPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage';

export default function App() {
  const { isOnline } = usePWA();

  return (
    <>
      <MobileLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/incidents" replace />} />
          <Route path="/incidents" element={<DashboardPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />

          {/* Workflow routes */}
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/new" element={<WorkflowBuilderPage />} />
          <Route path="/workflows/:id" element={<WorkflowBuilderPage />} />
        </Routes>
      </MobileLayout>

      {/* Offline indicator (per user decision) */}
      <OfflineIndicator isOnline={isOnline} />
    </>
  );
}
