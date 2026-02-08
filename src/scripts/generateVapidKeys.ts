/**
 * VAPID Key Generation Script
 *
 * Generates a VAPID (Voluntary Application Server Identification) key pair
 * for authenticating web push notifications.
 *
 * Usage: npx tsx src/scripts/generateVapidKeys.ts
 *
 * After running, add the generated keys to your .env file:
 *   VAPID_PUBLIC_KEY="<generated public key>"
 *   VAPID_PRIVATE_KEY="<generated private key>"
 *   VAPID_SUBJECT="mailto:oncall@yourdomain.com"
 */

import webpush from 'web-push';

function generateVapidKeys(): void {
  console.log('Generating VAPID keys for web push notifications...\n');

  const vapidKeys = webpush.generateVAPIDKeys();

  console.log('========================================');
  console.log('VAPID KEYS GENERATED SUCCESSFULLY');
  console.log('========================================\n');

  console.log('Add these to your .env file:\n');
  console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
  console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
  console.log('VAPID_SUBJECT="mailto:oncall@yourdomain.com"\n');

  console.log('========================================');
  console.log('IMPORTANT NOTES');
  console.log('========================================');
  console.log('1. Keep your PRIVATE key SECRET - never commit to git');
  console.log('2. The PUBLIC key is safe to share with clients');
  console.log('3. VAPID_SUBJECT should be a mailto: or https: URL');
  console.log('4. Generate new keys for each environment (dev, staging, prod)');
  console.log('');
}

// Export for potential programmatic use
export { generateVapidKeys };

// Run if executed directly
generateVapidKeys();
