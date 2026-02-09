import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/database.js';
import { auditService } from '../services/audit.service.js';
import { PartnerAccessGrant } from '../types/partner.js';

export class PartnerAccessService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Grant partner access to a status page
   */
  async grantAccess(
    partnerUserId: string,
    statusPageId: string,
    grantedById: string
  ): Promise<PartnerAccessGrant> {
    const access = await this.prisma.partnerStatusPageAccess.create({
      data: {
        partnerUserId,
        statusPageId,
        grantedById,
      },
      include: {
        partnerUser: {
          select: { id: true, email: true, name: true },
        },
        statusPage: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    await auditService.log({
      action: 'partner.access.granted',
      userId: grantedById,
      resourceType: 'PartnerStatusPageAccess',
      resourceId: access.id,
      metadata: { partnerUserId, statusPageId },
      severity: 'INFO',
    });

    return {
      id: access.id,
      partnerUserId: access.partnerUserId,
      statusPageId: access.statusPageId,
      grantedById: access.grantedById,
      grantedAt: access.grantedAt,
      partnerUser: access.partnerUser,
      statusPage: access.statusPage,
    };
  }

  /**
   * Revoke partner access from a status page
   */
  async revokeAccess(
    partnerUserId: string,
    statusPageId: string,
    revokedById: string
  ): Promise<boolean> {
    try {
      const access = await this.prisma.partnerStatusPageAccess.delete({
        where: {
          partnerUserId_statusPageId: {
            partnerUserId,
            statusPageId,
          },
        },
      });

      await auditService.log({
        action: 'partner.access.revoked',
        userId: revokedById,
        resourceType: 'PartnerStatusPageAccess',
        resourceId: access.id,
        metadata: { partnerUserId, statusPageId },
        severity: 'INFO',
      });

      return true;
    } catch (error) {
      // Record not found
      if ((error as any).code === 'P2025') {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all status pages a partner has access to
   */
  async listByPartner(partnerUserId: string): Promise<PartnerAccessGrant[]> {
    const accessRecords = await this.prisma.partnerStatusPageAccess.findMany({
      where: { partnerUserId },
      include: {
        statusPage: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return accessRecords.map((access) => ({
      id: access.id,
      partnerUserId: access.partnerUserId,
      statusPageId: access.statusPageId,
      grantedById: access.grantedById,
      grantedAt: access.grantedAt,
      statusPage: access.statusPage,
    }));
  }

  /**
   * List all partners who have access to a status page
   */
  async listByStatusPage(statusPageId: string): Promise<PartnerAccessGrant[]> {
    const accessRecords = await this.prisma.partnerStatusPageAccess.findMany({
      where: { statusPageId },
      include: {
        partnerUser: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return accessRecords.map((access) => ({
      id: access.id,
      partnerUserId: access.partnerUserId,
      statusPageId: access.statusPageId,
      grantedById: access.grantedById,
      grantedAt: access.grantedAt,
      partnerUser: access.partnerUser,
    }));
  }

  /**
   * Check if a partner has access to a status page (for middleware)
   */
  async hasAccess(partnerUserId: string, statusPageId: string): Promise<boolean> {
    const access = await this.prisma.partnerStatusPageAccess.findUnique({
      where: {
        partnerUserId_statusPageId: {
          partnerUserId,
          statusPageId,
        },
      },
    });

    return access !== null;
  }
}

// Export singleton instance
export const partnerAccessService = new PartnerAccessService(prisma);
