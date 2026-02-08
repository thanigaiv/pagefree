/**
 * Postmortem Types for Frontend
 *
 * TypeScript types matching the backend API responses.
 * See: src/types/postmortem.ts (backend)
 */

// =============================================================================
// STATUS AND PRIORITY TYPES
// =============================================================================

export type PostmortemStatus = 'DRAFT' | 'PUBLISHED';
export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
export type ActionItemPriority = 'HIGH' | 'MEDIUM' | 'LOW';

// =============================================================================
// CORE INTERFACES
// =============================================================================

export interface Postmortem {
  id: string;
  title: string;
  content: string;
  incidentIds: string[];
  status: PostmortemStatus;
  teamId: string;
  team?: { id: string; name: string };
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  actionItems?: ActionItem[];
}

export interface ActionItem {
  id: string;
  postmortemId: string;
  title: string;
  description: string | null;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  assigneeId: string;
  assignee?: { id: string; firstName: string; lastName: string };
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Included when fetched via /me/action-items
  postmortem?: {
    id: string;
    title: string;
    team: { id: string; name: string };
  };
}

// =============================================================================
// TIMELINE TYPES
// =============================================================================

export interface PostmortemTimelineEvent {
  id: string;
  action: string;
  timestamp: string;
  userId: string | null;
  user: { id: string; firstName: string; lastName: string } | null;
  metadata: Record<string, unknown>;
  incidentId: string;
}

// =============================================================================
// INPUT TYPES FOR API MUTATIONS
// =============================================================================

export interface CreatePostmortemInput {
  title: string;
  content?: string;
  incidentIds: string[];
  teamId: string;
}

export interface UpdatePostmortemInput {
  title?: string;
  content?: string;
  incidentIds?: string[];
  status?: PostmortemStatus;
}

export interface CreateActionItemInput {
  title: string;
  description?: string;
  priority?: ActionItemPriority;
  assigneeId: string;
  dueDate?: string;
}

export interface UpdateActionItemInput {
  title?: string;
  description?: string | null;
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
  assigneeId?: string;
  dueDate?: string | null;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface PostmortemListResponse {
  postmortems: Postmortem[];
}

export interface PostmortemResponse {
  postmortem: Postmortem;
}

export interface ActionItemListResponse {
  actionItems: ActionItem[];
}

export interface ActionItemResponse {
  actionItem: ActionItem;
}

export interface PostmortemTimelineResponse {
  timeline: PostmortemTimelineEvent[];
}
