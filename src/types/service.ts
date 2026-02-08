import { ServiceStatus } from '@prisma/client';

// Base Service type matching Prisma model
export interface Service {
  id: string;
  name: string;
  description: string | null;
  routingKey: string;
  teamId: string;
  escalationPolicyId: string | null;
  status: ServiceStatus;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Service with related entities included
export interface ServiceWithTeam extends Service {
  team: {
    id: string;
    name: string;
  };
  escalationPolicy: {
    id: string;
    name: string;
  } | null;
}

// Input for creating a service
export interface CreateServiceInput {
  name: string;
  description?: string;
  routingKey: string;
  teamId: string;  // Required per SVC-05
  escalationPolicyId?: string;
  tags?: string[];
}

// Input for updating service metadata
export interface UpdateServiceInput {
  name?: string;
  description?: string;
  tags?: string[];
  escalationPolicyId?: string | null;  // null to remove override
}

// Input for listing/filtering services
export interface ListServicesParams {
  teamId?: string;
  status?: ServiceStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

// Service dependency types (Phase 12)
export interface ServiceDependency {
  id: string;
  name: string;
  status: ServiceStatus;
  team: { id: string; name: string };
}

export interface ServiceGraphNode {
  id: string;
  name: string;
  status: ServiceStatus;
  teamName: string;
  isFocused?: boolean;
}

export interface ServiceGraphEdge {
  source: string;
  target: string;
}

export interface ServiceGraph {
  nodes: ServiceGraphNode[];
  edges: ServiceGraphEdge[];
}
