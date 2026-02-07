export interface IncidentFilters {
  status?: string[];
  priority?: string[];
  teamId?: string;
  assignedUserId?: string;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}
