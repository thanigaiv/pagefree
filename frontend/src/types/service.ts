/**
 * Service Types for Frontend
 *
 * TypeScript types matching the backend API responses.
 * See: src/types/service.ts (backend)
 */

// =============================================================================
// STATUS TYPES
// =============================================================================

// Service status enum matching backend
export type ServiceStatus = 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';

// =============================================================================
// CORE INTERFACES
// =============================================================================

// Service with related entities
export interface Service {
  id: string;
  name: string;
  description: string | null;
  routingKey: string;
  teamId: string;
  team: {
    id: string;
    name: string;
  };
  escalationPolicyId: string | null;
  escalationPolicy: {
    id: string;
    name: string;
  } | null;
  status: ServiceStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// INPUT TYPES FOR API MUTATIONS
// =============================================================================

// Input types for mutations
export interface CreateServiceInput {
  name: string;
  description?: string;
  routingKey: string;
  teamId: string;
  escalationPolicyId?: string;
  tags?: string[];
}

export interface UpdateServiceInput {
  name?: string;
  description?: string;
  tags?: string[];
  escalationPolicyId?: string | null;
}

export interface UpdateServiceStatusInput {
  status: ServiceStatus;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ServiceListResponse {
  services: Service[];
  total: number;
}

export interface ServiceResponse {
  service: Service;
}
