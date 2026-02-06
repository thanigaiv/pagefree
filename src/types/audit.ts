export type AuditSeverity = 'INFO' | 'WARN' | 'HIGH';

export interface AuditLogParams {
  action: string;           // e.g., "user.login", "team.settings.updated"
  userId?: string;          // Actor performing the action
  teamId?: string;          // Team context if applicable
  resourceType?: string;    // e.g., "user", "team", "incident"
  resourceId?: string;      // ID of affected resource
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQueryParams {
  userId?: string;
  teamId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
