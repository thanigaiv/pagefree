import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Partner {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  statusPageAccess: Array<{
    statusPage: {
      id: string;
      name: string;
    };
  }>;
}

interface StatusPage {
  id: string;
  name: string;
}

export function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [statusPages, setStatusPages] = useState<StatusPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState<Partner | null>(null);
  const [newPartner, setNewPartner] = useState({ email: '', name: '' });
  const [selectedStatusPage, setSelectedStatusPage] = useState('');
  const navigate = useNavigate();

  const fetchPartners = async () => {
    try {
      const res = await fetch('/api/admin/partners', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        navigate('/login');
        return;
      }
      const data = await res.json();
      setPartners(data.partners || []);
    } catch {
      setError('Failed to load partners');
    }
  };

  const fetchStatusPages = async () => {
    try {
      const res = await fetch('/api/status-pages', { credentials: 'include' });
      const data = await res.json();
      setStatusPages(data.statusPages || []);
    } catch {
      // Non-critical, continue
    }
  };

  useEffect(() => {
    Promise.all([fetchPartners(), fetchStatusPages()]).then(() => setLoading(false));
  }, []);

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newPartner)
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewPartner({ email: '', name: '' });
        fetchPartners();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create partner');
      }
    } catch {
      setError('Network error');
    }
  };

  const handleDeactivate = async (partnerId: string) => {
    if (!confirm('Are you sure you want to deactivate this partner?')) return;

    try {
      const res = await fetch(`/api/admin/partners/${partnerId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchPartners();
      } else {
        setError('Failed to deactivate partner');
      }
    } catch {
      setError('Network error');
    }
  };

  const handleGrantAccess = async (partnerId: string) => {
    if (!selectedStatusPage) return;

    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ statusPageId: selectedStatusPage })
      });

      if (res.ok) {
        setShowAccessModal(null);
        setSelectedStatusPage('');
        fetchPartners();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to grant access');
      }
    } catch {
      setError('Network error');
    }
  };

  const handleRevokeAccess = async (partnerId: string, statusPageId: string) => {
    if (!confirm('Are you sure you want to revoke this access?')) return;

    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/access/${statusPageId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchPartners();
      } else {
        setError('Failed to revoke access');
      }
    } catch {
      setError('Network error');
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Partner Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Partner
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      {/* Partners Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Partner</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Access</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {partners.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No partners yet. Create one to get started.
                </td>
              </tr>
            ) : (
              partners.map(partner => (
                <tr key={partner.id}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{partner.name}</div>
                    <div className="text-sm text-gray-500">{partner.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      partner.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {partner.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {partner.statusPageAccess.length === 0 ? (
                        <span className="text-sm text-gray-400">No access</span>
                      ) : (
                        partner.statusPageAccess.map(access => (
                          <span
                            key={access.statusPage.id}
                            className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                          >
                            {access.statusPage.name}
                            <button
                              onClick={() => handleRevokeAccess(partner.id, access.statusPage.id)}
                              className="ml-1 text-gray-400 hover:text-red-500"
                              title="Revoke access"
                            >
                              &times;
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => setShowAccessModal(partner)}
                      className="text-blue-600 hover:text-blue-800 mr-3"
                    >
                      Grant Access
                    </button>
                    {partner.isActive && (
                      <button
                        onClick={() => handleDeactivate(partner.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Partner Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Create Partner</h2>
            <form onSubmit={handleCreatePartner}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newPartner.name}
                  onChange={e => setNewPartner({ ...newPartner, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newPartner.email}
                  onChange={e => setNewPartner({ ...newPartner, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grant Access Modal */}
      {showAccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Grant Access to {showAccessModal.name}</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Status Page</label>
              <select
                value={selectedStatusPage}
                onChange={e => setSelectedStatusPage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select a status page</option>
                {statusPages
                  .filter(sp => !showAccessModal.statusPageAccess.some(a => a.statusPage.id === sp.id))
                  .map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAccessModal(null);
                  setSelectedStatusPage('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleGrantAccess(showAccessModal.id)}
                disabled={!selectedStatusPage}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                Grant Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
