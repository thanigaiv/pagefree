import { TagType, TeamRole } from '@prisma/client';

export interface CreateTeamInput {
  name: string;
  description?: string;
  tags?: { type: TagType; value: string }[];
  slackChannel?: string;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
  slackChannel?: string;
  maintenanceMode?: boolean;
  notificationDefaults?: Record<string, any>;
  escalationDefaults?: Record<string, any>;
}

export interface TeamMemberInput {
  userId: string;
  role: TeamRole;
}

export interface TeamWithMembers {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  syncedFromOkta: boolean;
  slackChannel: string | null;
  maintenanceMode: boolean;
  tags: { type: TagType; value: string }[];
  members: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: TeamRole;
    joinedAt: Date;
  }[];
  memberCount: number;
  responderCount: number;
  hasAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Predefined tag values (per user decision: organizational + technical)
export const ORGANIZATIONAL_TAGS = ['Engineering', 'Product', 'SRE', 'Security', 'Support'];
export const TECHNICAL_TAGS = ['Backend', 'Frontend', 'Mobile', 'Payments', 'Auth', 'Infrastructure', 'Data'];
