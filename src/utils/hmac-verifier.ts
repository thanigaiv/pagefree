import crypto from 'crypto';

export interface HmacVerifyOptions {
  algorithm?: 'sha256' | 'sha512';
  format?: 'hex' | 'base64';
  prefix?: string;  // e.g., "sha256="
}

/**
 * Verifies HMAC signature using timing-safe comparison.
 *
 * @param payload - Raw request body (string)
 * @param signature - Signature from header
 * @param secret - Webhook secret
 * @param options - Algorithm, format, and prefix configuration
 * @returns true if signature is valid
 */
export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  options: HmacVerifyOptions = {}
): boolean {
  const {
    algorithm = 'sha256',
    format = 'hex',
    prefix = ''
  } = options;

  // Compute expected signature
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest(format);

  // Remove prefix if present (e.g., "sha256=abc123" -> "abc123")
  const receivedSignature = prefix && signature.startsWith(prefix)
    ? signature.slice(prefix.length)
    : signature;

  try {
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature, format === 'base64' ? 'base64' : 'hex'),
      Buffer.from(expectedSignature, format === 'base64' ? 'base64' : 'hex')
    );
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    // This happens with malformed signatures - return false, don't throw
    return false;
  }
}
