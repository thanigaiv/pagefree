import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { auditService } from '../services/audit.service.js';
import { env } from '../config/env.js';

export class PartnerAuthService {
  /**
   * Generate magic link token and send email
   * Token expires in 15 minutes per PARTNER-02
   */
  async requestLogin(email: string, ipAddress?: string, userAgent?: string): Promise<{ sent: boolean }> {
    // Find partner by email
    const partner = await prisma.partnerUser.findUnique({
      where: { email, isActive: true }
    });

    // Security: always return success to not reveal if email exists
    if (!partner) {
      return { sent: true };
    }

    // Generate cryptographically secure token (32 bytes = 256 bits)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Store hashed token with 15-minute expiry
    await prisma.partnerMagicToken.create({
      data: {
        tokenHash,
        partnerUserId: partner.id,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)  // 15 minutes
      }
    });

    // Build magic link URL
    const baseUrl = env.API_BASE_URL || `http://localhost:${env.PORT}`;
    const loginUrl = `${baseUrl}/api/partner/auth/verify/${token}`;

    // Send email using existing notification service
    await notificationService.sendEmail(
      partner.email,
      'PageFree - Your Status Page Access Link',
      this.buildMagicLinkEmailBody(partner.name, loginUrl)
    );

    // Audit log
    await auditService.log({
      action: 'partner.login.requested',
      resourceType: 'PartnerUser',
      resourceId: partner.id,
      metadata: { email: partner.email },
      ipAddress,
      userAgent,
      severity: 'INFO'
    });

    return { sent: true };
  }

  /**
   * Verify magic link token
   * Returns partner user if valid, null if invalid/expired/used
   */
  async verifyToken(token: string): Promise<{ partner: any; tokenId: string } | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const magicToken = await prisma.partnerMagicToken.findUnique({
      where: { tokenHash },
      include: { partnerUser: true }
    });

    if (!magicToken) return null;
    if (magicToken.used) return null;
    if (magicToken.expiresAt < new Date()) return null;
    if (!magicToken.partnerUser.isActive) return null;

    return { partner: magicToken.partnerUser, tokenId: magicToken.id };
  }

  /**
   * Mark token as used after successful verification
   */
  async markTokenUsed(tokenId: string): Promise<void> {
    await prisma.partnerMagicToken.update({
      where: { id: tokenId },
      data: { used: true, usedAt: new Date() }
    });
  }

  private buildMagicLinkEmailBody(partnerName: string, loginUrl: string): string {
    return `
Hello ${partnerName},

Click the link below to access your status page dashboard:

${loginUrl}

This link will expire in 15 minutes. If you didn't request this link, please ignore this email.

-- PageFree
    `.trim();
  }
}

export const partnerAuthService = new PartnerAuthService();
