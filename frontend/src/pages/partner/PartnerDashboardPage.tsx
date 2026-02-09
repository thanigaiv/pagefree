import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface StatusPageSummary {
  id: string;
  name: string;
  slug: string;
}

interface PartnerUser {
  id: string;
  email: string;
  name: string;
  statusPages: StatusPageSummary[];
}

export function PartnerDashboardPage() {
  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/partner/auth/me', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) {
          navigate('/partner/login');
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data) setPartner(data);
        setLoading(false);
      })
      .catch(() => {
        navigate('/partner/login');
      });
  }, [navigate]);

  const handleLogout = async () => {
    await fetch('/api/partner/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    navigate('/partner/login');
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!partner) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Partner Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{partner.email}</span>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Status Pages</h2>

        {partner.statusPages.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No status pages assigned. Contact your administrator for access.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {partner.statusPages.map(page => (
              <Link
                key={page.id}
                to={`/partner/status/${page.id}`}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-medium text-gray-900">{page.name}</h3>
                <p className="text-sm text-gray-500 mt-1">/{page.slug}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
