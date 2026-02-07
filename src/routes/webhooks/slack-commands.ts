import { Router, Request, Response } from 'express';
import { slackInteractionService } from '../../services/notification/slack-interaction.service.js';
import { logger } from '../../config/logger.js';

const router = Router();

// Slack sends slash commands as application/x-www-form-urlencoded
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;

  if (!signature || !timestamp) {
    logger.warn('Missing Slack signature headers');
    res.status(401).json({ error: 'Missing signature headers' });
    return;
  }

  // Get raw body for signature verification
  const rawBody = (req as any).rawBody || new URLSearchParams(req.body).toString();

  // Verify signature
  if (!slackInteractionService.verifySignature(signature, timestamp, rawBody)) {
    logger.warn('Invalid Slack signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { command, text, user_id, response_url } = req.body;

  // Acknowledge immediately
  res.status(200).json({
    response_type: 'ephemeral',
    text: 'Processing command...'
  });

  // Process command asynchronously
  try {
    await slackInteractionService.processCommand(command, text, user_id, response_url);
  } catch (error) {
    logger.error({ error, command, text }, 'Error processing Slack command');
  }
});

export const slackCommandsRouter = router;
