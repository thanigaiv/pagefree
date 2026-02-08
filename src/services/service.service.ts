import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { ServiceStatus, Prisma } from '@prisma/client';
import type {
  CreateServiceInput,
  UpdateServiceInput,
  ListServicesParams,
  ServiceWithTeam
} from '../types/service.js';

export class ServiceService {
  // Create new service (SVC-01, SVC-05)
  async create(input: CreateServiceInput, userId: string): Promise<ServiceWithTeam> {
    const service = await prisma.service.create({
      data: {
        name: input.name,
        description: input.description,
        routingKey: input.routingKey,
        teamId: input.teamId,
        escalationPolicyId: input.escalationPolicyId,
        tags: input.tags || [],
      },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } }
      }
    });

    await auditService.log({
      action: 'service.created',
      userId,
      teamId: input.teamId,
      resourceType: 'service',
      resourceId: service.id,
      metadata: { name: service.name, routingKey: service.routingKey }
    });

    return service as ServiceWithTeam;
  }

  // Get service by ID
  async get(serviceId: string): Promise<ServiceWithTeam | null> {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } }
      }
    });

    return service as ServiceWithTeam | null;
  }

  // Get service by routing key (for Phase 13 alert routing)
  async getByRoutingKey(routingKey: string): Promise<ServiceWithTeam | null> {
    const service = await prisma.service.findUnique({
      where: { routingKey },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } }
      }
    });

    return service as ServiceWithTeam | null;
  }

  // List services with filtering (SVC-04)
  async list(params: ListServicesParams) {
    const where: Prisma.ServiceWhereInput = {};

    // Filter by team
    if (params.teamId) {
      where.teamId = params.teamId;
    }

    // Filter by status (default shows all if not specified by route)
    if (params.status) {
      where.status = params.status;
    }

    // Search by name (case insensitive)
    if (params.search) {
      where.name = { contains: params.search, mode: 'insensitive' };
    }

    // Only include services from active teams
    where.team = { isActive: true };

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        include: {
          team: { select: { id: true, name: true } },
          escalationPolicy: { select: { id: true, name: true } }
        },
        skip: params.offset || 0,
        take: params.limit || 50,
        orderBy: { name: 'asc' }
      }),
      prisma.service.count({ where })
    ]);

    return { services: services as ServiceWithTeam[], total };
  }

  // Update service metadata (SVC-02)
  async update(serviceId: string, input: UpdateServiceInput, userId: string): Promise<ServiceWithTeam | null> {
    const existing = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { teamId: true }
    });
    if (!existing) return null;

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: {
        name: input.name,
        description: input.description,
        tags: input.tags,
        escalationPolicyId: input.escalationPolicyId,
      },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } }
      }
    });

    await auditService.log({
      action: 'service.updated',
      userId,
      teamId: existing.teamId,
      resourceType: 'service',
      resourceId: service.id,
      metadata: {
        changes: Object.keys(input).filter(k => input[k as keyof UpdateServiceInput] !== undefined)
      }
    });

    return service as ServiceWithTeam;
  }

  // Update service status (SVC-03: archive or deprecate)
  async updateStatus(serviceId: string, status: ServiceStatus, userId: string): Promise<ServiceWithTeam | null> {
    const existing = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { teamId: true, status: true }
    });
    if (!existing) return null;

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: { status },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } }
      }
    });

    await auditService.log({
      action: `service.status_changed`,
      userId,
      teamId: existing.teamId,
      resourceType: 'service',
      resourceId: service.id,
      severity: status === 'ARCHIVED' ? 'HIGH' : 'INFO',
      metadata: {
        previousStatus: existing.status,
        newStatus: status
      }
    });

    return service as ServiceWithTeam;
  }
}

export const serviceService = new ServiceService();
