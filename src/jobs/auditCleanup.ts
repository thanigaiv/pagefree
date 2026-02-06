import { auditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';

/**
 * Run audit cleanup - removes events older than retention period
 */
export async function runAuditCleanup(retentionDays: number = 90): Promise<void> {
  try {
    const result = await auditService.cleanup(retentionDays);
    logger.info(
      { deletedCount: result.deletedCount, retentionDays },
      'Audit cleanup completed'
    );
  } catch (error) {
    logger.error({ error }, 'Audit cleanup failed');
  }
}

/**
 * Schedule audit cleanup to run daily
 * In production, this would be replaced with AWS EventBridge or similar cron scheduler
 */
export function scheduleAuditCleanup(): void {
  const runCleanup = async () => {
    await runAuditCleanup(90);
  };

  // Run once at startup after 1 minute delay
  setTimeout(runCleanup, 60 * 1000);

  // Schedule to run daily (every 24 hours)
  setInterval(runCleanup, 24 * 60 * 60 * 1000);

  logger.info('Audit cleanup scheduled to run daily');
}
