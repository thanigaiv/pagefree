import { Routes, Route, Navigate } from 'react-router-dom';
import { usePWA } from './hooks/usePWA';
import { OfflineIndicator } from './components/OfflineIndicator';
import { MobileLayout } from './components/MobileLayout';
import DashboardPage from './pages/DashboardPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import SchedulePage from './pages/SchedulePage';
import ProfilePage from './pages/ProfilePage';
import IntegrationsPage from './pages/IntegrationsPage';
import AdminPage from './pages/AdminPage';
import TeamsAdminPage from './pages/TeamsAdminPage';
import EscalationPoliciesPage from './pages/EscalationPoliciesPage';
import WorkflowsPage from './pages/WorkflowsPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage';
import { PublicStatusPage } from './pages/PublicStatusPage';
import { StatusPagesPage } from './pages/StatusPagesPage';
import { StatusPageDetailPage } from './pages/StatusPageDetailPage';
import { StatusPageEditPage } from './pages/StatusPageEditPage';
import PostmortemsPage from './pages/PostmortemsPage';
import PostmortemDetailPage from './pages/PostmortemDetailPage';
import EmergencyLoginPage from './pages/EmergencyLoginPage';

export default function App() {
  const { isOnline } = usePWA();

  return (
    <>
      <Routes>
        {/* Public routes (no auth required, outside MobileLayout) */}
        <Route path="/status/:slug" element={<PublicStatusPage />} />
        <Route path="/auth/emergency" element={<EmergencyLoginPage />} />

        {/* Authenticated routes with mobile navigation */}
        <Route
          path="/*"
          element={
            <MobileLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/incidents" replace />} />
                <Route path="/incidents" element={<DashboardPage />} />
                <Route path="/incidents/:id" element={<IncidentDetailPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/profile" element={<ProfilePage />} />

                {/* Admin routes */}
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/teams" element={<TeamsAdminPage />} />
                <Route path="/admin/escalation-policies" element={<EscalationPoliciesPage />} />
                <Route path="/integrations" element={<IntegrationsPage />} />

                {/* Workflow routes */}
                <Route path="/workflows" element={<WorkflowsPage />} />
                <Route path="/workflows/new" element={<WorkflowBuilderPage />} />
                <Route path="/workflows/:id" element={<WorkflowBuilderPage />} />

                {/* Status page admin routes */}
                <Route path="/status-pages" element={<StatusPagesPage />} />
                <Route path="/status-pages/:id/edit" element={<StatusPageEditPage />} />
                <Route path="/status-pages/:id" element={<StatusPageDetailPage />} />

                {/* Postmortem routes */}
                <Route path="/postmortems" element={<PostmortemsPage />} />
                <Route path="/postmortems/:id" element={<PostmortemDetailPage />} />
              </Routes>
            </MobileLayout>
          }
        />
      </Routes>

      {/* Offline indicator (per user decision) */}
      <OfflineIndicator isOnline={isOnline} />
    </>
  );
}
