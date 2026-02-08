// Postmortem TypeScript Types (Phase 10)

// ============================================================================
// ENUMS MATCHING PRISMA
// ============================================================================

export type PostmortemStatus = 'DRAFT' | 'PUBLISHED';
export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
export type ActionItemPriority = 'HIGH' | 'MEDIUM' | 'LOW';

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

/**
 * Valid state transitions for action items.
 * - OPEN -> IN_PROGRESS, COMPLETED
 * - IN_PROGRESS -> COMPLETED, OPEN (can reopen if blocked)
 * - COMPLETED -> OPEN (can reopen if follow-up needed)
 */
export const ACTION_ITEM_TRANSITIONS: Record<ActionItemStatus, ActionItemStatus[]> = {
  OPEN: ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS: ['COMPLETED', 'OPEN'],
  COMPLETED: ['OPEN']
};

// ============================================================================
// BASE INTERFACES
// ============================================================================

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
}

// ============================================================================
// INPUT TYPES FOR API
// ============================================================================

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
  description?: string;
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
  assigneeId?: string;
  dueDate?: string | null;
}

// ============================================================================
// TIMELINE TYPES
// ============================================================================

/**
 * Timeline event from audit service (reuse existing structure).
 * Used to display postmortem history.
 */
export interface PostmortemTimelineEvent {
  id: string;
  action: string;
  timestamp: string;
  userId: string | null;
  user: { id: string; firstName: string; lastName: string } | null;
  metadata: Record<string, unknown>;
  incidentId: string;
}
