import { PrismaClient, PartnerUser } from '@prisma/client';
import { prisma } from '../config/database.js';
import { auditService } from '../services/audit.service.js';
import { CreatePartnerInput, UpdatePartnerInput, PartnerWithAccess } from '../types/partner.js';

export class PartnerService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new partner user
   */
  async create(input: CreatePartnerInput, createdById: string): Promise<PartnerUser> {
    const partner = await this.prisma.partnerUser.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        createdById,
      },
    });

    await auditService.log({
      action: 'partner.created',
      userId: createdById,
      resourceType: 'PartnerUser',
      resourceId: partner.id,
      metadata: { email: partner.email, name: partner.name },
      severity: 'INFO',
    });

    return partner;
  }

  /**
   * Get partner by ID with status page access
   */
  async getById(id: string): Promise<PartnerWithAccess | null> {
    const partner = await this.prisma.partnerUser.findUnique({
      where: { id },
      include: {
        statusPageAccess: {
          include: {
            statusPage: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!partner) return null;

    return {
      id: partner.id,
      email: partner.email,
      name: partner.name,
      isActive: partner.isActive,
      createdAt: partner.createdAt,
      statusPageAccess: partner.statusPageAccess.map((access) => ({
        statusPageId: access.statusPageId,
        statusPage: access.statusPage,
        grantedAt: access.grantedAt,
      })),
    };
  }

  /**
   * Get partner by email (for auth lookup)
   */
  async getByEmail(email: string): Promise<PartnerUser | null> {
    return this.prisma.partnerUser.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * List partners with access info
   */
  async list(options?: { isActive?: boolean }): Promise<PartnerWithAccess[]> {
    const where: { isActive?: boolean } = {};
    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const partners = await this.prisma.partnerUser.findMany({
      where,
      include: {
        statusPageAccess: {
          include: {
            statusPage: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return partners.map((partner) => ({
      id: partner.id,
      email: partner.email,
      name: partner.name,
      isActive: partner.isActive,
      createdAt: partner.createdAt,
      statusPageAccess: partner.statusPageAccess.map((access) => ({
        statusPageId: access.statusPageId,
        statusPage: access.statusPage,
        grantedAt: access.grantedAt,
      })),
    }));
  }

  /**
   * Update partner
   */
  async update(
    id: string,
    input: UpdatePartnerInput,
    updatedById: string
  ): Promise<PartnerUser> {
    const partner = await this.prisma.partnerUser.update({
      where: { id },
      data: input,
    });

    const action = input.isActive === false ? 'partner.deactivated' : 'partner.updated';

    await auditService.log({
      action,
      userId: updatedById,
      resourceType: 'PartnerUser',
      resourceId: partner.id,
      metadata: { updates: input },
      severity: 'INFO',
    });

    return partner;
  }

  /**
   * Deactivate partner (soft delete)
   */
  async deactivate(id: string, deactivatedById: string): Promise<PartnerUser> {
    const partner = await this.prisma.partnerUser.update({
      where: { id },
      data: { isActive: false },
    });

    await auditService.log({
      action: 'partner.deactivated',
      userId: deactivatedById,
      resourceType: 'PartnerUser',
      resourceId: partner.id,
      metadata: { email: partner.email },
      severity: 'INFO',
    });

    return partner;
  }
}

// Export singleton instance
export const partnerService = new PartnerService(prisma);
