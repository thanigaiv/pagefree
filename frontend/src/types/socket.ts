// Mirror backend socket types for type safety
export interface ServerToClientEvents {
  'incident:created': (incident: IncidentBroadcast) => void;
  'incident:updated': (incident: IncidentBroadcast) => void;
  'incident:acknowledged': (data: IncidentAckData) => void;
  'incident:resolved': (data: IncidentResolveData) => void;
  'incident:reassigned': (data: IncidentReassignData) => void;
  'incident:note_added': (data: IncidentNoteData) => void;
  'authenticated': () => void;
  'auth_error': (message: string) => void;
  'session_expired': () => void;
}

export interface ClientToServerEvents {
  'subscribe:incidents': (filters: { teamId?: string }) => void;
  'unsubscribe:incidents': () => void;
  'ping': () => void;
}

export interface IncidentBroadcast {
  id: string;
  fingerprint: string;
  status: string;
  priority: string;
  title: string;
  teamId: string;
  team: { id: string; name: string };
  assignedUserId?: string;
  assignedUser?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface IncidentAckData {
  incidentId: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string };
  acknowledgedAt: string;
}

export interface IncidentResolveData {
  incidentId: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string };
  resolvedAt: string;
  resolutionNote?: string;
}

export interface IncidentReassignData {
  incidentId: string;
  fromUserId: string | null;
  toUserId: string;
  toUser: { id: string; firstName: string; lastName: string };
  reason?: string;
}

export interface IncidentNoteData {
  incidentId: string;
  note: {
    id: string;
    content: string;
    userId: string;
    user: { firstName: string; lastName: string };
    createdAt: string;
  };
}
