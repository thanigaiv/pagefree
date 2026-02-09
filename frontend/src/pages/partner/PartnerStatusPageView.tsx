import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

interface Component {
  id: string;
  name: string;
  description: string | null;
  status: string;
  displayOrder: number;
}

interface StatusPageData {
  id: string;
  name: string;
  description: string | null;
  overallStatus: string;
  components: Component[];
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: 'bg-green-500',
  DEGRADED: 'bg-yellow-500',
  PARTIAL_OUTAGE: 'bg-orange-500',
  MAJOR_OUTAGE: 'bg-red-500',
  UNDER_MAINTENANCE: 'bg-blue-500'
};

const STATUS_LABELS: Record<string, string> = {
  OPERATIONAL: 'Operational',
  DEGRADED: 'Degraded Performance',
  PARTIAL_OUTAGE: 'Partial Outage',
  MAJOR_OUTAGE: 'Major Outage',
  UNDER_MAINTENANCE: 'Under Maintenance'
};

export function PartnerStatusPageView() {
  const { statusPageId } = useParams<{ statusPageId: string }>();
  const [statusPage, setStatusPage] = useState<StatusPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`/api/partner/status-pages/${statusPageId}`, { credentials: 'include' })
      .then(res => {
        if (res.status === 401) {
          navigate('/partner/login');
          return null;
        }
        if (res.status === 403) {
          setError('You do not have access to this status page.');
          setLoading(false);
          return null;
        }
        if (!res.ok) throw new Error('Failed to load status page');
        return res.json();
      })
      .then(data => {
        if (data) {
          setStatusPage(data);
          setLoading(false);
        }
      })
      .catch(() => {
        setError('Failed to load status page');
        setLoading(false);
      });
  }, [statusPageId, navigate]);

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
          <Link to="/partner/dashboard" className="text-blue-600 hover:underline mt-4 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!statusPage) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link to="/partner/dashboard" className="text-blue-600 hover:underline text-sm">
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{statusPage.name}</h1>
          {statusPage.description && (
            <p className="text-gray-600 mt-1">{statusPage.description}</p>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Overall Status Banner */}
        <div className={`${STATUS_COLORS[statusPage.overallStatus] || 'bg-gray-500'} rounded-lg p-4 text-white mb-8`}>
          <p className="text-lg font-semibold">
            {STATUS_LABELS[statusPage.overallStatus] || statusPage.overallStatus}
          </p>
          <p className="text-sm opacity-90">
            Last updated: {new Date(statusPage.updatedAt).toLocaleString()}
          </p>
        </div>

        {/* Components */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Components</h2>
        <div className="bg-white rounded-lg shadow divide-y">
          {statusPage.components
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map(component => (
              <div key={component.id} className="p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-medium text-gray-900">{component.name}</h3>
                  {component.description && (
                    <p className="text-sm text-gray-500">{component.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${STATUS_COLORS[component.status] || 'bg-gray-500'}`} />
                  <span className="text-sm text-gray-600">
                    {STATUS_LABELS[component.status] || component.status}
                  </span>
                </div>
              </div>
            ))}
        </div>

        {/* Note: No subscribe button - partners cannot subscribe per PARTNER-03 */}
      </main>
    </div>
  );
}
