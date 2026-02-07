import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import IncidentDetailPage from './pages/IncidentDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/incidents" replace />} />
      <Route path="/incidents" element={<DashboardPage />} />
      <Route path="/incidents/:id" element={<IncidentDetailPage />} />
    </Routes>
  );
}
