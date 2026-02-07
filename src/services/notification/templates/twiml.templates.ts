import type { NotificationPayload } from '../types.js';

// Build initial call TwiML (per user decision: TTS with keypress menu)
// Press 1 to acknowledge, press 2 for details, press 9 to escalate
export function buildIncidentCallTwiml(payload: NotificationPayload, baseUrl: string): string {
  const shortId = payload.incidentId.slice(-6);
  const escalationText = payload.escalationLevel
    ? `This is escalation level ${payload.escalationLevel}. `
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${baseUrl}/webhooks/twilio/voice/incident/${payload.incidentId}/input" timeout="10">
    <Say voice="alice">
      ${escalationText}${payload.priority} incident for ${sanitizeForTts(payload.service)}.
      ${sanitizeForTts(payload.title)}.
      Press 1 to acknowledge.
      Press 2 to hear details.
      Press 9 to escalate.
    </Say>
  </Gather>
  <Say voice="alice">We did not receive any input. Goodbye.</Say>
</Response>`;
}

// Build TwiML for keypress response
export function buildKeypadResponseTwiml(
  action: 'acknowledge' | 'details' | 'escalate' | 'invalid',
  payload: NotificationPayload,
  baseUrl: string
): string {
  switch (action) {
    case 'acknowledge':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Incident ${payload.incidentId.slice(-6)} has been acknowledged. Thank you.</Say>
</Response>`;

    case 'details':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${baseUrl}/webhooks/twilio/voice/incident/${payload.incidentId}/input" timeout="10">
    <Say voice="alice">
      ${sanitizeForTts(payload.body)}.
      Alert count: ${payload.alertCount}.
      Press 1 to acknowledge, or hang up.
    </Say>
  </Gather>
  <Say voice="alice">Goodbye.</Say>
</Response>`;

    case 'escalate':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Escalating to next level. Goodbye.</Say>
</Response>`;

    case 'invalid':
    default:
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Invalid input. Goodbye.</Say>
</Response>`;
  }
}

// Sanitize text for TTS (remove special chars that confuse TTS)
function sanitizeForTts(text: string): string {
  return text
    .replace(/[<>&'"]/g, '')           // Remove XML special chars
    .replace(/[_\-\.]+/g, ' ')          // Replace common separators with spaces
    .replace(/\s+/g, ' ')               // Collapse whitespace
    .trim()
    .substring(0, 500);                 // Limit length for TTS
}
