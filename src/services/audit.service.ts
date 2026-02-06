import { PrismaClient, AuditEvent, Prisma } from '@prisma/client';
import { AuditLogParams, AuditQueryParams } from '../types/audit.js';
import { prisma } from '../config/database.js';

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Log an audit event
   */
  async log(params: AuditLogParams): Promise<AuditEvent> {
    return this.prisma.auditEvent.create({
      data: {
        action: params.action,
        userId: params.userId,
        teamId: params.teamId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata as Prisma.InputJsonValue || Prisma.JsonNull,
        severity: params.severity || 'INFO',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        timestamp: new Date(), // Prisma stores as UTC in timestamptz column
      },
    });
  }

  /**
   * Query audit events with filters and pagination
   */
  async query(
    params: AuditQueryParams
  ): Promise<{ events: AuditEvent[]; total: number }> {
    const where: any = {};

    if (params.userId) where.userId = params.userId;
    if (params.teamId) where.teamId = params.teamId;
    if (params.action) where.action = params.action;
    if (params.resourceType) where.resourceType = params.resourceType;
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.severity) where.severity = params.severity;

    // Date range filtering
    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) where.timestamp.gte = params.startDate;
      if (params.endDate) where.timestamp.lte = params.endDate;
    }

    const limit = params.limit || 100;
    const offset = params.offset || 0;

    // Get total count for pagination
    const total = await this.prisma.auditEvent.count({ where });

    // Query events with relations
    const events = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { events, total };
  }

  /**
   * Get all audit events for a specific resource
   */
  async getByResource(
    resourceType: string,
    resourceId: string
  ): Promise<AuditEvent[]> {
    return this.prisma.auditEvent.findMany({
      where: {
        resourceType,
        resourceId,
      },
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Clean up audit events older than retention period
   */
  async cleanup(retentionDays: number = 90): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.auditEvent.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
      },
    });

    return { deletedCount: result.count };
  }
}

// Export singleton instance
export const auditService = new AuditService(prisma);
