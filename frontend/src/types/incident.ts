export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
export type IncidentPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface Incident {
  id: string;
  fingerprint: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  title: string;
  description?: string;
  metadata?: Record<string, unknown> | null;
  teamId: string;
  team: { id: string; name: string };
  assignedUserId?: string;
  assignedUser?: { id: string; firstName: string; lastName: string; email: string };
  escalationPolicyId?: string;
  currentLevel: number;
  currentRepeat: number;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  _count?: { alerts: number };
  alerts?: Array<{
    id: string;
    title: string;
    severity: string;
    triggeredAt: string;
    externalId?: string;
  }>;
  // Service-based routing (Phase 13)
  serviceId?: string;
  service?: {
    id: string;
    name: string;
    routingKey: string;
    team: { id: string; name: string };
  };
}

export interface TimelineEvent {
  id: string;
  action: string;
  timestamp: string;
  userId?: string;
  user?: { id: string; firstName: string; lastName: string };
  metadata?: Record<string, unknown>;
}

export interface IncidentListResponse {
  incidents: Incident[];
  nextCursor: string | null;
}
