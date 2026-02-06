import { randomInt } from 'crypto';
import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';

type VerificationMethod = 'email' | 'sms' | 'push';

export class ContactVerificationService {
  private CODE_EXPIRY_MINUTES = 15;

  // Generate 6-digit numeric code
  private generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  // Initiate verification for a contact method
  async sendVerification(userId: string, method: VerificationMethod, value: string) {
    // Check for recent verification to prevent spam
    const recent = await prisma.contactVerification.findFirst({
      where: {
        userId,
        method,
        value,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) } // Last 1 minute
      }
    });

    if (recent) {
      throw new Error('Verification already sent recently. Please wait.');
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any existing pending verifications for this method
    await prisma.contactVerification.updateMany({
      where: {
        userId,
        method,
        verified: false
      },
      data: {
        expiresAt: new Date() // Expire immediately
      }
    });

    // Create new verification
    const verification = await prisma.contactVerification.create({
      data: {
        userId,
        method,
        value: this.maskValue(method, value), // Store masked value for security
        code,
        expiresAt
      }
    });

    // Send the actual verification message
    // Per user decision: "Independent verification required even though data comes from Okta (send test notifications)"
    let sendSuccess = false;
    try {
      sendSuccess = await this.sendVerificationMessage(method, value, code);
    } catch (error) {
      console.error(`Failed to send ${method} verification:`, error);
      // Don't throw - verification still created for retry
    }

    await auditService.log({
      action: 'contact.verification.sent',
      userId,
      metadata: {
        method,
        value: this.maskValue(method, value),
        expiresAt: expiresAt.toISOString(),
        sendSuccess
      }
    });

    return {
      id: verification.id,
      method,
      expiresAt,
      sendSuccess,
      // In dev mode, include code for testing
      ...(process.env.NODE_ENV === 'development' && { code })
    };
  }

  // Verify the code
  async verifyCode(userId: string, method: VerificationMethod, code: string) {
    const verification = await prisma.contactVerification.findFirst({
      where: {
        userId,
        method,
        code,
        verified: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!verification) {
      await auditService.log({
        action: 'contact.verification.failed',
        userId,
        metadata: { method, reason: 'invalid_or_expired_code' }
      });
      throw new Error('Invalid or expired verification code');
    }

    // Mark as verified
    await prisma.contactVerification.update({
      where: { id: verification.id },
      data: {
        verified: true,
        verifiedAt: new Date()
      }
    });

    // Update user's verification status
    const updateData: any = {};
    if (method === 'email') updateData.emailVerified = true;
    if (method === 'sms') updateData.phoneVerified = true;
    if (method === 'push') updateData.pushEnabled = true;

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    await auditService.log({
      action: 'contact.verification.completed',
      userId,
      metadata: { method }
    });

    return { success: true, method };
  }

  // Check verification status
  async getVerificationStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        phone: true,
        emailVerified: true,
        phoneVerified: true,
        pushEnabled: true,
        devices: {
          select: { id: true, platform: true }
        }
      }
    });

    if (!user) return null;

    // Per user decision: All three required for on-call engineers
    const allVerified = user.emailVerified && user.phoneVerified && user.pushEnabled;

    return {
      email: {
        value: user.email ? this.maskValue('email', user.email) : null,
        verified: user.emailVerified
      },
      phone: {
        value: user.phone ? this.maskValue('sms', user.phone) : null,
        verified: user.phoneVerified
      },
      push: {
        verified: user.pushEnabled,
        deviceCount: user.devices.length
      },
      allVerified,
      canBeOnCall: allVerified
    };
  }

  // Mask value for security
  private maskValue(method: VerificationMethod, value: string): string {
    if (method === 'email') {
      const [local, domain] = value.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    if (method === 'sms') {
      return `***${value.slice(-4)}`;
    }
    return '***';
  }

  // Send verification message using notification service
  private async sendVerificationMessage(method: VerificationMethod, value: string, code: string): Promise<boolean> {
    if (method === 'email') {
      const { subject, body } = notificationService.buildVerificationEmail(code);
      return await notificationService.sendEmail(value, subject, body);
    }

    if (method === 'sms') {
      const body = notificationService.buildVerificationSMS(code);
      return await notificationService.sendSMS(value, body);
    }

    if (method === 'push') {
      // Push verification: User must have registered device
      // This is verified by device registration, not by sending a code
      return true;
    }

    return false;
  }
}

export const contactService = new ContactVerificationService();
