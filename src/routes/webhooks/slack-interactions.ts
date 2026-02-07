import { Router, Request, Response } from 'express';
import { slackInteractionService } from '../../services/notification/slack-interaction.service.js';
import { logger } from '../../config/logger.js';

const router = Router();

// Slack sends interactions as application/x-www-form-urlencoded with payload JSON
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;

  if (!signature || !timestamp) {
    logger.warn('Missing Slack signature headers');
    res.status(401).json({ error: 'Missing signature headers' });
    return;
  }

  // Get raw body for signature verification
  // Note: Need to ensure raw body is available (configure express middleware)
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  // Verify signature
  if (!slackInteractionService.verifySignature(signature, timestamp, rawBody)) {
    logger.warn('Invalid Slack signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Parse payload (Slack sends as form-urlencoded with payload JSON)
  let payload: any;
  try {
    payload = JSON.parse(req.body.payload || req.body);
  } catch {
    logger.warn('Invalid payload format');
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  // Acknowledge receipt immediately (Slack requires response within 3 seconds)
  res.status(200).send();

  // Process action asynchronously
  try {
    await slackInteractionService.processAction(payload);
  } catch (error) {
    logger.error({ error, payload: payload?.actions?.[0] }, 'Error processing Slack interaction');
  }
});

export const slackInteractionsRouter = router;
