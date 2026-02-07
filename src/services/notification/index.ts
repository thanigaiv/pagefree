// Notification module exports
// All notification functionality can be imported from this single module

// Core types
export type {
  NotificationChannel,
  NotificationPayload,
  ChannelDeliveryResult,
  DeliveryStatus,
  ChannelEscalationConfig
} from './types.js';
export { DEFAULT_CHANNEL_ESCALATION } from './types.js';

// Dispatcher (main entry point for sending notifications)
export { notificationDispatcher, dispatchNotification } from './dispatcher.js';

// Delivery tracking
export { deliveryTracker } from './delivery-tracker.js';

// Channel implementations (for testing/direct access if needed)
export { emailChannel } from './channels/email.channel.js';
export { smsChannel } from './channels/sms.channel.js';
export { slackChannel } from './channels/slack.channel.js';
export { teamsChannel } from './channels/teams.channel.js';
export { pushChannel } from './channels/push.channel.js';
export { voiceChannel } from './channels/voice.channel.js';

// Interaction services
export { slackInteractionService } from './slack-interaction.service.js';
export { smsReplyService } from './sms-reply.service.js';

// Templates (for customization if needed)
export {
  buildIncidentEmailSubject,
  buildIncidentEmailHtml,
  buildIncidentEmailText
} from './templates/email.templates.js';
export {
  buildSlackIncidentBlocks,
  buildSlackAcknowledgedBlocks,
  buildSlackResolvedBlocks
} from './templates/slack.templates.js';
export {
  buildTeamsIncidentCard,
  buildTeamsAcknowledgedCard,
  buildTeamsResolvedCard
} from './templates/teams.templates.js';
export {
  buildIncidentCallTwiml,
  buildKeypadResponseTwiml
} from './templates/twiml.templates.js';
