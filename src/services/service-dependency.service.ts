import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import type {
  ServiceDependency,
  ServiceGraph,
  ServiceGraphNode,
  ServiceGraphEdge,
  ServiceWithTeam
} from '../types/service.js';

/**
 * Service for managing service dependencies with cycle detection.
 * Supports dependency CRUD operations and graph queries for visualization.
 */
export class ServiceDependencyService {
  /**
   * Add a dependency: serviceId depends on dependsOnId (upstream).
   * Validates both services exist, rejects self-dependencies, archived services, and cycles.
   */
  async addDependency(
    serviceId: string,
    dependsOnId: string,
    userId: string
  ): Promise<ServiceWithTeam> {
    // Validate not self-dependency
    if (serviceId === dependsOnId) {
      throw new Error('A service cannot depend on itself');
    }

    // Fetch both services
    const [service, dependsOn] = await Promise.all([
      prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, teamId: true, status: true }
      }),
      prisma.service.findUnique({
        where: { id: dependsOnId },
        select: { id: true, status: true }
      })
    ]);

    if (!service) {
      throw new Error('Service not found');
    }
    if (!dependsOn) {
      throw new Error('Dependency service not found');
    }

    // Reject if either service is ARCHIVED
    if (service.status === 'ARCHIVED') {
      throw new Error('Cannot add dependencies to an archived service');
    }
    if (dependsOn.status === 'ARCHIVED') {
      throw new Error('Cannot depend on an archived service');
    }

    // Get existing edges for cycle detection
    const existingEdges = await this.getAllEdges();

    // Check if adding this dependency would create a cycle
    if (this.wouldCreateCycle(serviceId, dependsOnId, existingEdges)) {
      throw new Error('Adding this dependency would create a cycle');
    }

    // Add the dependency via Prisma connect
    const updated = await prisma.service.update({
      where: { id: serviceId },
      data: {
        dependsOn: { connect: { id: dependsOnId } }
      },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } },
        dependsOn: {
          include: { team: { select: { id: true, name: true } } }
        }
      }
    });

    // Audit log
    await auditService.log({
      action: 'service.dependency.added',
      userId,
      teamId: service.teamId,
      resourceType: 'service',
      resourceId: serviceId,
      metadata: { dependsOnId }
    });

    return updated as ServiceWithTeam;
  }

  /**
   * Remove a dependency: serviceId no longer depends on dependsOnId.
   */
  async removeDependency(
    serviceId: string,
    dependsOnId: string,
    userId: string
  ): Promise<ServiceWithTeam> {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { teamId: true }
    });

    if (!service) {
      throw new Error('Service not found');
    }

    const updated = await prisma.service.update({
      where: { id: serviceId },
      data: {
        dependsOn: { disconnect: { id: dependsOnId } }
      },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } },
        dependsOn: {
          include: { team: { select: { id: true, name: true } } }
        }
      }
    });

    // Audit log
    await auditService.log({
      action: 'service.dependency.removed',
      userId,
      teamId: service.teamId,
      resourceType: 'service',
      resourceId: serviceId,
      metadata: { dependsOnId }
    });

    return updated as ServiceWithTeam;
  }

  /**
   * Get upstream dependencies: services that this service depends on.
   */
  async getUpstream(serviceId: string): Promise<ServiceDependency[]> {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        dependsOn: {
          include: { team: { select: { id: true, name: true } } }
        }
      }
    });

    if (!service) {
      return [];
    }

    return service.dependsOn.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      team: s.team
    }));
  }

  /**
   * Get downstream dependents: services that depend on this service.
   */
  async getDownstream(serviceId: string): Promise<ServiceDependency[]> {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        dependedOnBy: {
          include: { team: { select: { id: true, name: true } } }
        }
      }
    });

    if (!service) {
      return [];
    }

    return service.dependedOnBy.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      team: s.team
    }));
  }

  /**
   * Get full connected subgraph for visualization.
   * Uses recursive traversal to find all connected services up to maxDepth.
   */
  async getGraph(serviceId: string, maxDepth: number = 10): Promise<ServiceGraph> {
    // Clamp maxDepth to reasonable bounds
    const depth = Math.min(Math.max(1, maxDepth), 20);

    // Get all connected service IDs using recursive CTE
    const connectedIds = await this.getConnectedServiceIds(serviceId, depth);

    if (connectedIds.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Fetch full service data for connected services
    const services = await prisma.service.findMany({
      where: { id: { in: connectedIds } },
      include: { team: { select: { name: true } } }
    });

    // Build nodes array
    const nodes: ServiceGraphNode[] = services.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      teamName: s.team.name,
      isFocused: s.id === serviceId
    }));

    // Get edges between connected services
    const edges = await this.getEdgesBetweenServices(connectedIds);

    return { nodes, edges };
  }

  /**
   * Get all connected service IDs using recursive CTE.
   */
  private async getConnectedServiceIds(serviceId: string, maxDepth: number): Promise<string[]> {
    // Use raw SQL for recursive CTE to traverse the dependency graph
    const result = await prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE connected AS (
        -- Start with the focal service
        SELECT id, 0 as depth FROM "Service" WHERE id = ${serviceId}

        UNION

        -- Get upstream dependencies (services this one depends on)
        SELECT sd."B" as id, c.depth + 1
        FROM "_ServiceDependency" sd
        JOIN connected c ON sd."A" = c.id
        WHERE c.depth < ${maxDepth}

        UNION

        -- Get downstream dependents (services that depend on this one)
        SELECT sd."A" as id, c.depth + 1
        FROM "_ServiceDependency" sd
        JOIN connected c ON sd."B" = c.id
        WHERE c.depth < ${maxDepth}
      )
      SELECT DISTINCT id FROM connected LIMIT 100
    `;

    return result.map((r) => r.id);
  }

  /**
   * Get edges (dependencies) between a set of services.
   */
  private async getEdgesBetweenServices(serviceIds: string[]): Promise<ServiceGraphEdge[]> {
    if (serviceIds.length === 0) {
      return [];
    }

    const result = await prisma.$queryRaw<{ A: string; B: string }[]>`
      SELECT "A", "B" FROM "_ServiceDependency"
      WHERE "A" = ANY(${serviceIds}) AND "B" = ANY(${serviceIds})
    `;

    // A depends on B, so edge goes from A (source) to B (target)
    return result.map((r) => ({
      source: r.A,
      target: r.B
    }));
  }

  /**
   * Get all existing edges in the dependency graph.
   */
  private async getAllEdges(): Promise<{ a: string; b: string }[]> {
    const result = await prisma.$queryRaw<{ A: string; B: string }[]>`
      SELECT "A", "B" FROM "_ServiceDependency"
    `;

    return result.map((r) => ({ a: r.A, b: r.B }));
  }

  /**
   * Check if adding an edge from sourceId to targetId would create a cycle.
   * Uses DFS to detect if targetId can reach sourceId through existing edges.
   *
   * Edge interpretation: A depends on B means edge A -> B
   * Cycle exists if we can reach sourceId from targetId (via existing + new edge)
   */
  private wouldCreateCycle(
    sourceId: string,
    targetId: string,
    existingEdges: { a: string; b: string }[]
  ): boolean {
    // Build adjacency map: for each service, list services it depends on
    // If A depends on B, edge goes A -> B (A in 'a', B in 'b')
    const adjacency = new Map<string, Set<string>>();

    for (const edge of existingEdges) {
      if (!adjacency.has(edge.a)) {
        adjacency.set(edge.a, new Set());
      }
      adjacency.get(edge.a)!.add(edge.b);
    }

    // Add the proposed edge: sourceId -> targetId
    if (!adjacency.has(sourceId)) {
      adjacency.set(sourceId, new Set());
    }
    adjacency.get(sourceId)!.add(targetId);

    // DFS from targetId to see if we can reach sourceId
    // If targetId can reach sourceId, then adding sourceId -> targetId creates a cycle
    const visited = new Set<string>();
    const stack: string[] = [targetId];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (current === sourceId) {
        return true; // Cycle detected
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      // Add all services that 'current' depends on to the stack
      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }

    return false; // No cycle
  }
}

export const serviceDependencyService = new ServiceDependencyService();
