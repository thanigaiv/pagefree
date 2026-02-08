// Status Page TypeScript Types (Phase 9)

// ============================================================================
// COMPONENT STATUS TYPES
// ============================================================================

/**
 * Component status hierarchy ordered by severity (worst first).
 * Used to compute overall status when multiple incidents affect a component.
 */
export const STATUS_SEVERITY_ORDER = [
  'MAJOR_OUTAGE',
  'PARTIAL_OUTAGE',
  'DEGRADED_PERFORMANCE',
  'UNDER_MAINTENANCE',
  'OPERATIONAL'
] as const;

export type ComponentStatus = (typeof STATUS_SEVERITY_ORDER)[number];

/**
 * Map incident priority to component status.
 * Higher priority incidents cause worse component status.
 */
export const INCIDENT_PRIORITY_TO_STATUS: Record<string, ComponentStatus> = {
  CRITICAL: 'MAJOR_OUTAGE',
  HIGH: 'PARTIAL_OUTAGE',
  MEDIUM: 'DEGRADED_PERFORMANCE',
  LOW: 'OPERATIONAL',
  INFO: 'OPERATIONAL'
};

// ============================================================================
// STATUS INCIDENT TYPES
// ============================================================================

/**
 * Severity levels for status incidents (user-facing).
 * Different from platform incident priority.
 */
export const STATUS_INCIDENT_SEVERITY = ['MINOR', 'MAJOR', 'CRITICAL'] as const;
export type StatusIncidentSeverity = (typeof STATUS_INCIDENT_SEVERITY)[number];

/**
 * Status incident lifecycle states.
 */
export const STATUS_INCIDENT_STATUS = [
  'INVESTIGATING',
  'IDENTIFIED',
  'MONITORING',
  'RESOLVED'
] as const;
export type StatusIncidentStatus = (typeof STATUS_INCIDENT_STATUS)[number];

// ============================================================================
// MAINTENANCE WINDOW TYPES
// ============================================================================

/**
 * Maintenance window lifecycle states.
 */
export const MAINTENANCE_STATUS = [
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[number];

// ============================================================================
// SUBSCRIBER TYPES
// ============================================================================

/**
 * Supported channels for status page subscribers.
 */
export const SUBSCRIBER_CHANNELS = ['EMAIL', 'SLACK', 'WEBHOOK'] as const;
export type SubscriberChannel = (typeof SUBSCRIBER_CHANNELS)[number];

/**
 * Events that trigger subscriber notifications.
 */
export const NOTIFY_ON_EVENTS = [
  'degraded',
  'outage',
  'maintenance',
  'resolved'
] as const;
export type NotifyOnEvent = (typeof NOTIFY_ON_EVENTS)[number];

// ============================================================================
// COMPOSITE TYPES
// ============================================================================

/**
 * Status page with computed component statuses.
 * Used for public status page display.
 */
export interface StatusPageWithComponents {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  isPublic: boolean;
  components: {
    id: string;
    name: string;
    description: string | null;
    displayOrder: number;
    currentStatus: ComponentStatus;
    statusUpdatedAt: Date;
  }[];
  overallStatus: ComponentStatus;
  updatedAt: Date;
}

/**
 * Status change notification payload for subscriber notifications.
 */
export interface StatusChangeNotification {
  statusPageId: string;
  componentId: string;
  componentName: string;
  previousStatus: ComponentStatus;
  newStatus: ComponentStatus;
  incidentId?: string;
  maintenanceId?: string;
  message?: string;
}

/**
 * Input for creating a maintenance window.
 */
export interface CreateMaintenanceWindowInput {
  componentIds: string[];
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  autoUpdateStatus: boolean;
  notifySubscribers: boolean;
  recurrenceRule?: string;
}

/**
 * Status update entry for StatusIncident updates array.
 */
export interface StatusUpdate {
  timestamp: string;
  status: StatusIncidentStatus;
  message: string;
}
