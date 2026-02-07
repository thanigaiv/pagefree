import express from 'express';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

/**
 * Creates middleware that captures raw request body before JSON parsing.
 * Required for HMAC signature verification (parsing normalizes whitespace/order).
 *
 * @param limit - Body size limit (default: 1mb)
 * @returns Express middleware
 */
export function rawBodyCapture(limit: string = '1mb') {
  return express.json({
    limit,
    verify: (req: any, _res, buf, encoding) => {
      req.rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
    }
  });
}
