import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { prisma } from '../../config/database.js';
import { incidentService } from '../../services/incident.service.js';
import { smsReplyService } from '../../services/notification/sms-reply.service.js';
import { deliveryTracker } from '../../services/notification/delivery-tracker.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const router = Router();

// Twilio signature validation
function validateTwilioSignature(req: Request): boolean {
  const signature = req.headers['x-twilio-signature'] as string;
  if (!signature) return false;
  if (!env.TWILIO_AUTH_TOKEN || !env.API_BASE_URL) return false;

  const url = `${env.API_BASE_URL}${req.originalUrl}`;
  return twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );
}

// SMS inbound webhook (user replies)
router.post('/sms/inbound', async (req: Request, res: Response) => {
  if (!validateTwilioSignature(req)) {
    logger.warn('Invalid Twilio signature on SMS inbound');
    return res.status(403).send('Invalid signature');
  }

  const { From, Body } = req.body;

  logger.info({ from: From, body: Body }, 'Received SMS inbound');

  // Process reply
  const reply = await smsReplyService.processReply(From, Body);

  // Send reply SMS
  if (reply) {
    await smsReplyService.sendReply(From, reply);
  }

  // Respond with TwiML (empty is fine, we're sending reply separately)
  return res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

// SMS delivery status webhook
router.post('/sms/status', async (req: Request, res: Response) => {
  if (!validateTwilioSignature(req)) {
    logger.warn('Invalid Twilio signature on SMS status');
    return res.status(403).send('Invalid signature');
  }

  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

  logger.info({ messageSid: MessageSid, status: MessageStatus, errorCode: ErrorCode }, 'SMS delivery status');

  // Update delivery tracker
  const delivered = MessageStatus === 'delivered';
  const failed = ['failed', 'undelivered'].includes(MessageStatus);

  if (delivered || failed) {
    await deliveryTracker.updateFromProviderWebhook(
      MessageSid,
      'sms',
      delivered,
      failed ? (ErrorMessage || `Error ${ErrorCode}`) : undefined
    );
  }

  return res.status(200).send('OK');
});

// Voice call TwiML (initial prompt)
router.post('/voice/incident/:incidentId', async (req: Request, res: Response) => {
  if (!validateTwilioSignature(req)) {
    logger.warn('Invalid Twilio signature on voice webhook');
    return res.status(403).send('Invalid signature');
  }

  const { incidentId } = req.params;
  const { AnsweredBy } = req.body;

  // Check if voicemail
  if (AnsweredBy === 'machine_start' || AnsweredBy === 'fax') {
    logger.info({ incidentId, answeredBy: AnsweredBy }, 'Voice call answered by machine');
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This is an urgent incident notification. Please check your OnCall platform for details.</Say>
</Response>`);
  }

  // Get incident for TwiML
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { alerts: { take: 1 } }
  });

  if (!incident) {
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Incident not found. Goodbye.</Say>
</Response>`);
  }

  const baseUrl = env.API_BASE_URL || 'http://localhost:3000';

  // Build TwiML for IVR (per user decision: Press 1 ack, Press 2 details, Press 9 escalate)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${baseUrl}/webhooks/twilio/voice/incident/${incidentId}/input" timeout="10">
    <Say voice="alice">
      ${incident.priority} incident for ${incident.alerts[0]?.source || 'unknown service'}.
      ${incident.alerts[0]?.title || 'Alert triggered'}.
      Press 1 to acknowledge.
      Press 2 to hear details.
      Press 9 to escalate.
    </Say>
  </Gather>
  <Say voice="alice">We did not receive any input. Goodbye.</Say>
</Response>`;

  return res.type('text/xml').send(twiml);
});

// Voice call keypress input handler
router.post('/voice/incident/:incidentId/input', async (req: Request, res: Response) => {
  if (!validateTwilioSignature(req)) {
    logger.warn('Invalid Twilio signature on voice input');
    return res.status(403).send('Invalid signature');
  }

  const { incidentId } = req.params;
  const { Digits, From, CallSid } = req.body;

  logger.info({ incidentId, digits: Digits, from: From, callSid: CallSid }, 'Voice keypress received');

  const baseUrl = env.API_BASE_URL || 'http://localhost:3000';

  // Look up user by phone
  const user = await prisma.user.findFirst({
    where: { phone: From, isActive: true }
  });

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { alerts: { take: 1 } }
  });

  if (!incident) {
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Incident not found. Goodbye.</Say>
</Response>`);
  }

  let twiml = '';

  switch (Digits) {
    case '1':
      // Acknowledge
      if (user) {
        try {
          await incidentService.acknowledge(incidentId, user.id, { note: 'Acknowledged via phone call' });
          logger.info({ incidentId, userId: user.id }, 'Incident acknowledged via voice');
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Incident ${incidentId.slice(-6)} has been acknowledged. Thank you.</Say>
</Response>`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Failed to acknowledge: ${msg}. Goodbye.</Say>
</Response>`;
        }
      } else {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Your phone number is not registered. Goodbye.</Say>
</Response>`;
      }
      break;

    case '2':
      // Read details
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${baseUrl}/webhooks/twilio/voice/incident/${incidentId}/input" timeout="10">
    <Say voice="alice">
      ${incident.alerts[0]?.description || 'No additional details available'}.
      Alert count: ${incident.alertCount}.
      Press 1 to acknowledge, or hang up.
    </Say>
  </Gather>
  <Say voice="alice">Goodbye.</Say>
</Response>`;
      break;

    case '9':
      // Escalate (manual escalation)
      logger.info({ incidentId }, 'Manual escalation requested via voice');
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Escalating to next level. Goodbye.</Say>
</Response>`;
      // TODO: Trigger manual escalation in escalation service
      break;

    default:
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Invalid input. Goodbye.</Say>
</Response>`;
  }

  return res.type('text/xml').send(twiml);
});

// Voice call status webhook
router.post('/voice/status', async (req: Request, res: Response) => {
  if (!validateTwilioSignature(req)) {
    return res.status(403).send('Invalid signature');
  }

  const { CallSid, CallStatus, Duration } = req.body;

  logger.info({ callSid: CallSid, status: CallStatus, duration: Duration }, 'Voice call status');

  // Update delivery tracker
  const delivered = ['completed', 'answered'].includes(CallStatus);
  const failed = ['failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus);

  if (delivered || failed) {
    await deliveryTracker.updateFromProviderWebhook(
      CallSid,
      'voice',
      delivered,
      failed ? `Call ${CallStatus}` : undefined
    );
  }

  return res.status(200).send('OK');
});

export const twilioWebhooksRouter = router;
